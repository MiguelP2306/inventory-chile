import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
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
