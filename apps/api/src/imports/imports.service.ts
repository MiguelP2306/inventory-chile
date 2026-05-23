import { ProductKind } from '@inventory/shared';
import type {
  ProductImportErrorDto,
  ProductImportPreviewDto,
  ProductImportResultDto,
  ProductImportRowDto,
} from '@inventory/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { DataSource, In, Repository } from 'typeorm';
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
} from '../database/entities';

const COLUMNS = [
  'sku',
  'partNumber',
  'barcode',
  'universalCode',
  'name',
  'description',
  'categoryName',
  'brandName',
  'cost',
  'price',
  'minStock',
  'maxStock',
  'location',
  'productKind',
  'compatibleCodes',
] as const;
type Column = (typeof COLUMNS)[number];

const HEADERS: Record<Column, string> = {
  sku: 'SKU',
  partNumber: 'PartNumber',
  barcode: 'Codigo de barras',
  universalCode: 'Codigo universal',
  name: 'Nombre',
  description: 'Descripcion',
  categoryName: 'Categoria',
  brandName: 'Marca',
  cost: 'Costo (bruto)',
  price: 'Precio (bruto)',
  minStock: 'Stock minimo',
  maxStock: 'Stock maximo',
  location: 'Ubicacion (deprecated)',
  productKind: 'Tipo (ORIGINAL/ALTERNATIVE)',
  compatibleCodes: 'Codigos compatibles (separados por ;)',
};

