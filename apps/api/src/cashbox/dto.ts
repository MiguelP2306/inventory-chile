import {
  CashTransactionSource,
  CashTransactionType,
  PaymentMethod,
} from '@inventory/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ListCashTransactionsQueryDto {
  @IsOptional()
  @IsEnum(CashTransactionType)
  type?: CashTransactionType;

  @IsOptional()
  @IsEnum(CashTransactionSource)
  source?: CashTransactionSource;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsUUID()
  expenseCategoryId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  q?: string;

  // Acepta 'true' / 'false' / '1' / '0' desde query string.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeVoided?: boolean;

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

/**
 * Fase 12 — Carga del capital inicial de la empresa. El usuario ingresa
 * un monto positivo y elige a qué bucket de método de pago se asigna en
 * el balance (por defecto efectivo). La fecha es opcional: si no viene,
 * el service usa la fecha actual.
 */
export class SetOpeningBalanceDto {
  // Acepta enteros o decimales con hasta 2 dígitos. Validado luego en service
  // como > 0 para mensajes de error más claros.
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'Monto inválido. Formato: 0.00',
  })
  amount!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsDateString()
  date?: string;
}
