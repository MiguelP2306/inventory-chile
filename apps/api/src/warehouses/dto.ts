import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListWarehousesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  // 'true' devuelve solo activas (default cuando no se especifica),
  // 'false' devuelve todas. El frontend usa el filtro según el contexto:
  // selectores de venta/transferencia muestran solo activas;
  // pantalla `/almacenes` permite ver todas (con el toggle).
  @IsOptional()
  @IsString()
  active?: 'true' | 'false';

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
