import {
  PaymentMethod,
  SaleIncidentFilterDto,
  SaleStatus,
} from '@inventory/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
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

  // Descuento sobre el total de la venta. `discountPercent` tiene precedencia
  // sobre `discount` cuando ambos vienen. El service acota el resultado a
  // [0, bruto], así que un monto excesivo no deja el total en negativo.
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  discount?: string | null;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  discountPercent?: string | null;

  // Si la venta proviene de una cotización, el backend la marca como
  // CONVERTED dentro de la misma transacción atómica del create.
  @IsOptional()
  @IsUUID()
  quotationId?: string | null;

  // Si la venta proviene de una guía de despacho INDEPENDIENTE, el backend
  // linkea la guía (setea su saleId) dentro de la misma transacción,
  // marcándola como convertida.
  @IsOptional()
  @IsUUID()
  dispatchNoteId?: string | null;

  // Borrador de origen. El backend lo elimina en la misma transacción del
  // create para no dejarlo huérfano de una venta ya confirmada.
  @IsOptional()
  @IsUUID()
  draftId?: string | null;

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

  // Filtra por incidencia posterior a la venta. NONE = ventas sin devolución,
  // cambio ni garantía.
  @IsOptional()
  @IsIn(['RETURN', 'EXCHANGE', 'WARRANTY', 'NONE'])
  incident?: SaleIncidentFilterDto;

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

/* ============================================================================
 *  Borradores de venta ("ventas parkeadas")
 * ========================================================================== */

export class SaleDraftItemDto {
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
  discount?: string | null;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  discountPercent?: string | null;

  @IsOptional()
  @IsString()
  observation?: string | null;
}

/**
 * Casi todo opcional: un borrador existe justamente para poder estar
 * incompleto. Lo único que se exige es al menos un ítem — un borrador sin
 * productos no tiene nada que recordar.
 */
export class SaveSaleDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod | null;

  @IsOptional()
  @IsBoolean()
  vatExempt?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  discount?: string | null;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  discountPercent?: string | null;

  @IsOptional()
  @IsUUID()
  quotationId?: string | null;

  @IsOptional()
  @IsUUID()
  dispatchNoteId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleDraftItemDto)
  items!: SaleDraftItemDto[];
}
