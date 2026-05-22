import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class ListCategoriesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  /**
   * Ronda 10 — filtro por padre.
   *  - Sin valor: lista todas las categorías (planas).
   *  - `parentId=<uuid>`: solo subcategorías de ese padre.
   *  - `parentId=null` (literal string): solo categorías raíz.
   */
  @IsOptional()
  @IsString()
  parentId?: string;

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

  /**
   * Ronda 11 — si true, cada categoría devuelta incluye stats lightweight
   * (productCount, inventoryValue, outOfStockCount, lowStockCount,
   * avgMarginPct) calculados con alcance DIRECTO (sin rollup de hijas).
   * El detalle con topProducts y rollup se pide vía GET /categories/:id.
   */
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' || value === 1,
  )
  @IsBoolean()
  withStats?: boolean;
}

export class GetCategoryQueryDto {
  /**
   * Ronda 11 — si true, la categoría devuelta incluye los 5 stats con
   * alcance ROLLED-UP (categoría + sus subcategorías de 1 nivel) +
   * topProducts del mes en curso.
   */
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' || value === 1,
  )
  @IsBoolean()
  withStats?: boolean;
}
