import { CustomerSource } from '@inventory/shared';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsValidPhone } from '../common/validators/phone';
import { IsValidRut } from '../common/validators/rut';

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  // Ronda 9 — RUT opcional. Permite registrar clientes "lite" sólo con
  // WhatsApp. Si se completa, debe ser válido (formato + DV). SalesService
  // bloquea facturar sin RUT.
  @IsOptional()
  @IsString()
  @IsValidRut()
  taxId?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  email?: string | null;

  // Teléfono opcional. Si viene, valida y normaliza a E.164 (+56...).
  @IsOptional()
  @IsString()
  @IsValidPhone()
  phone?: string | null;

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
  internalNotes?: string | null;

  // ---------- Fase 8.5 ----------

  // Canal por el que llegó el cliente. Opcional al crear — default OTHER.
  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;

  // Teléfono específico para WhatsApp. Si null, los botones wa.me caen al
  // `phone` general como fallback. Validado en E.164 al igual que `phone`.
  @IsOptional()
  @IsString()
  @IsValidPhone()
  whatsappPhone?: string | null;

  // Fase 12 — marca el cliente como borrador ("cliente libre"). Solo requiere
  // nombre; el resto se completa luego.
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class ListCustomersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  // Filtro por estado borrador:
  //   'exclude' (default) → solo clientes completos (oculta borradores).
  //   'only'              → solo borradores ("clientes libres").
  //   'all'               → ambos.
  @IsOptional()
  @IsIn(['exclude', 'only', 'all'])
  draft?: 'exclude' | 'only' | 'all';

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
