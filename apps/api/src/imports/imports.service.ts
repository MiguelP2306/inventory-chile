import { ProductKind } from '@inventory/shared';
import type {
  ProductImportErrorDto,
  ProductImportPreviewDto,
  ProductImportResultDto,
  ProductImportRowDto,
  VehicleModelImportInput,
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

const COLUMNS = [
  'sku',
  'partNumber',
  'barcode',
  'name',
  'description',
  'categoryName',
  'brandName',
  'cost',
  'price',
  'minStock',
  'location',
  'productKind',
  'compatibleCodes',
  'vehicleModels',
  'warehouseName',
  'stockQuantity',
] as const;
type Column = (typeof COLUMNS)[number];

const HEADERS: Record<Column, string> = {
  sku: 'SKU',
  partNumber: 'PartNumber',
  barcode: 'Codigo de barras',
  name: 'Nombre',
  description: 'Descripcion',
  categoryName: 'Categoria',
  brandName: 'Marca',
  cost: 'Costo (bruto)',
  price: 'Precio (bruto)',
  minStock: 'Stock minimo',
  location: 'Ubicacion (deprecated)',
  productKind: 'Tipo (ORIGINAL/ALTERNATIVE)',
  compatibleCodes: 'Codigos compatibles (separados por ;)',
  vehicleModels: 'Modelo (Marca:Modelo:Año-Año, separados por ;)',
  warehouseName: 'Bodega',
  stockQuantity: 'Stock actual',
};

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
    };
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

    // Auto-create categorías/marcas faltantes.
    const catNames = new Set<string>();
    const brandNames = new Set<string>();
    for (const r of parsed.valid) {
      if (r.categoryName) catNames.add(r.categoryName);
      if (r.brandName) brandNames.add(r.brandName);
    }

    const createdCategories: string[] = [];
    const createdBrands: string[] = [];
    const catByName = new Map<string, string>();
    const brandByName = new Map<string, string>();

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
    });

    const errors: ProductImportErrorDto[] = [...parsed.errors];
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = parsed.errors.length;

    for (const row of parsed.valid) {
      try {
        await this.upsertProduct(row, catByName, brandByName, userId);
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

    const sheet = wb.addWorksheet('Productos');
    sheet.columns = COLUMNS.map((col) => ({
      header: HEADERS[col],
      key: col,
      width: Math.max(HEADERS[col].length + 2, 16),
    }));
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    sheet.addRow({
      sku: 'FIL-AC-001',
      partNumber: 'A12345',
      barcode: '7891234567890',
      name: 'Filtro de aire Toyota Corolla 2018',
      description: 'Filtro de aire para motor 1.8L',
      categoryName: 'Filtros',
      brandName: 'Mahle',
      cost: '8000',
      price: '15000',
      minStock: 5,
      location: '',
      productKind: 'ORIGINAL',
      compatibleCodes: 'A12345; B67890; XYZ-001',
      vehicleModels: 'Toyota:Corolla:2014-2019; Toyota:Yaris:2018-',
      warehouseName: 'Principal',
      stockQuantity: 20,
    });

    const inst = wb.addWorksheet('Instrucciones');
    inst.columns = [
      { header: 'Columna', key: 'col', width: 32 },
      { header: 'Obligatoria', key: 'req', width: 12 },
      { header: 'Descripcion', key: 'desc', width: 90 },
    ];
    inst.getRow(1).font = { bold: true };
    const ROWS: Array<[Column, boolean, string]> = [
      ['sku', true, 'Codigo unico interno. Si ya existe en el sistema, se actualiza ese producto (upsert).'],
      ['partNumber', false, 'Codigo de pieza del fabricante. Indexado para busqueda.'],
      ['barcode', false, 'Codigo de barras del producto. Indexado para escanner.'],
      ['name', true, 'Nombre comercial del producto.'],
      ['description', false, 'Descripcion larga (opcional).'],
      ['categoryName', false, 'Nombre de la categoria. Si no existe, se crea automaticamente.'],
      ['brandName', false, 'Nombre de la marca. Si no existe, se crea automaticamente.'],
      ['cost', false, 'Costo unitario BRUTO en CLP (con IVA). Ej: 8000. Default 0.'],
      ['price', false, 'Precio venta BRUTO en CLP (con IVA). Ej: 15000. Default 0.'],
      ['minStock', false, 'Stock minimo. Entero >= 0. Default 0.'],
      ['location', false, 'Deprecated desde Fase 7.5. Usar locationCode por bodega desde /inventario.'],
      ['productKind', false, 'ORIGINAL o ALTERNATIVE. Default ORIGINAL.'],
      ['compatibleCodes', false, 'Lista de codigos compatibles separados por punto y coma (;). Ej: "A123;B456;XYZ-789".'],
      ['vehicleModels', false, 'Compatibilidad vehicular separada por ";". Cada item es "Marca:Modelo" o "Marca:Modelo:AnioFrom-AnioTo". Marcas/modelos faltantes se crean automaticamente. Ej: "Toyota:Corolla:2014-2019; Toyota:Yaris:2018-".'],
      ['warehouseName', false, 'Nombre exacto de la bodega para asignar stock. Si no existe, la fila se rechaza (la bodega NO se crea sola). Vacio = no toca stock.'],
      ['stockQuantity', false, 'Stock actual a ESTABLECER en la bodega indicada (registra un ADJUSTMENT con la diferencia). Requiere Bodega para tener efecto.'],
    ];
    for (const [col, req, desc] of ROWS) {
      inst.addRow({ col: HEADERS[col], req: req ? 'Si' : 'No', desc });
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

    const found = findHeaderRow(sheet, HEADERS, ['sku', 'name']);
    if (!found) {
      throw new BadRequestException(
        'No encontré las columnas obligatorias "SKU" y "Nombre" en las primeras 5 filas. Descargá la plantilla nueva desde el botón "Descargar plantilla".',
      );
    }
    const { headerRowNumber, colIndex } = found;

    const valid: Omit<ProductImportRowDto, 'action' | 'existingProductId'>[] = [];
    const errors: ProductImportErrorDto[] = [];

    const lastRowNumber = lastDataRow(sheet);

    let totalDataRows = 0;
    let consecutiveEmptyRows = 0;
    const seenSkusInBatch = new Set<string>();
    const seenBarcodesInBatch = new Set<string>();

    for (let r = headerRowNumber + 1; r <= lastRowNumber; r += 1) {
      const row = sheet.getRow(r);
      const cellText = (col: Column): string => {
        const idx = colIndex[col];
        if (idx === undefined) return '';
        return readCellText(row.getCell(idx));
      };

      const isFullyEmpty = COLUMNS.every((col) => cellText(col) === '');
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

      // Modelos de vehículo compatibles: "Marca:Modelo[:AñoFrom-AñoTo]"
      const modelsRaw = cellText('vehicleModels');
      const vehicleModels: VehicleModelImportInput[] = [];
      let modelsError: string | null = null;
      if (modelsRaw !== '') {
        for (const token of modelsRaw.split(';').map((t) => t.trim()).filter(Boolean)) {
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
              if (!Number.isInteger(n) || n < 1900 || n > 2100) {
                modelsError = `Año "from" inválido en "${token}".`;
                break;
              }
              yearFrom = n;
            }
            if (toStr) {
              const n = Number(toStr);
              if (!Number.isInteger(n) || n < 1900 || n > 2100) {
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
      if (modelsError) {
        errors.push({ rowNumber: r, sku, message: modelsError });
        continue;
      }

      // Bodega + stock
      const warehouseNameRaw = cellText('warehouseName');
      const stockQtyRaw = cellText('stockQuantity');
      let stockQuantity: number | null = null;
      if (stockQtyRaw !== '') {
        const n = parseInteger(stockQtyRaw);
        if (n === null || n < 0) {
          errors.push({
            rowNumber: r,
            sku,
            message: `Stock actual inválido: "${stockQtyRaw}" (debe ser entero ≥ 0)`,
          });
          continue;
        }
        stockQuantity = n;
      }
      if (stockQuantity !== null && warehouseNameRaw === '') {
        errors.push({
          rowNumber: r,
          sku,
          message: 'Se cargó "Stock actual" pero falta "Bodega"',
        });
        continue;
      }

      valid.push({
        rowNumber: r,
        sku,
        name,
        partNumber: cellText('partNumber') || null,
        barcode: barcode || null,
        description: cellText('description') || null,
        categoryName: cellText('categoryName') || null,
        brandName: cellText('brandName') || null,
        cost: cost !== null ? cost.toFixed(2) : null,
        price: price !== null ? price.toFixed(2) : null,
        minStock,
        location: cellText('location') || null,
        productKind,
        compatibleCodes: compatibleCodesUnique,
        vehicleModels,
        warehouseName: warehouseNameRaw || null,
        stockQuantity,
      });
    }

    return { totalRows: totalDataRows, valid, errors };
  }

  private async upsertProduct(
    row: Omit<ProductImportRowDto, 'action' | 'existingProductId'>,
    catByName: Map<string, string>,
    brandByName: Map<string, string>,
    userId: string,
  ): Promise<void> {
    const categoryId = row.categoryName ? catByName.get(row.categoryName) ?? null : null;
    const brandId = row.brandName ? brandByName.get(row.brandName) ?? null : null;

    // Resolver bodega ANTES de empezar la transacción para fallar temprano
    // con un error de validación más claro.
    let warehouseId: string | null = null;
    if (row.warehouseName) {
      const wh = await this.warehouses.findOne({
        where: { name: row.warehouseName },
      });
      if (!wh) {
        throw new Error(
          `Bodega "${row.warehouseName}" no existe. Creala en /bodegas antes de importar.`,
        );
      }
      warehouseId = wh.id;
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
        description: row.description,
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
    // stock previo.
    if (warehouseId && row.stockQuantity !== null) {
      await this.setStockToTarget(productId, warehouseId, row.stockQuantity, userId);
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
        reference: 'ProductImport',
        refId: null,
        userId,
      });
    });
  }
}
