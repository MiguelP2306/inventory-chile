import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import type { Response } from 'express';
import { Permission } from '@inventory/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { BrandsService } from '../brands/brands.service';
import { CategoriesService } from '../categories/categories.service';
import {
  redactProductCost,
  redactProductCostList,
  viewerHas,
} from '../common/redact';
import { MONEY_FMT, sendXlsx, stylizeSheet } from '../common/xlsx-export';
import { PdfService } from '../notifications/pdf.service';
import { SettingsService } from '../settings/settings.service';
import { LabelService } from './label.service';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  productImageFileFilter,
  productImageStorage,
} from '../uploads/upload-config';
import {
  ByVehicleQueryDto,
  CreateProductDto,
  ListProductsQueryDto,
  QuickSearchQueryDto,
  UpdateProductDto,
} from './dto';
import { ProductsService } from './products.service';

class ReplaceCompatibleCodesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  codes!: string[];
}

/**
 * Ronda 7 — bulk update de categoría para N productos. Soporta:
 *   - `categoryId: '<uuid>'` → mover los productos a esa categoría.
 *   - `categoryId: null` → desvincular (productos sin categoría).
 */
class BulkUpdateCategoryDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productIds!: string[];

  // `null` significa "quitar categoría". Usamos ValidateIf para permitir null.
  @IsOptional()
  @ValidateIf((o) => o.categoryId !== null)
  @IsUUID()
  categoryId!: string | null;
}

@Controller('products')
export class ProductsController {
  constructor(
    private readonly svc: ProductsService,
    private readonly categories: CategoriesService,
    private readonly brands: BrandsService,
    private readonly pdf: PdfService,
    private readonly settings: SettingsService,
    private readonly labels: LabelService,
  ) {}

  @Get()
  async list(
    @CurrentUser() viewer: JwtPayload,
    @Query() query: ListProductsQueryDto,
  ) {
    const result = await this.svc.list(query);
    return {
      ...result,
      items: redactProductCostList(result.items, viewer),
    };
  }

  @Get('by-vehicle')
  async byVehicle(
    @CurrentUser() viewer: JwtPayload,
    @Query() query: ByVehicleQueryDto,
  ) {
    const items = await this.svc.byVehicle(query);
    return redactProductCostList(items, viewer);
  }

  @Get('quick-search')
  async quickSearch(
    @CurrentUser() viewer: JwtPayload,
    @Query() query: QuickSearchQueryDto,
  ) {
    const items = await this.svc.quickSearch(query);
    return redactProductCostList(items, viewer);
  }

  /**
   * Fase 11 — lookup EXACTO por código. Pensado para scanners (USB o cámara).
   * Compara por igualdad estricta contra `sku`, `partNumber`, `barcode`
   * y los `product_codes` compatibles. Si hay match devuelve el producto;
   * si no, 404. El frontend distingue ambos casos para mostrar
   * "código no reconocido" sin reintentar con quickSearch.
   */
  @Get('lookup')
  async lookup(
    @CurrentUser() viewer: JwtPayload,
    @Query('code') code: string | undefined,
  ) {
    if (!code || !code.trim()) {
      throw new BadRequestException('Query param `code` requerido');
    }
    const match = await this.svc.lookupExact(code);
    if (!match) {
      throw new NotFoundException(
        `Ningún producto coincide exactamente con el código "${code}"`,
      );
    }
    return redactProductCost(match as { cost?: string | null }, viewer);
  }