/**
 * Fase 10 — Importador masivo de productos vía Excel (.xlsx).
 *
 * Flujo en 2 pasos:
 *
 *   1. POST /imports/products/preview → parsea + valida. Devuelve preview
 *      (primeras 10 filas válidas), conteos, lista de errores, y los nombres
 *      de categorías/marcas que se crearían si el operador confirma.
 *
 *   2. POST /imports/products/confirm → ejecuta la carga real. Estrategia:
 *      - UPSERT por SKU (si existe, actualiza; si no, crea).
 *      - Categorías/marcas faltantes se crean automáticamente.
 *      - Códigos compatibles se replazan (clear + insert) para cada producto.
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
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async preview(buffer: Buffer): Promise<ProductImportPreviewDto> {
    const parsed = await this.parseExcel(buffer);

    // Indexamos productos existentes por SKU para determinar create vs update.
    const skus = parsed.valid.map((r) => r.sku);
    const existing = skus.length
      ? await this.products.find({
          where: { sku: In(skus) },
          select: { id: true, sku: true },
        })
      : [];
    const existingMap = new Map(existing.map((p) => [p.sku, p.id]));

    // Nombres únicos de categorías/marcas que aparecen en el Excel.
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

  async confirm(buffer: Buffer): Promise<ProductImportResultDto> {
    const parsed = await this.parseExcel(buffer);

    // Snapshot ANTES de procesar: qué SKUs ya existían. Necesario para
    // discriminar create vs update — si el upsert los crea ahora, igual
    // los contamos del lado correcto.
    const skus = parsed.valid.map((r) => r.sku);
    const existingProducts = skus.length
      ? await this.products.find({
          where: { sku: In(skus) },
          select: { id: true, sku: true },
        })
      : [];
    const existedBefore = new Set(existingProducts.map((p) => p.sku));

    // Auto-create categorías/marcas faltantes (decisión de Fase 10).
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

    // Upsert producto a producto con try/catch (partial success). El batch
    // continúa aunque una fila falle; el error se reporta en la respuesta.
    const errors: ProductImportErrorDto[] = [...parsed.errors];
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = parsed.errors.length;

    for (const row of parsed.valid) {
      try {
        await this.upsertProduct(row, catByName, brandByName);
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

    // Hoja 1: datos
    const sheet = wb.addWorksheet('Productos');
    sheet.columns = COLUMNS.map((col) => ({
      header: HEADERS[col],
      key: col,
      width: Math.max(HEADERS[col].length + 2, 16),
    }));
    // Estilo del header
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    // Fila de ejemplo
    sheet.addRow({
      sku: 'FIL-AC-001',
      partNumber: 'A12345',
      barcode: '7891234567890',
      universalCode: 'UNI-001',
      name: 'Filtro de aire Toyota Corolla 2018',
      description: 'Filtro de aire para motor 1.8L',
      categoryName: 'Filtros',
      brandName: 'Mahle',
      cost: '8000',
      price: '15000',
      minStock: 5,
      maxStock: 50,
      location: '',
      productKind: 'ORIGINAL',
      compatibleCodes: 'A12345; B67890; XYZ-001',
    });

    // Hoja 2: instrucciones
    const inst = wb.addWorksheet('Instrucciones');
    inst.columns = [
      { header: 'Columna', key: 'col', width: 30 },
      { header: 'Obligatoria', key: 'req', width: 12 },
      { header: 'Descripcion', key: 'desc', width: 80 },
    ];
    inst.getRow(1).font = { bold: true };
    const ROWS: Array<[Column, boolean, string]> = [
      ['sku', true, 'Codigo unico interno. Si ya existe en el sistema, se actualiza ese producto (upsert).'],
      ['partNumber', false, 'Codigo de pieza del fabricante. Indexado para busqueda.'],
      ['barcode', false, 'Codigo de barras del producto. Indexado para escanner.'],
      ['universalCode', false, 'Codigo universal (Fase 4B). Distintos productos pueden compartirlo.'],
      ['name', true, 'Nombre comercial del producto.'],
      ['description', false, 'Descripcion larga (opcional).'],
      ['categoryName', false, 'Nombre de la categoria. Si no existe, se crea automaticamente.'],
      ['brandName', false, 'Nombre de la marca. Si no existe, se crea automaticamente.'],
      ['cost', false, 'Costo unitario BRUTO en CLP (con IVA). Ej: 8000. Default 0.'],
      ['price', false, 'Precio venta BRUTO en CLP (con IVA). Ej: 15000. Default 0.'],
      ['minStock', false, 'Stock minimo. Entero >= 0. Default 0.'],
      ['maxStock', false, 'Stock maximo. Entero >= 0. Vacio = sin limite.'],
      ['location', false, 'Deprecated desde Fase 7.5. Usar locationCode por bodega desde /inventario.'],
      ['productKind', false, 'ORIGINAL o ALTERNATIVE. Default ORIGINAL.'],
      ['compatibleCodes', false, 'Lista de codigos compatibles separados por punto y coma (;). Ej: "A123;B456;XYZ-789".'],
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
      // ExcelJS espera `ArrayBuffer` aunque acepta Buffer en runtime. Casteamos
      // explícitamente para conformar al tipo declarado por la librería.
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'archivo invalido';
      throw new BadRequestException(`No se pudo leer el Excel: ${message}`);
    }

    // Detectar la hoja de datos: priorizamos "Productos" (de la plantilla), si
    // no existe usamos la primera hoja con contenido. La segunda hoja de la
    // plantilla es "Instrucciones" y no debe parsearse como datos.
    const sheet =
      wb.getWorksheet('Productos') ??
      wb.worksheets.find((w) => w.rowCount > 0) ??
      wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El Excel no tiene hojas.');
    }

    // Buscar la fila de header: típicamente es la 1, pero algunos exporters
    // (Google Sheets, Numbers, Looker Studio) insertan filas vacías arriba.
    // Probamos hasta las primeras 5 filas y nos quedamos con la que tenga
    // las columnas obligatorias "SKU" y "Nombre".
    const found = findHeaderRow(sheet, HEADERS, ['sku', 'name']);
    if (!found) {
      throw new BadRequestException(
        'No encontré las columnas obligatorias "SKU" y "Nombre" en las primeras 5 filas. Descargá la plantilla nueva desde el botón "Descargar plantilla".',
      );
    }
    const { headerRowNumber, colIndex } = found;

    const valid: Omit<ProductImportRowDto, 'action' | 'existingProductId'>[] = [];
    const errors: ProductImportErrorDto[] = [];

    // Upper-bound robusto del último número de fila — ver `lastDataRow` para
    // detalles del bug histórico con `actualRowCount`.
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

      // Filas completamente vacías: las saltamos pero NO cortamos el loop —
      // el operador puede tener una fila en blanco intercalada por accidente
      // (ej. separador visual). Sólo cortamos si encontramos 50 filas vacías
      // consecutivas, asumiendo que ya estamos pasando del final real.
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

      // Barcode duplicado en el mismo batch (la columna NO es única en DB pero
      // duplicar dentro del mismo upload casi siempre es un copy/paste por error).
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

      // Numéricos — el helper devuelve `null` solo cuando el string es no-vacío
      // pero no parseable. Empty string siempre devuelve `null` también, así
      // que diferenciamos con el `raw`.
      const costRaw = cellText('cost');
      const priceRaw = cellText('price');
      const minStockRaw = cellText('minStock');
      const maxStockRaw = cellText('maxStock');
      const cost = parseNumeric(costRaw);
      const price = parseNumeric(priceRaw);
      const minStock = parseInteger(minStockRaw);
      const maxStock = maxStockRaw === '' ? null : parseInteger(maxStockRaw);

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
      if (maxStock === null && maxStockRaw !== '') {
        errors.push({
          rowNumber: r,
          sku,
          message: `Stock máximo no es entero válido: "${maxStockRaw}"`,
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

      // productKind
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

      // Códigos compatibles: lista separada por `;` o por `,`.
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
      // Códigos compatibles repetidos dentro de la misma fila → quedan únicos.
      const compatibleCodesUnique = Array.from(new Set(compatibleCodes));

      valid.push({
        rowNumber: r,
        sku,
        name,
        partNumber: cellText('partNumber') || null,
        barcode: barcode || null,
        universalCode: cellText('universalCode') || null,
        description: cellText('description') || null,
        categoryName: cellText('categoryName') || null,
        brandName: cellText('brandName') || null,
        cost: cost !== null ? cost.toFixed(2) : null,
        price: price !== null ? price.toFixed(2) : null,
        minStock,
        maxStock,
        location: cellText('location') || null,
        productKind,
        compatibleCodes: compatibleCodesUnique,
      });
    }

    return { totalRows: totalDataRows, valid, errors };
  }

  private async upsertProduct(
    row: Omit<ProductImportRowDto, 'action' | 'existingProductId'>,
    catByName: Map<string, string>,
    brandByName: Map<string, string>,
  ): Promise<void> {
    const categoryId = row.categoryName ? catByName.get(row.categoryName) ?? null : null;
    const brandId = row.brandName ? brandByName.get(row.brandName) ?? null : null;

    await this.ds.transaction(async (manager) => {
      const existing = await manager.findOne(Product, {
        where: { sku: row.sku },
      });
      const patch: Partial<Product> = {
        sku: row.sku,
        name: row.name,
        partNumber: row.partNumber,
        barcode: row.barcode,
        universalCode: row.universalCode,
        description: row.description,
        categoryId,
        brandId,
        cost: row.cost ?? '0',
        price: row.price ?? '0',
        minStock: row.minStock ?? 0,
        maxStock: row.maxStock,
        location: row.location,
        productKind: (row.productKind ?? 'ORIGINAL') as 'ORIGINAL' | 'ALTERNATIVE',
        isActive: existing?.isActive ?? true,
      };

      let productId: string;
      if (existing) {
        await manager.update(Product, { id: existing.id }, patch);
        productId = existing.id;
      } else {
        const created = manager.create(Product, patch);
        await manager.save(created);
        productId = created.id;
      }

      // Códigos compatibles: estrategia replace.
      await manager.delete(ProductCode, { productId, kind: 'COMPATIBLE' });
      for (const code of row.compatibleCodes) {
        const entry = manager.create(ProductCode, {
          productId,
          code,
          kind: 'COMPATIBLE' as 'COMPATIBLE',
        });
        await manager.save(entry);
      }
    });
  }
}

