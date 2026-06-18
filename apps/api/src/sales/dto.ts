import { PaymentMethod, SaleStatus } from '@inventory/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
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
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateSaleItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsNumberString({ no_symbols: false })
  unitPrice!: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  discount?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  discountPercent?: string | null;

  // Observación libre por ítem (opcional). Se copia desde la cotización.
  @IsOptional()
  @IsString()
  observation?: string | null;
}

export class CreateSaleDto {
  @IsUUID()
  customerId!: string;

  // Multi-bodega se activa en Fase 7.5; hasta entonces, si no llega, el
  // backend asigna la bodega única "Principal".
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  // Venta NO afecta a IVA (sin documento). Default false → afecta 19%.
  @IsOptional()
  @IsBoolean()
  vatExempt?: boolean;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  // Si la venta proviene de una cotización, el backend la marca como
  // CONVERTED dentro de la misma transacción atómica del create.
  @IsOptional()
  @IsUUID()
  quotationId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}

export class CancelSaleDto {
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  reason!: string;
}

export class ListSalesQueryDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsUUID()
  customerId?: string;

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

export class GeneratePdfQueryDto {
  @IsOptional()
  @IsEnum(['letter', 'thermal80'])
  format?: 'letter' | 'thermal80';
}

/**
 * Ronda 12 — query para KPIs de ventas. Sin parámetros → KPIs del mes
 * actual. Con `dateFrom`/`dateTo` → período custom. Excluye ventas
 * canceladas siempre.
 */
export class SalesKpisQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