  /**
   * Fase 11 — etiqueta térmica 50×30mm con barcode CODE128.
   *
   *  - `qty=1..100` → cantidad de copias en el PDF (default 1). Cada copia es
   *    una página independiente para que la térmica corte una a una.
   *  - `warehouseId` → opcional. Si viene, el footer incluye el
   *    `Stock.locationCode` de esa bodega.
   *
   * Devuelve `application/pdf` inline (el browser puede abrirlo en otra pestaña
   * para imprimir directamente).
   */
  @Get(':id/label')
  async label(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('qty') qty: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() res: Response,
  ) {
    const qtyNum = qty ? Number(qty) : 1;
    if (!Number.isFinite(qtyNum) || qtyNum < 1 || qtyNum > 100) {
      throw new BadRequestException('qty debe ser un entero entre 1 y 100');
    }
    const buffer = await this.labels.generate(id, {
      qty: Math.floor(qtyNum),
      warehouseId: warehouseId || undefined,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="etiqueta-${id}.pdf"`,
    );
    res.send(buffer);
  }

  /**
   * Ronda 10 — catálogo en PDF. Respeta los mismos filtros del listado
   * (`q`, `categoryId`, `brandId`, `productKind`, `createdFrom/To`) pero
   * ignora paginación: exporta hasta 500 productos.
   */
  /**
   * Export del catálogo a XLSX. Mismos filtros que `catalog.pdf` (`q`,
   * `categoryId`, `brandId`, `productKind`, `createdFrom/To`), ignora
   * paginación. Reusa `listForCatalog()` que limita a 500 productos —
   * suficiente para SMB y evita OOM en catálogos gigantes.
   */
  @Get('export.xlsx')
  async exportXlsx(
    @CurrentUser() viewer: JwtPayload,
    @Query() query: ListProductsQueryDto,
    @Res() res: Response,
  ) {
    const canSeeCost = viewerHas(viewer, Permission.PRODUCT_VIEW_COST);
    // Fase 10 polish — usamos `listForExport` (sin cap) en vez de
    // `listForCatalog` (cap 500 para PDF). El operador debe poder bajar TODO
    // el catálogo a Excel sin tope.
    const products = await this.svc.listForExport(query);
    const categoriesPlain = await this.categories.list();
    const categoriesArr = Array.isArray(categoriesPlain)
      ? categoriesPlain
      : categoriesPlain.items;
    const categoryById = new Map(categoriesArr.map((c) => [c.id, c]));

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    // Stock por bodega: traemos las bodegas activas + un map productId → qty
    // por bodega. La columna "Bodega" del Excel contiene "Bodega:qty;..." para
    // ser consistente con el formato del importer.
    const stockByProduct = await this.svc.stockByProduct(
      products.map((p) => p.id),
    );

    // Modelos compatibles por producto (mismo formato del importer:
    // "Marca:Modelo:AñoFrom-AñoTo; ..."). Cargado en batch para evitar N+1.
    const modelsByProduct = await this.svc.compatibleModelsByProduct(
      products.map((p) => p.id),
    );

    const sheet = wb.addWorksheet('Productos');
    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 18 },
      { header: 'Nombre', key: 'name', width: 36 },
      { header: 'PartNumber', key: 'partNumber', width: 16 },
      { header: 'Código de barras', key: 'barcode', width: 18 },
      { header: 'Categoría', key: 'category', width: 22 },
      { header: 'Subcategoría', key: 'subcategory', width: 22 },
      { header: 'Marca', key: 'brand', width: 18 },
      { header: 'Modelo (compatibilidad)', key: 'models', width: 32 },
      { header: 'Tipo', key: 'kind', width: 14 },
      // La columna Costo solo aparece para usuarios con permiso.
      ...(canSeeCost
        ? [
            {
              header: 'Costo',
              key: 'cost',
              width: 14,
              style: { numFmt: MONEY_FMT },
            },
          ]
        : []),
      { header: 'Precio', key: 'price', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Stock mín.', key: 'minStock', width: 10 },
      { header: 'Stock por bodega', key: 'stockByWarehouse', width: 28 },
      { header: 'Stock actual (total)', key: 'totalStock', width: 14 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Activo', key: 'isActive', width: 8 },
    ];

    for (const p of products) {
      const cat = p.categoryId ? categoryById.get(p.categoryId) : null;
      const categoryName = cat?.parentName ?? cat?.name ?? '';
      const subcategoryName = cat?.parentName ? cat.name : '';
      const stocks = stockByProduct.get(p.id) ?? [];
      const totalStock = stocks.reduce((acc, s) => acc + s.qty, 0);
      const stockByWarehouse = stocks
        .map((s) => `${s.warehouseName}:${s.qty}`)
        .join('; ');
      sheet.addRow({
        sku: p.sku ?? '',
        name: p.name,
        partNumber: p.partNumber ?? '',
        barcode: p.barcode ?? '',
        category: categoryName,
        subcategory: subcategoryName,
        brand: p.brand?.name ?? '',
        models: modelsByProduct.get(p.id) ?? '',
        kind: p.productKind === 'ORIGINAL' ? 'Original' : 'Alternativo',
        ...(canSeeCost ? { cost: parseFloat(p.cost ?? '0') } : {}),
        price: parseFloat(p.price ?? '0'),
        minStock: p.minStock ?? 0,
        stockByWarehouse,
        totalStock,
        description: p.description ?? '',
        isActive: p.isActive ? 'Sí' : 'No',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'productos');
  }

  @Get('catalog.pdf')
  async catalogPdf(
    @CurrentUser() viewer: JwtPayload,
    @Query() query: ListProductsQueryDto,
    @Res() res: Response,
  ) {
    const canSeeCost = viewerHas(viewer, Permission.PRODUCT_VIEW_COST);
    const [products, settings] = await Promise.all([
      this.svc.listForCatalog(query),
      this.settings.get(),
    ]);

    // Map de coverUrl absolutas para fetch desde el backend.
    const coverByProduct = await this.svc.coverUrlsByProduct(
      products.map((p) => p.id),
    );

    // Categorías (con padre) para componer "Padre › Hija".
    const categoriesPlain = await this.categories.list();
    const categoriesArr = Array.isArray(categoriesPlain)
      ? categoriesPlain
      : categoriesPlain.items;
    const categoryById = new Map(categoriesArr.map((c) => [c.id, c]));

    // Resumen de filtros para mostrar en la cabecera.
    const filterParts: string[] = [];
    if (query.q) filterParts.push(`búsqueda "${query.q}"`);
    if (query.categoryId) {
      const cat = categoryById.get(query.categoryId);
      if (cat) {
        const path = cat.parentName ? `${cat.parentName} › ${cat.name}` : cat.name;
        filterParts.push(`categoría ${path}`);
      }
    }
    if (query.brandId) {
      const brand = await this.brands
        .list()
        .then((bs) => (Array.isArray(bs) ? bs : bs.items).find((b) => b.id === query.brandId));
      if (brand) filterParts.push(`marca ${brand.name}`);
    }
    if (query.productKind) {
      filterParts.push(
        `tipo ${query.productKind === 'ORIGINAL' ? 'Original' : 'Alternativo'}`,
      );
    }

    const lines = products.map((p) => {
      const cat = p.categoryId ? categoryById.get(p.categoryId) : null;
      const categoryPath =
        cat && cat.parentName
          ? `${cat.parentName} › ${cat.name}`
          : (cat?.name ?? null);
      return {
        sku: p.sku,
        name: p.name,
        partNumber: p.partNumber,
        description: p.description,
        categoryName: cat?.name ?? null,
        categoryPath,
        brandName: p.brand?.name ?? null,
        cost: canSeeCost ? p.cost : null,
        price: p.price,
        productKind: p.productKind,
        coverUrl: coverByProduct.get(p.id) ?? null,
      };
    });

    const buffer = await this.pdf.generateCatalog({
      company: {
        name: settings.name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        taxId: settings.taxId,
        logoUrl: settings.logoUrl,
        quotationFooter: settings.quotationFooter,
      },
      generatedAt: new Date().toISOString(),
      filterSummary: filterParts.join(' · '),
      products: lines,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="catalogo-${new Date().toISOString().slice(0, 10)}.pdf"`,
    );
    res.send(buffer);
  }

  // Ronda 7 — bulk update de categoría. Ruta concreta antes que /:id
  // para que `bulk-category` no matchee como un UUID.
  @Patch('bulk-category')
  bulkUpdateCategory(@Body() dto: BulkUpdateCategoryDto) {
    return this.svc.bulkUpdateCategory(dto.productIds, dto.categoryId);
  }

  @Get(':id')
  async getOne(
    @CurrentUser() viewer: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const product = await this.svc.getOne(id);
    return redactProductCost(product as { cost?: string | null }, viewer);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }

  // -------- Imágenes (Fase 4B) --------

  @Get(':id/images')
  listImages(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.listImages(id);
  }

  @Post(':id/images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: productImageStorage,
      fileFilter: productImageFileFilter,
      limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES },
    }),
  )
  uploadImage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Archivo faltante (campo "file").');
    }
    return this.svc.addImage(id, file);
  }

  @Patch(':id/images/:imageId/cover')
  setCover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
  ) {
    return this.svc.setCover(id, imageId);
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
  ) {
    return this.svc.removeImage(id, imageId);
  }

  // -------- Códigos compatibles (Fase 4B) --------

  /** Reemplaza la lista completa de códigos compatibles del producto. */
  @Put(':id/codes')
  replaceCompatibleCodes(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceCompatibleCodesDto,
  ) {
    return this.svc.replaceCompatibleCodesPublic(id, dto.codes);
  }
}
