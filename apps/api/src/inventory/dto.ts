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

// Ronda 13 — filtros del endpoint /inventory/movements/cards. Acepta los
// mismos que /movements + búsqueda libre, userId y filtros por cliente o
// proveedor. La paginación es a nivel de GRUPO (no de movimiento atómico):
// `pageSize=20` devuelve hasta 20 cards.
export class ListMovementCardsQueryDto {
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
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  // Filtro por estado de la transacción padre:
  //  - 'active'    → solo transacciones no canceladas (Sale.status != CANCELLED,
  //                  Return.status = COMPLETED, Transfer.status = COMPLETED,
  //                  DispatchNote.status = ACTIVE). Los ajustes y compras
  //                  siempre cuentan como activos (no tienen estado cancelable).
  //  - 'cancelled' → solo las canceladas/anuladas.
  //  - undefined   → todos (default).
  @IsOptional()
  @IsEnum(['active', 'cancelled'] as const)
  status?: 'active' | 'cancelled';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SetLocationCodeDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  // Acepta string vacío o null para limpiar. Si tiene contenido, max 30 chars
  // — validado también en el service.
  @IsOptional()
  @IsString()
  locationCode?: string | null;
}
