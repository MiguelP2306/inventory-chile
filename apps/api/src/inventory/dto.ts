import { InventoryMovementType } from '@inventory/shared';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // Cantidad signada: + entrada de ajuste, - merma/pérdida.
  @IsInt()
  @NotEquals(0, { message: 'qty no puede ser 0' })
  qty!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  // Costo unitario opcional (solo aplica si qty > 0).
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  unitCost?: string;
}

export class ListMovementsQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

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

export class ListStockQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // Filtra por estado del semáforo.
  @IsOptional()
  @IsEnum(['ok', 'low', 'out'] as const)
  status?: 'ok' | 'low' | 'out';
}
