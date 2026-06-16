import { ProductKind } from '@inventory/shared';
import type {
  ProductImportErrorDto,
  ProductImportPreviewDto,
  ProductImportResultDto,
  ProductImportRowDto,
  VehicleModelImportInput,
  WarehouseStockImportInput,
} from '@inventory/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  findHeaderRow,
  lastDataRow,
  normalizeHeader,
  parseInteger,
  parseNumeric,
  readCellText,
} from '../common/xlsx-import';
import {
  Brand,
  Category,
  Product,
  ProductCode,
  Stock,
  VehicleFitment,
  VehicleMake,
  VehicleModel,
  Warehouse,
} from '../database/entities';
import { InventoryMovementType } from '@inventory/shared';
import { InventoryService } from '../inventory/inventory.service';

// Columnas FIJAS de la plantilla. El parser matchea por NOMBRE de header (ver
// findHeaderRow), no por posición. El stock NO está acá: va en columnas
// DINÁMICAS, una por bodega (el header es el nombre de la bodega), detectadas
// aparte. Orden pedido por el cliente (Fase 12): primero lo de inventario, luego
// lo administrativo. La 'Observación' es una nota interna nueva.
const COLUMNS = [
  'sku',
  // Código universal opcional y único del producto. Va al lado del SKU.
  'universalCode',
  'name',
  'categoryName',
  'brandName',
  // Compatibilidad vehicular en columnas SEPARADAS. Para varios vehículos por
  // producto, cada columna acepta una lista separada por ';' ALINEADA por
  // posición. La columna combinada "Año" enumera los años del rango separados
  // por ',' (ej. "2015, 2016, 2017").
  'vehicleMake',
  'vehicleModel',
  'vehicleYears',
  // Columnas legacy de año en 2 campos separados ("Año desde"/"Año hasta"). Ya
  // no van en la plantilla nueva, pero se siguen parseando si un archivo viejo
  // las trae (fallback cuando no viene la columna combinada "Año").
  'vehicleYearFrom',
  'vehicleYearTo',
  // Columna combinada legacy ("Marca:Modelo:Año-Año; ..."). Ya no va en la
  // plantilla, pero se sigue parseando si un archivo viejo la trae.
  'vehicleModels',
  'minStock',
  'productKind',
  // Legacy: ya no van en la plantilla nueva (el cliente los eliminó), pero se
  // siguen parseando si un archivo viejo / export anterior los trae.
  'partNumber',
  'barcode',
  'compatibleCodes',
  'cost',
  'price',
  // Legacy: ya no va en la plantilla nueva (el cliente la quitó), pero se sigue
  // parseando si un archivo viejo la trae. Si viene vacía/ausente, el upsert
  // preserva la descripción actual del producto (no la pisa).
  'description',
  'observation',
  'location',
] as const;
type Column = (typeof COLUMNS)[number];

const HEADERS: Record<Column, string> = {
  sku: 'SKU',
  universalCode: 'Codigo universal',
  name: 'Nombre',
  categoryName: 'Categoría',
  brandName: 'Marca',
  vehicleMake: 'Marca de vehículo',
  vehicleModel: 'Modelo de vehículo',
  vehicleYears: 'Año',
  vehicleYearFrom: 'Año desde',
  vehicleYearTo: 'Año hasta',
  vehicleModels: 'Modelo (Marca:Modelo:Año-Año, separados por ;)',
  minStock: 'Stock mínimo',
  productKind: 'Tipo (ORIGINAL/ALTERNATIVE)',
  partNumber: 'Numero de parte',
  barcode: 'Codigo de barras',
  compatibleCodes: 'Códigos compatibles',
  cost: 'Costo (bruto)',
  price: 'Precio (bruto)',
  description: 'Descripción',
  observation: 'Observación',
  location: 'Ubicacion (deprecated)',
};

// Orden de columnas FIJAS en la plantilla descargable. Las columnas por bodega
// (dinámicas) se insertan entre las de vehículo y `minStock`. Orden: SKU →
// código universal → categoría/nombre/marca → vehículo → bodegas → admin →
// observación → códigos compatibles (al final). Igual que el export.
const TEMPLATE_BEFORE_WAREHOUSES: Column[] = [
  'sku',
  'universalCode',
  'categoryName',
  'name',
  'brandName',
  'vehicleMake',
  'vehicleModel',
  'vehicleYears',
];
const TEMPLATE_AFTER_WAREHOUSES: Column[] = [
  'minStock',
  'productKind',
  'cost',
  'price',
  'observation',
  'compatibleCodes',
];

// Alias de headers para no romper archivos viejos / exportados que traen los
// nombres anteriores. El header canónico (HEADERS) es el que escribe la
// plantilla nueva; estos también matchean al importar.
const HEADER_ALIASES: Partial<Record<Column, string[]>> = {
  compatibleCodes: [
    'Cod Compatibles',
    'Codigos compatibles (separados por ;)',
  ],
  // "PartNumber" era el header anterior — lo seguimos aceptando al importar.
  partNumber: ['PartNumber'],
  // Header global anterior (sin "(deprecated)").
  location: ['Ubicacion'],
};

// Headers que el EXPORT escribe pero que NO son columnas de bodega — hay que
// ignorarlos al detectar columnas dinámicas de stock para no crear bodegas
// fantasma al reimportar un archivo exportado o una plantilla vieja.
const NON_WAREHOUSE_HEADERS = new Set(
  [
    'Activo',
    'Stock por bodega',
    'Stock actual (total)',
    'Stock actual',
    'Bodega',
  ].map(normalizeHeader),
);

