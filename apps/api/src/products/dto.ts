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

  // Ronda 9 — partNumber pasa a obligatorio junto con `name`.
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  partNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

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
