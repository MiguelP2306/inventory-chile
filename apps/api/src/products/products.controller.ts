import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { BrandsService } from '../brands/brands.service';
import { CategoriesService } from '../categories/categories.service';
import { PdfService } from '../notifications/pdf.service';
import { SettingsService } from '../settings/settings.service';
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
  ) {}

  @Get()
  list(@Query() query: ListProductsQueryDto) {
    return this.svc.list(query);
  }

  @Get('by-vehicle')
  byVehicle(@Query() query: ByVehicleQueryDto) {
    return this.svc.byVehicle(query);
  }

  @Get('quick-search')
  quickSearch(@Query() query: QuickSearchQueryDto) {
    return this.svc.quickSearch(query);
  }

  /**
   * Ronda 10 — catálogo en PDF. Respeta los mismos filtros del listado
   * (`q`, `categoryId`, `brandId`, `productKind`, `createdFrom/To`) pero
   * ignora paginación: exporta hasta 500 productos.
   */
  @Get('catalog.pdf')
  async catalogPdf(
    @Query() query: ListProductsQueryDto,
    @Res() res: Response,
  ) {
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
        cost: p.cost,
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
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
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