/**
 * Importador masivo de productos vía Excel (.xlsx).
 *
 * Flujo en 2 pasos:
 *
 *   1. POST /imports/products/preview → parsea + valida. Devuelve preview
 *      (primeras 10 filas válidas), conteos, lista de errores, y los nombres
 *      de categorías/marcas/marcas-de-vehículo/modelos que se crearían si el
 *      operador confirma.
 *
 *   2. POST /imports/products/confirm → ejecuta la carga real. Estrategia:
 *      - UPSERT por SKU (si existe, actualiza; si no, crea).
 *      - Categorías/marcas faltantes se crean automáticamente.
 *      - Marcas y modelos de vehículo faltantes se crean automáticamente.
 *      - Fitments del producto se reemplazan por completo (clear + insert).
 *      - Códigos compatibles se reemplazan por completo (clear + insert).
 *      - Si la fila trae `Bodega` + `Stock actual`, el stock de esa bodega
 *        se ESTABLECE al valor (delta vs stock actual) con un movimiento
 *        ADJUSTMENT cuyo motivo es "Importación masiva".
 *      - Partial success: filas inválidas se reportan pero no abortan el batch.
 *
 * También expone GET /imports/products/template.xlsx con una plantilla
 * descargable (headers + fila de ejemplo + hoja "Instrucciones").
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Brand)
    private readonly brands: Repository<Brand>,
    @InjectRepository(ProductCode)
    private readonly codes: Repository<ProductCode>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
    @InjectRepository(Stock)
    private readonly stocks: Repository<Stock>,
    @InjectRepository(VehicleMake)
    private readonly vehicleMakes: Repository<VehicleMake>,
    @InjectRepository(VehicleModel)
    private readonly vehicleModels: Repository<VehicleModel>,
    @InjectRepository(VehicleFitment)
    private readonly vehicleFitments: Repository<VehicleFitment>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly inventory: InventoryService,
  ) {}

  async preview(buffer: Buffer): Promise<ProductImportPreviewDto> {
    const parsed = await this.parseExcel(buffer);

    const skus = parsed.valid.map((r) => r.sku);
    const existing = skus.length
      ? await this.products.find({
          where: { sku: In(skus) },
          select: { id: true, sku: true },
        })
      : [];
    const existingMap = new Map(existing.map((p) => [p.sku, p.id]));

    const catNames = new Set<string>();
    const brandNames = new Set<string>();
    for (const r of parsed.valid) {
      if (r.categoryName) catNames.add(r.categoryName);
      if (r.brandName) brandNames.add(r.brandName);
    }

    const existingCats = catNames.size
      ? await this.categories.find({
          where: { name: In(Array.from(catNames)) },
          select: { name: true },
        })
      : [];
    const existingBrands = brandNames.size
      ? await this.brands.find({
          where: { name: In(Array.from(brandNames)) },
          select: { name: true },
        })
      : [];
    const existingCatNames = new Set(existingCats.map((c) => c.name));
    const existingBrandNames = new Set(existingBrands.map((b) => b.name));

    const newCategories = Array.from(catNames).filter(
      (n) => !existingCatNames.has(n),
    );
    const newBrands = Array.from(brandNames).filter(
      (n) => !existingBrandNames.has(n),
    );

    const { newWarehouses, newVehicleModels } =
      await this.collectNewEntities(parsed.valid);

    let createCount = 0;
    let updateCount = 0;
    const rowsWithAction: ProductImportRowDto[] = parsed.valid.map((r) => {
      const existingId = existingMap.get(r.sku) ?? null;
      const action: ProductImportRowDto['action'] = existingId ? 'update' : 'create';
      if (action === 'create') createCount += 1;
      else updateCount += 1;
      return { ...r, action, existingProductId: existingId };
    });

    return {
      totalRows: parsed.totalRows,
      validCount: rowsWithAction.length,
      createCount,
      updateCount,
      errorCount: parsed.errors.length,
      previewRows: rowsWithAction.slice(0, 10),
      errors: parsed.errors,
      newCategories,
      newBrands,
      newWarehouses,
      newVehicleModels,
    };
  }

  /**
   * Calcula qué bodegas y qué modelos de vehículo, referenciados por las filas
   * válidas, NO existen todavía en el sistema (y por lo tanto se crearían al
   * confirmar). Reutilizado por `preview` (para mostrarlos) y `confirm` (para
   * reportar lo creado).
   */
  private async collectNewEntities(
    rows: Omit<ProductImportRowDto, 'action' | 'existingProductId'>[],
  ): Promise<{ newWarehouses: string[]; newVehicleModels: string[] }> {
    // --- Bodegas ---
    const whNames = new Set<string>();
    for (const r of rows) {
      for (const ws of r.warehouseStocks) whNames.add(ws.warehouseName);
    }
    const existingWh = whNames.size
      ? await this.warehouses.find({
          where: { name: In(Array.from(whNames)) },
          select: { name: true },
        })
      : [];
    const existingWhNames = new Set(existingWh.map((w) => w.name));
    const newWarehouses = Array.from(whNames).filter(
      (n) => !existingWhNames.has(n),
    );

    // --- Modelos de vehículo (Marca + Modelo) ---
    const makeNames = new Set<string>();
    const modelPairs = new Map<string, { make: string; model: string }>();
    for (const r of rows) {
      for (const m of r.vehicleModels) {
        makeNames.add(m.makeName);
        modelPairs.set(`${m.makeName}::${m.modelName}`, {
          make: m.makeName,
          model: m.modelName,
        });
      }
    }
    const existingMakes = makeNames.size
      ? await this.vehicleMakes.find({
          where: { name: In(Array.from(makeNames)) },
        })
      : [];
    const makeIdByName = new Map(existingMakes.map((m) => [m.name, m.id]));
    const existingModels = existingMakes.length
      ? await this.vehicleModels.find({
          where: { makeId: In(existingMakes.map((m) => m.id)) },
        })
      : [];
    const existingModelKeys = new Set(
      existingModels.map((m) => `${m.makeId}::${m.name}`),
    );
    const newVehicleModels: string[] = [];
    for (const { make, model } of modelPairs.values()) {
      const makeId = makeIdByName.get(make);
      const exists = makeId
        ? existingModelKeys.has(`${makeId}::${model}`)
        : false;
      if (!exists) newVehicleModels.push(`${make} ${model}`);
    }

    return { newWarehouses, newVehicleModels };
  }

  async confirm(buffer: Buffer, userId: string): Promise<ProductImportResultDto> {
    const parsed = await this.parseExcel(buffer);

    const skus = parsed.valid.map((r) => r.sku);
    const existingProducts = skus.length
      ? await this.products.find({
          where: { sku: In(skus) },
          select: { id: true, sku: true },
        })
      : [];
    const existedBefore = new Set(existingProducts.map((p) => p.sku));

    // Modelos de vehículo a crear — calculados ANTES del loop (replaceFitments
    // los crea lazy por fila; este cálculo coincide con lo que terminará
    // creando y nos sirve para reportarlo en el resultado).
    const { newVehicleModels: createdVehicleModels } =
      await this.collectNewEntities(parsed.valid);

    // Auto-create categorías/marcas/bodegas faltantes.
    const catNames = new Set<string>();
    const brandNames = new Set<string>();
    const whNames = new Set<string>();
    for (const r of parsed.valid) {
      if (r.categoryName) catNames.add(r.categoryName);
      if (r.brandName) brandNames.add(r.brandName);
      for (const ws of r.warehouseStocks) whNames.add(ws.warehouseName);
    }

    const createdCategories: string[] = [];
    const createdBrands: string[] = [];
    const createdWarehouses: string[] = [];
    const catByName = new Map<string, string>();
    const brandByName = new Map<string, string>();
    const warehouseByName = new Map<string, string>();

    await this.ds.transaction(async (manager) => {
      if (catNames.size) {
        const existing = await manager.find(Category, {
          where: { name: In(Array.from(catNames)) },
        });
        for (const c of existing) catByName.set(c.name, c.id);
        for (const name of catNames) {
          if (!catByName.has(name)) {
            const c = manager.create(Category, { name, parentId: null });
            await manager.save(c);
            catByName.set(name, c.id);
            createdCategories.push(name);
          }
        }
      }
      if (brandNames.size) {
        const existing = await manager.find(Brand, {
          where: { name: In(Array.from(brandNames)) },
        });
        for (const b of existing) brandByName.set(b.name, b.id);
        for (const name of brandNames) {
          if (!brandByName.has(name)) {
            const b = manager.create(Brand, { name });
            await manager.save(b);
            brandByName.set(name, b.id);
            createdBrands.push(name);
          }
        }
      }
      if (whNames.size) {
        const existing = await manager.find(Warehouse, {
          where: { name: In(Array.from(whNames)) },
        });
        for (const w of existing) warehouseByName.set(w.name, w.id);
        for (const name of whNames) {
          if (!warehouseByName.has(name)) {
            const w = manager.create(Warehouse, { name, isActive: true });
            await manager.save(w);
            warehouseByName.set(name, w.id);
            createdWarehouses.push(name);
          }
        }
      }
    });

    const errors: ProductImportErrorDto[] = [...parsed.errors];
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = parsed.errors.length;

    for (const row of parsed.valid) {
      try {
        await this.upsertProduct(
          row,
          catByName,
          brandByName,
          warehouseByName,
          userId,
        );
        if (existedBefore.has(row.sku)) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err ?? 'unknown');
        errors.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          message,
        });
        failedCount += 1;
        this.logger.warn(
          `Row ${row.rowNumber} (SKU ${row.sku}) failed: ${message}`,
        );
      }
    }

    return {
      importedCount: createdCount + updatedCount,
      createdCount,
      updatedCount,
      failedCount,
      errors,
      createdCategories,
      createdBrands,
      createdWarehouses,
      createdVehicleModels,
    };
  }

  /**
   * Devuelve la plantilla Excel descargable con headers, 1 fila de ejemplo y
   * una segunda hoja "Instrucciones" explicando cada columna.
   */
  async generateTemplate(): Promise<Buffer> {
    const wb = new Workbook();
    wb.creator = 'Inventario';
    wb.created = new Date();

    // Bodegas activas → una columna de stock por bodega. Si todavía no hay
    // ninguna, dejamos un ejemplo "Bodega" para que el operador entienda el
    // formato (al importar, esa bodega se crea sola si no existe).
    const activeWarehouses = await this.warehouses.find({
      where: { isActive: true },
      order: { name: 'ASC' },
      select: { name: true },
    });
    const warehouseNames =
      activeWarehouses.length > 0
        ? activeWarehouses.map((w) => w.name)
        : ['Bodega'];

    const sheet = wb.addWorksheet('Productos');
    // Orden: campos antes de bodegas → columnas por bodega → campos después.
    const fixedCol = (col: Column) => ({
      header: HEADERS[col],
      key: col,
      width: Math.max(HEADERS[col].length + 2, 16),
    });
    // Dos columnas por bodega: stock + ubicación física en esa bodega. Headers
    // "Stock bodega <Nombre>" y "Ubicación bodega <Nombre>". Prefijos `wh:` /
    // `loc:` en la key para no colisionar con las keys de campos fijos.
    const warehouseCols = (name: string) => [
      {
        header: `Stock bodega ${name}`,
        key: `wh:${name}`,
        width: Math.max(name.length + 14, 16),
      },
      {
        header: `Ubicación bodega ${name}`,
        key: `loc:${name}`,
        width: Math.max(name.length + 18, 18),
      },
    ];
    sheet.columns = [
      ...TEMPLATE_BEFORE_WAREHOUSES.map(fixedCol),
      ...warehouseNames.flatMap(warehouseCols),
      ...TEMPLATE_AFTER_WAREHOUSES.map(fixedCol),
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    const exampleRow: Record<string, unknown> = {
      sku: 'FIL-AC-001',
      universalCode: 'U-00123',
      name: 'Filtro de aire Toyota Corolla 2018',
      observation: 'Revisar empaque al recibir',
      categoryName: 'Filtros',
      brandName: 'Mahle',
      cost: '8000',
      price: '15000',
      minStock: 5,
      productKind: 'ORIGINAL',
      compatibleCodes: 'A12345; B67890; XYZ-001',
      // Compatibilidad vehicular en columnas separadas. Para varios vehículos,
      // alinear por posición con ';' en cada columna. "Año" enumera los años
      // del rango separados por ',' (ej. "2014, 2015, 2016, 2017, 2018, 2019").
      vehicleMake: 'Toyota; Toyota',
      vehicleModel: 'Corolla; Yaris',
      vehicleYears: '2014, 2015, 2016, 2017, 2018, 2019; 2018, 2019, 2020',
    };
    // Stock + ubicación de ejemplo en la primera bodega.
    if (warehouseNames[0]) {
      exampleRow[`wh:${warehouseNames[0]}`] = 20;
      exampleRow[`loc:${warehouseNames[0]}`] = 'A-12-3';
    }
    sheet.addRow(exampleRow);

    const inst = wb.addWorksheet('Instrucciones');
    inst.columns = [
      { header: 'Columna', key: 'col', width: 32 },
      { header: 'Obligatoria', key: 'req', width: 12 },
      { header: 'Descripcion', key: 'desc', width: 90 },
    ];
    inst.getRow(1).font = { bold: true };
    const ROWS: Array<[string, boolean, string]> = [
      [HEADERS.sku, true, 'Codigo unico interno. Si ya existe en el sistema, se actualiza ese producto (upsert).'],
      [HEADERS.universalCode, false, 'Codigo universal del producto (opcional). Unico: no puede repetirse entre productos. Sirve para buscar el producto. Maximo 80 caracteres.'],
      [HEADERS.categoryName, false, 'Nombre de la categoria. Si no existe, se crea automaticamente.'],
      [HEADERS.name, true, 'Nombre / descripcion comercial del producto.'],
      [HEADERS.brandName, false, 'MARCA DEL PRODUCTO (fabricante del repuesto). Ej: Mahle, Bosch. Si no existe, se crea automaticamente. NO confundir con la marca del vehiculo.'],
      [HEADERS.vehicleMake, false, 'MARCA DEL VEHICULO: fabricante del auto compatible. Ej: Toyota, Nissan, Chevrolet. Si no existe, se crea automaticamente. Para varios vehiculos, separar con ";" ALINEADO con las columnas Modelo de vehiculo y Año.'],
      [HEADERS.vehicleModel, false, 'MODELO DEL VEHICULO: modelo especifico del fabricante. Ej: Corolla, Hilux, Sentra. Si no existe, se crea automaticamente. Obligatorio si cargas Marca de vehiculo. Para varios, separar con ";" alineado.'],
      [HEADERS.vehicleYears, false, 'AÑOS de compatibilidad con ese modelo: lista de años separados por coma (,). Ej: "2014, 2015, 2016, 2017, 2018, 2019". Enteros 1900-2100. Opcional (vacio = cualquier año). Si hay varios vehiculos, separar cada bloque de años con ";" alineado con Marca/Modelo de vehiculo. Se guarda como rango (minimo-maximo de la lista).'],
      ['Stock bodega <Nombre> (una por bodega)', false, 'Stock por bodega: agrega UNA COLUMNA por cada bodega, con encabezado "Stock bodega " + el nombre (ej. "Stock bodega Mercado libre"). El valor de la celda ESTABLECE el stock de esa bodega (registra un ajuste con la diferencia). Si la bodega no existe, se crea automaticamente. Celda vacia = no toca el stock de esa bodega.'],
      ['Ubicación bodega <Nombre> (una por bodega)', false, 'Ubicacion fisica del producto DENTRO de esa bodega (pasillo/estante/posicion). Maximo 30 caracteres. Va junto a la columna de stock de la misma bodega. Celda vacia = no toca la ubicacion.'],
      [HEADERS.minStock, false, 'Stock minimo. Entero >= 0. Default 0.'],
      [HEADERS.productKind, false, 'ORIGINAL o ALTERNATIVE. Default ORIGINAL.'],
      [HEADERS.cost, false, 'Costo unitario BRUTO en CLP (con IVA). Ej: 8000. Default 0. En productos existentes NO se pisa (costo autogestionado).'],
      [HEADERS.price, false, 'Precio venta BRUTO en CLP (con IVA). Ej: 15000. Default 0.'],
      [HEADERS.observation, false, 'Observacion / nota interna del producto (opcional).'],
      [HEADERS.compatibleCodes, false, 'Lista de codigos compatibles separados por punto y coma (;). Ej: "A123;B456;XYZ-789".'],
    ];
    for (const [col, req, desc] of ROWS) {
      inst.addRow({ col, req: req ? 'Si' : 'No', desc });
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ---------- helpers privados ----------

  private async parseExcel(buffer: Buffer): Promise<{
    totalRows: number;
    valid: Omit<ProductImportRowDto, 'action' | 'existingProductId'>[];
    errors: ProductImportErrorDto[];
  }> {
    const wb = new Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'archivo invalido';
      throw new BadRequestException(`No se pudo leer el Excel: ${message}`);
    }

    const sheet =
      wb.getWorksheet('Productos') ??
      wb.worksheets.find((w) => w.rowCount > 0) ??
      wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El Excel no tiene hojas.');
    }

    const found = findHeaderRow(sheet, HEADERS, ['sku', 'name'], 5, HEADER_ALIASES);
    if (!found) {
      throw new BadRequestException(
        'No encontré las columnas obligatorias "SKU" y "Nombre" en las primeras 5 filas. Descargá la plantilla nueva desde el botón "Descargar plantilla".',
      );
    }
    const { headerRowNumber, colIndex } = found;

    // Columnas DINÁMICAS de stock por bodega: una por bodega, con header
    // "Stock bodega <Nombre>" (ej. "Stock bodega Mercado libre"). Detectamos
    // las columnas que arrancan con el prefijo "Stock " y no son una columna fija
    // (Stock minimo) ni un header conocido del export (Stock actual, Stock por
    // bodega). El nombre de la bodega es lo que sigue al prefijo (la palabra
    // "bodega" intermedia es opcional); al confirmar se crea si no existe.
    const usedColIndices = new Set(
      Object.values(colIndex).filter((v): v is number => v !== undefined),
    );
    const fixedHeaderNorms = new Set<string>();
    for (const key of COLUMNS) {
      fixedHeaderNorms.add(normalizeHeader(HEADERS[key]));
      for (const alias of HEADER_ALIASES[key] ?? []) {
        fixedHeaderNorms.add(normalizeHeader(alias));
      }
    }
    // Prefijo "Stock" + (opcional) "bodega", con espacio / ":" / "-" en el medio.
    // Acepta "Stock bodega Principal" y también "Stock Principal" (compat).
    const STOCK_PREFIX_RE = /^stock\b\s*[:\-]?\s*(?:bodega\b\s*[:\-]?\s*)?/i;
    // Prefijo "Ubicación/Ubicacion" + (opcional) "bodega". Acepta "Ubicación
    // bodega Principal" y "Ubicacion Principal". El header fijo deprecado
    // "Ubicacion (deprecated)" queda excluido vía `fixedHeaderNorms`.
    const LOCATION_PREFIX_RE = /^ubicaci[oó]n\b\s*[:\-]?\s*(?:bodega\b\s*[:\-]?\s*)?/i;
    // Una entrada por bodega con el índice de su columna de stock y/o ubicación.
    const warehouseColumns: {
      name: string;
      stockColIndex?: number;
      locationColIndex?: number;
    }[] = [];
    const warehouseByName = new Map<string, (typeof warehouseColumns)[number]>();
    const ensureWarehouse = (name: string) => {
      let wc = warehouseByName.get(name);
      if (!wc) {
        wc = { name };
        warehouseByName.set(name, wc);
        warehouseColumns.push(wc);
      }
      return wc;
    };
    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.eachCell({ includeEmpty: false }, (cell, cellIdx) => {
      if (usedColIndices.has(cellIdx)) return;
      const raw = readCellText(cell).trim();
      if (raw === '') return;
      const norm = normalizeHeader(raw);
      if (!norm) return;
      if (fixedHeaderNorms.has(norm) || NON_WAREHOUSE_HEADERS.has(norm)) return;
      if (STOCK_PREFIX_RE.test(raw)) {
        const name = raw.replace(STOCK_PREFIX_RE, '').trim();
        if (name === '') return;
        ensureWarehouse(name).stockColIndex = cellIdx;
      } else if (LOCATION_PREFIX_RE.test(raw)) {
        const name = raw.replace(LOCATION_PREFIX_RE, '').trim();
        if (name === '') return;
        ensureWarehouse(name).locationColIndex = cellIdx;
      }
    });

    const valid: Omit<ProductImportRowDto, 'action' | 'existingProductId'>[] = [];
    const errors: ProductImportErrorDto[] = [];

    const lastRowNumber = lastDataRow(sheet);

    let totalDataRows = 0;
    let consecutiveEmptyRows = 0;
    const seenSkusInBatch = new Set<string>();
    const seenBarcodesInBatch = new Set<string>();
    const seenUniversalCodesInBatch = new Set<string>();

    for (let r = headerRowNumber + 1; r <= lastRowNumber; r += 1) {
      const row = sheet.getRow(r);
      const cellText = (col: Column): string => {
        const idx = colIndex[col];
        if (idx === undefined) return '';
        return readCellText(row.getCell(idx));
      };

      const isFullyEmpty =
        COLUMNS.every((col) => cellText(col) === '') &&
        warehouseColumns.every(
          (wc) =>
            (wc.stockColIndex === undefined ||
              readCellText(row.getCell(wc.stockColIndex)) === '') &&
            (wc.locationColIndex === undefined ||
              readCellText(row.getCell(wc.locationColIndex)) === ''),
        );
      if (isFullyEmpty) {
        consecutiveEmptyRows += 1;
        if (consecutiveEmptyRows >= 50) break;
        continue;
      }
      consecutiveEmptyRows = 0;
      totalDataRows += 1;

      const sku = cellText('sku');
      const name = cellText('name');

      if (sku === '') {
        errors.push({ rowNumber: r, sku: null, message: 'SKU vacío' });
        continue;
      }
      if (name === '') {
        errors.push({ rowNumber: r, sku, message: 'Nombre vacío' });
        continue;
      }
      if (sku.length > 60) {
        errors.push({
          rowNumber: r,
          sku,
          message: `SKU supera 60 caracteres (tiene ${sku.length})`,
        });
        continue;
      }
      if (name.length > 200) {
        errors.push({
          rowNumber: r,
          sku,
          message: `Nombre supera 200 caracteres (tiene ${name.length})`,
        });
        continue;
      }
      if (seenSkusInBatch.has(sku)) {
        errors.push({
          rowNumber: r,
          sku,
          message: `SKU "${sku}" aparece más de una vez en el Excel`,
        });
        continue;
      }
      seenSkusInBatch.add(sku);

      const barcode = cellText('barcode');
      if (barcode !== '') {
        if (seenBarcodesInBatch.has(barcode)) {
          errors.push({
            rowNumber: r,
            sku,
            message: `Código de barras "${barcode}" aparece más de una vez en el Excel`,
          });
          continue;
        }
        seenBarcodesInBatch.add(barcode);
      }

      // Código universal: opcional pero único. Validamos longitud y que no se
      // repita dentro del mismo Excel (el conflicto contra la base lo atrapa el
      // índice UNIQUE al guardar y se reporta por fila).
      const universalCode = cellText('universalCode');
      if (universalCode !== '') {
        if (universalCode.length > 80) {
          errors.push({
            rowNumber: r,
            sku,
            message: `Código universal supera 80 caracteres (tiene ${universalCode.length})`,
          });
          continue;
        }
        if (seenUniversalCodesInBatch.has(universalCode)) {
          errors.push({
            rowNumber: r,
            sku,
            message: `Código universal "${universalCode}" aparece más de una vez en el Excel`,
          });
          continue;
        }
        seenUniversalCodesInBatch.add(universalCode);
      }

      const costRaw = cellText('cost');
      const priceRaw = cellText('price');
      const minStockRaw = cellText('minStock');
      const cost = parseNumeric(costRaw);
      const price = parseNumeric(priceRaw);
      const minStock = parseInteger(minStockRaw);

      if (cost === null && costRaw !== '') {
        errors.push({
          rowNumber: r,
          sku,
          message: `Costo no es un número válido: "${costRaw}"`,
        });
        continue;
      }
      if (price === null && priceRaw !== '') {
        errors.push({
          rowNumber: r,
          sku,
          message: `Precio no es un número válido: "${priceRaw}"`,
        });
        continue;
      }
      if (minStock === null && minStockRaw !== '') {
        errors.push({
          rowNumber: r,
          sku,
          message: `Stock mínimo no es entero válido: "${minStockRaw}"`,
        });
        continue;
      }
      if (cost !== null && cost < 0) {
        errors.push({ rowNumber: r, sku, message: 'Costo no puede ser negativo' });
        continue;
      }
      if (price !== null && price < 0) {
        errors.push({ rowNumber: r, sku, message: 'Precio no puede ser negativo' });
        continue;
      }

      const kindRaw = cellText('productKind').toUpperCase();
      let productKind: 'ORIGINAL' | 'ALTERNATIVE' | null = null;
      if (kindRaw === '' || kindRaw === 'ORIGINAL' || kindRaw === 'OEM') {
        productKind = ProductKind.ORIGINAL as 'ORIGINAL';
      } else if (
        kindRaw === 'ALTERNATIVE' ||
        kindRaw === 'ALTERNATIVO' ||
        kindRaw === 'ALTERNATIVA'
      ) {
        productKind = ProductKind.ALTERNATIVE as 'ALTERNATIVE';
      } else {
        errors.push({
          rowNumber: r,
          sku,
          message: `Tipo inválido: "${kindRaw}". Use ORIGINAL o ALTERNATIVE.`,
        });
        continue;
      }

      const codesRaw = cellText('compatibleCodes');
      const compatibleCodes = codesRaw
        .split(/[;,]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const longCode = compatibleCodes.find((c) => c.length > 80);
      if (longCode) {
        errors.push({
          rowNumber: r,
          sku,
          message: `Código compatible "${longCode}" supera 80 caracteres`,
        });
        continue;
      }
      const compatibleCodesUnique = Array.from(new Set(compatibleCodes));

      // Compatibilidad vehicular. Formato NUEVO: columnas separadas
      // (Marca de vehiculo / Modelo de vehiculo / Año). Para varios vehículos,
      // cada columna trae una lista separada por ';' ALINEADA por posición
      // (índice 0 con índice 0, etc.). La columna "Año" trae, por vehículo, la
      // lista de años separados por ',' (ej. "2015, 2016, 2017") — se guarda
      // como rango [min, max]. Si no viene "Año", se aceptan las columnas legacy
      // "Año desde"/"Año hasta". Si no vienen las columnas separadas, se acepta
      // la columna combinada legacy "Marca:Modelo:Año-Año; ...".
      const vehicleModels: VehicleModelImportInput[] = [];
      let modelsError: string | null = null;

      const yearValid = (n: number) =>
        Number.isInteger(n) && n >= 1900 && n <= 2100;

      const makeCell = cellText('vehicleMake');
      const modelCell = cellText('vehicleModel');
      const yearsCell = cellText('vehicleYears');
      const yearFromCell = cellText('vehicleYearFrom');
      const yearToCell = cellText('vehicleYearTo');
      const hasYearsCombined = yearsCell !== '';
      const hasSeparated =
        makeCell !== '' ||
        modelCell !== '' ||
        yearsCell !== '' ||
        yearFromCell !== '' ||
        yearToCell !== '';

      if (hasSeparated) {
        const split = (s: string) => s.split(';').map((x) => x.trim());
        const makes = split(makeCell);
        const models = split(modelCell);
        const yearSegs = hasYearsCombined ? split(yearsCell) : [];
        const froms = split(yearFromCell);
        const tos = split(yearToCell);
        // BROADCAST: el cliente carga UNA marca y varios modelos (ej. marca
        // "MX" + modelos "T60 2.0; V80 2.0; G10 2.0"). Si una columna trae un
        // único valor, se aplica a TODOS los modelos. Los MODELOS no se
        // broadcastean: cada posición es un vehículo distinto. Los años son
        // opcionales: vacío = cualquier año.
        const bcast = (arr: string[], i: number) =>
          (arr.length === 1 ? (arr[0] ?? '') : (arr[i] ?? '')).trim();
        const count = Math.max(makes.length, models.length);
        for (let i = 0; i < count; i += 1) {
          const mk = bcast(makes, i);
          const md = (models[i] ?? '').trim();
          const yearsSeg = hasYearsCombined ? bcast(yearSegs, i) : '';
          const yf = bcast(froms, i);
          const yt = bcast(tos, i);
          // Posición sin modelo (ej. ";" al final o un hueco): no es un
          // vehículo, se ignora aunque la marca venga por broadcast.
          if (md === '') continue;
          if (mk === '') {
            modelsError = `Vehículo #${i + 1}: "Marca de vehiculo" y "Modelo de vehiculo" son obligatorios (revisá que las columnas estén alineadas con ";").`;
            break;
          }
          let yearFrom: number | null = null;
          let yearTo: number | null = null;
          if (hasYearsCombined) {
            // Lista de años separados por "," → se guarda el rango [min, max].
            if (yearsSeg !== '') {
              const years = yearsSeg
                .split(',')
                .map((y) => y.trim())
                .filter(Boolean)
                .map((y) => Number(y));
              const bad = years.find((n) => !yearValid(n));
              if (bad !== undefined) {
                modelsError = `"Año" inválido para "${mk} ${md}": "${yearsSeg}" (use años enteros 1900-2100 separados por ",").`;
                break;
              }
              if (years.length > 0) {
                yearFrom = Math.min(...years);
                yearTo = Math.max(...years);
              }
            }
          } else {
            if (yf !== '') {
              const n = Number(yf);
              if (!yearValid(n)) {
                modelsError = `"Año desde" inválido para "${mk} ${md}": "${yf}".`;
                break;
              }
              yearFrom = n;
            }
            if (yt !== '') {
              const n = Number(yt);
              if (!yearValid(n)) {
                modelsError = `"Año hasta" inválido para "${mk} ${md}": "${yt}".`;
                break;
              }
              yearTo = n;
            }
            if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
              modelsError = `"Año desde" > "Año hasta" para "${mk} ${md}".`;
              break;
            }
          }
          vehicleModels.push({ makeName: mk, modelName: md, yearFrom, yearTo });
        }
      } else {
        // Legacy combinado: "Marca:Modelo[:AñoFrom-AñoTo]; ..."
        const modelsRaw = cellText('vehicleModels');
        if (modelsRaw !== '') {
          for (const token of modelsRaw
            .split(';')
            .map((t) => t.trim())
            .filter(Boolean)) {
            const parts = token.split(':').map((p) => p.trim());
            if (parts.length < 2 || parts.length > 3) {
              modelsError = `Modelo "${token}" inválido. Esperado "Marca:Modelo" o "Marca:Modelo:Año-Año".`;
              break;
            }
            const [makeName, modelName, yearRange] = parts;
            if (!makeName || !modelName) {
              modelsError = `Modelo "${token}" tiene Marca o Modelo vacío.`;
              break;
            }
            let yearFrom: number | null = null;
            let yearTo: number | null = null;
            if (yearRange) {
              const [fromStr, toStr] = yearRange.split('-').map((s) => s.trim());
              if (fromStr) {
                const n = Number(fromStr);
                if (!yearValid(n)) {
                  modelsError = `Año "from" inválido en "${token}".`;
                  break;
                }
                yearFrom = n;
              }
              if (toStr) {
                const n = Number(toStr);
                if (!yearValid(n)) {
                  modelsError = `Año "to" inválido en "${token}".`;
                  break;
                }
                yearTo = n;
              }
              if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
                modelsError = `Año "from" > "to" en "${token}".`;
                break;
              }
            }
            vehicleModels.push({ makeName, modelName, yearFrom, yearTo });
          }
        }
      }
      if (modelsError) {
        errors.push({ rowNumber: r, sku, message: modelsError });
        continue;
      }

      // Stock + ubicación por bodega: hasta dos columnas por bodega
      // ("Stock bodega X" / "Ubicación bodega X"). El stock con valor ESTABLECE
      // el stock de esa bodega; la ubicación con valor setea el locationCode.
      // Celda vacía = no toca ese campo.
      const warehouseStocks: WarehouseStockImportInput[] = [];
      let stockError: string | null = null;
      for (const wc of warehouseColumns) {
        const stockRaw =
          wc.stockColIndex !== undefined
            ? readCellText(row.getCell(wc.stockColIndex))
            : '';
        const locRaw =
          wc.locationColIndex !== undefined
            ? readCellText(row.getCell(wc.locationColIndex)).trim()
            : '';
        if (stockRaw === '' && locRaw === '') continue;
        let quantity: number | null = null;
        if (stockRaw !== '') {
          const n = parseInteger(stockRaw);
          if (n === null || n < 0) {
            stockError = `Stock de la bodega "${wc.name}" inválido: "${stockRaw}" (debe ser entero ≥ 0)`;
            break;
          }
          quantity = n;
        }
        if (locRaw.length > 30) {
          stockError = `Ubicación de la bodega "${wc.name}" supera 30 caracteres: "${locRaw}"`;
          break;
        }
        warehouseStocks.push({
          warehouseName: wc.name,
          quantity,
          locationCode: locRaw !== '' ? locRaw : null,
        });
      }
      if (stockError) {
        errors.push({ rowNumber: r, sku, message: stockError });
        continue;
      }

      valid.push({
        rowNumber: r,
        sku,
        name,
        partNumber: cellText('partNumber') || null,
        barcode: barcode || null,
        universalCode: universalCode || null,
        description: cellText('description') || null,
        observation: cellText('observation') || null,
        categoryName: cellText('categoryName') || null,
        brandName: cellText('brandName') || null,
        cost: cost !== null ? cost.toFixed(2) : null,
        price: price !== null ? price.toFixed(2) : null,
        minStock,
        location: cellText('location') || null,
        productKind,
        compatibleCodes: compatibleCodesUnique,
        vehicleModels,
        warehouseStocks,
      });
    }

    return { totalRows: totalDataRows, valid, errors };
  }

  private async upsertProduct(
    row: Omit<ProductImportRowDto, 'action' | 'existingProductId'>,
    catByName: Map<string, string>,
    brandByName: Map<string, string>,
    warehouseByName: Map<string, string>,
    userId: string,
  ): Promise<void> {
    const categoryId = row.categoryName ? catByName.get(row.categoryName) ?? null : null;
    const brandId = row.brandName ? brandByName.get(row.brandName) ?? null : null;

    // Resolver las bodegas de las columnas de stock/ubicación. `warehouseByName`
    // ya trae las bodegas existentes + las recién creadas (ver confirm). Si por
    // alguna razón falta una, fallamos con un error claro.
    const stockTargets: {
      warehouseId: string;
      quantity: number | null;
      locationCode: string | null;
    }[] = [];
    for (const ws of row.warehouseStocks) {
      const whId = warehouseByName.get(ws.warehouseName);
      if (!whId) {
        throw new Error(`Bodega "${ws.warehouseName}" no encontrada.`);
      }
      stockTargets.push({
        warehouseId: whId,
        quantity: ws.quantity,
        locationCode: ws.locationCode,
      });
    }

    const productId = await this.ds.transaction(async (manager) => {
      const existing = await manager.findOne(Product, {
        where: { sku: row.sku },
      });
      const patch: Partial<Product> = {
        sku: row.sku,
        name: row.name,
        partNumber: row.partNumber,
        barcode: row.barcode,
        // Código universal: único. Si la celda viene vacía se PRESERVA el valor
        // actual (no se pisa con null) — el export siempre lo incluye, así que
        // un round-trip lo conserva. El conflicto contra otro producto lo atrapa
        // el índice UNIQUE y se reporta como error de esa fila.
        universalCode: row.universalCode ?? existing?.universalCode ?? null,
        // 'Descripción' ya NO va en la plantilla nueva (el cliente la quitó del
        // import). Si un archivo viejo todavía la trae se respeta; si la celda
        // viene vacía/ausente, se PRESERVA la descripción actual (no se pisa).
        description: row.description ?? existing?.description ?? null,
        observation: row.observation,
        categoryId,
        brandId,
        // El costo es AUTOGESTIONADO por el motor de costo ponderado (lotes). En
        // un producto existente NUNCA se pisa desde el import (evita destruir el
        // ponderado al reimportar un export). En alta nueva se usa como costo
        // inicial de partida.
        cost: existing ? existing.cost : (row.cost ?? '0'),
        // Precio, stock mínimo y tipo se PRESERVAN si la celda viene vacía, así
        // reimportar un archivo que no trae esas columnas no las deja en 0.
        price: row.price ?? existing?.price ?? '0',
        minStock: row.minStock ?? existing?.minStock ?? 0,
        location: row.location,
        productKind: (row.productKind ??
          existing?.productKind ??
          'ORIGINAL') as 'ORIGINAL' | 'ALTERNATIVE',
        isActive: existing?.isActive ?? true,
      };

      let pid: string;
      if (existing) {
        await manager.update(Product, { id: existing.id }, patch);
        pid = existing.id;
      } else {
        const created = manager.create(Product, patch);
        await manager.save(created);
        pid = created.id;
      }

      // Códigos compatibles: estrategia replace.
      await manager.delete(ProductCode, { productId: pid, kind: 'COMPATIBLE' });
      for (const code of row.compatibleCodes) {
        const entry = manager.create(ProductCode, {
          productId: pid,
          code,
          kind: 'COMPATIBLE' as 'COMPATIBLE',
        });
        await manager.save(entry);
      }

      // Fitments (compatibilidad vehicular): estrategia replace + auto-create
      // de marcas/modelos faltantes.
      await this.replaceFitments(manager, pid, row.vehicleModels);

      return pid;
    });

    // Ajuste de stock por bodega — se hace FUERA de la transacción anterior
    // porque `applyMovement` administra su propia atomicidad (movimiento +
    // upsert de stocks). El delta puede ser positivo o negativo según el
    // stock previo. Una entrada por cada columna de bodega con valor.
    for (const target of stockTargets) {
      if (target.quantity !== null) {
        await this.setStockToTarget(
          productId,
          target.warehouseId,
          target.quantity,
          userId,
          // El costo del Excel (si vino) se usa como costo unitario del stock que
          // INGRESA por este ajuste → se integra al ponderado (WAC). Para salidas
          // (delta < 0) el motor lo ignora y consume lotes FIFO.
          row.cost,
        );
      }
      // La ubicación por bodega se setea aparte del stock (puede venir sola).
      if (target.locationCode !== null) {
        await this.setWarehouseLocation(
          productId,
          target.warehouseId,
          target.locationCode,
        );
      }
    }
  }

  /**
   * Setea el `locationCode` (ubicación física) de un producto en una bodega.
   * Si todavía no existe un registro de stock para ese par producto/bodega,
   * lo crea con cantidad 0 (solo para guardar la ubicación). No registra
   * ningún movimiento de inventario.
   */
  private async setWarehouseLocation(
    productId: string,
    warehouseId: string,
    locationCode: string,
  ): Promise<void> {
    const existing = await this.stocks.findOne({
      where: { productId, warehouseId },
    });
    if (existing) {
      existing.locationCode = locationCode;
      await this.stocks.save(existing);
    } else {
      const stock = this.stocks.create({
        productId,
        warehouseId,
        quantity: 0,
        locationCode,
      });
      await this.stocks.save(stock);
    }
  }

  private async replaceFitments(
    manager: EntityManager,
    productId: string,
    models: VehicleModelImportInput[],
  ): Promise<void> {
    await manager.delete(VehicleFitment, { productId });
    if (models.length === 0) return;

    // Cachés para no consultar dos veces la misma marca/modelo dentro de
    // un mismo upsert (caso típico: mismo modelo varios años).
    const makeByName = new Map<string, string>();
    const modelByKey = new Map<string, string>(); // `${makeId}::${modelName}` → modelId

    for (const m of models) {
      let makeId = makeByName.get(m.makeName);
      if (!makeId) {
        let existing = await manager.findOne(VehicleMake, {
          where: { name: m.makeName },
        });
        if (!existing) {
          existing = manager.create(VehicleMake, { name: m.makeName });
          await manager.save(existing);
        }
        makeId = existing.id;
        makeByName.set(m.makeName, makeId);
      }
      const key = `${makeId}::${m.modelName}`;
      let modelId = modelByKey.get(key);
      if (!modelId) {
        let existingModel = await manager.findOne(VehicleModel, {
          where: { makeId, name: m.modelName },
        });
        if (!existingModel) {
          existingModel = manager.create(VehicleModel, {
            makeId,
            name: m.modelName,
          });
          await manager.save(existingModel);
        }
        modelId = existingModel.id;
        modelByKey.set(key, modelId);
      }
      const fitment = manager.create(VehicleFitment, {
        productId,
        modelId,
        yearFrom: m.yearFrom,
        yearTo: m.yearTo,
      });
      await manager.save(fitment);
    }
  }

  /**
   * Establece el stock de un producto en una bodega al valor `target`.
   * Calcula el delta vs el stock actual y registra un movimiento
   * ADJUSTMENT con ese delta (motivo: "Importación masiva"). Si el stock
   * ya coincide con `target`, no inserta nada (no ensucia el Kardex).
   */
  private async setStockToTarget(
    productId: string,
    warehouseId: string,
    target: number,
    userId: string,
    unitCost?: string | null,
  ): Promise<void> {
    const current = await this.stocks.findOne({
      where: { productId, warehouseId },
    });
    const currentQty = current?.quantity ?? 0;
    const delta = target - currentQty;
    if (delta === 0) return;
    await this.ds.transaction(async (manager) => {
      await this.inventory.applyMovement(manager, {
        productId,
        warehouseId,
        type: InventoryMovementType.ADJUSTMENT,
        qty: delta,
        // Solo aplica a entradas (delta > 0): es el costo del lote que se crea.
        unitCost: delta > 0 ? unitCost ?? null : null,
        reference: 'ProductImport',
        refId: null,
        userId,
      });
    });
  }
}
