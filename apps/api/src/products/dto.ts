import { ProductKind } from '@inventory/shared';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class FitmentInputDto {
  @IsUUID()
  modelId!: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearFrom?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  yearTo?: number | null;
}

export class CreateProductDto {
  // Ronda 9 — SKU opcional. Si llega vacío/null, ProductsService autogenera
  // `AUTO-AAAA-NNNNN` vía CountersService.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string | null;

  // Un servicio (ej: envío/flete) es un Product sin inventario y con precio
  // libre por venta. Ver product.entity.ts.
  @IsOptional()
  @IsBoolean()
  isService?: boolean;

  // Ronda 9 — partNumber obligatorio junto con `name`. EXCEPCIÓN: los servicios
  // no tienen número de parte (no son repuestos), así que solo se exige cuando
  // NO es servicio.
  @ValidateIf((o: CreateProductDto) => !o.isService)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  partNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string | null;

  // Código universal opcional y único. El service valida el conflicto antes de
  // guardar para devolver un 409 con mensaje amigable.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  universalCode?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  // Nota interna del producto (Fase 12). Texto libre.
  @IsOptional()
  @IsString()
  observation?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  cost?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  price?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ORIGINAL u ALTERNATIVE. Default ORIGINAL en backend.
  @IsOptional()
  @IsEnum(ProductKind)
  productKind?: ProductKind;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FitmentInputDto)
  fitments?: FitmentInputDto[];

  // Lista completa de códigos compatibles. Se aplica con estrategia "replace":
  // se borran los del producto y se reinsertan estos.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  compatibleCodes?: string[];
}

// Todos los campos opcionales para PATCH parcial.
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsEnum(ProductKind)
  productKind?: ProductKind;

  // Filtro de servicios. Sin este parámetro, el listado devuelve SOLO productos
  // de inventario (excluye servicios) — así el catálogo normal, el selector de
  // productos y el inventario no se ensucian. `isService=true` trae SOLO
  // servicios (para la pantalla de Servicios y el selector de servicios).
  @IsOptional()
  @IsString()
  isService?: string;

  // Ronda 9 — filtros por fecha de creación.
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  // Solo aplica al catálogo PDF: '0' lo genera SIN precio público. Va acá
  // (y no como @Query suelto) porque el ValidationPipe valida TODO el query
  // contra este DTO con forbidNonWhitelisted.
  @IsOptional()
  @IsString()
  withPrice?: string;
}

export class ByVehicleQueryDto {
  @IsOptional()
  @IsUUID()
  makeId?: string;

  @IsOptional()
  @IsUUID()
  modelId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;
}

export class QuickSearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  // Por default trae todos los productos (atajo de navegación de la barra
  // superior). Cotizaciones/ventas le pasan `activeOnly=true` para no incluir
  // productos desactivados en su selector.
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  activeOnly?: boolean;
}

/**
 * Corrección manual del costo unitario (solo admin). El costo normalmente es
 * derivado del ponderado de lotes; esto existe para arreglar un costo que entró
 * mal. Motivo obligatorio (queda auditado).
 */
export class CorrectCostDto {
  // Costo bruto corregido, como string decimal (mismo formato que el resto de
  // montos del sistema).
  @IsNumberString({ no_symbols: false })
  unitCost!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
