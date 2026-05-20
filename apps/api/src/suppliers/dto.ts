import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsValidPhone } from '../common/validators/phone';
import { IsValidRut } from '../common/validators/rut';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  // Mismas reglas que clientes: formato + dígito verificador.
  // Sigue siendo opcional (proveedores extranjeros pueden no tener RUT chileno —
  // pero si se completa, debe ser un RUT válido).
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @IsValidRut()
  taxId?: string | null;

  // Ronda 9 — razón social formal (cuando difiere del nombre comercial).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string | null;

  // Ronda 9 — nombre del vendedor/contacto humano.
  @IsOptional()
  @IsString()
  @MaxLength(180)
  contactPerson?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @IsValidPhone()
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class ListSuppliersQueryDto {
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

export class ListSupplierPurchasesQueryDto {
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
