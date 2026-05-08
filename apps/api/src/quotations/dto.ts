import { QuotationStatus } from '@inventory/shared';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
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

export class CreateQuotationItemDto {
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
}

export class CreateQuotationDto {
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  // Cliente libre: nombre opcional. El operador puede emitir una cotización
  // "rápida" sin datos del cliente y completarlos al enviar.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerNameSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhoneSnapshot?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  customerEmailSnapshot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerTaxIdSnapshot?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items!: CreateQuotationItemDto[];
}

export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {}

export class ListQuotationsQueryDto {
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

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

export class SetStatusDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SendEmailDto {
  // Si viene, se usa como destino y se persiste como snapshot (cliente libre).
  // Si no viene, se lee del customer/snapshot existente.
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  to?: string;
}

export class SendWhatsappDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  to?: string;
}

export class GeneratePdfQueryDto {
  @IsOptional()
  @IsEnum(['letter', 'thermal80'])
  format?: 'letter' | 'thermal80';
}
