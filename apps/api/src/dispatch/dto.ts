import { DispatchOrigin, DispatchStatus } from '@inventory/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateDispatchNoteDto {
  @IsUUID()
  saleId!: string;

  @IsOptional()
  @IsDateString()
  dispatchedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carrier?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressStreet?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressNumber?: string | null;

  @IsOptional()
  @IsUUID()
  communeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressNotes?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class DispatchNoteItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;
}

/**
 * Crea una guía de despacho INDEPENDIENTE (sin venta previa). Lleva su propio
 * cliente y sus propios items (producto + cantidad, sin precios). No mueve
 * stock — eso ocurre al convertir la guía en venta.
 */
export class CreateIndependentDispatchNoteDto {
  @IsUUID()
  customerId!: string;

  // Bodega desde la que se descuenta el stock al emitir la guía.
  @IsUUID()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La guía debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => DispatchNoteItemDto)
  items!: DispatchNoteItemDto[];

  @IsOptional()
  @IsDateString()
  dispatchedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carrier?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressStreet?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressNumber?: string | null;

  @IsOptional()
  @IsUUID()
  communeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressNotes?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class VoidDispatchNoteDto {
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  reason!: string;
}

export class ListDispatchNotesQueryDto {
  @IsOptional()
  @IsEnum(DispatchStatus)
  status?: DispatchStatus;

  @IsOptional()
  @IsEnum(DispatchOrigin)
  origin?: DispatchOrigin;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsString()
  carrier?: string;

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
