import { WarrantyStatus } from '@inventory/shared';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWarrantyClaimDto {
  @IsUUID()
  saleItemId!: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateWarrantyClaimStatusDto {
  @IsEnum(WarrantyStatus)
  status!: WarrantyStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  resolution?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class ListWarrantyClaimsQueryDto {
  @IsOptional()
  @IsEnum(WarrantyStatus)
  status?: WarrantyStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

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
