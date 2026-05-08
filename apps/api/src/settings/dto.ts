import {
  IsEmail,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  quotationFooter?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  defaultValidityDays?: number;

  // Tasa decimal entre 0 y 1, hasta 4 decimales (formato 0.1900).
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  taxRate?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  cardCommissionRate?: string;
}
