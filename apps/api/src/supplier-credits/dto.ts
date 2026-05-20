import { SupplierCreditStatus } from '@inventory/shared';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListSupplierCreditsQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsEnum(SupplierCreditStatus)
  status?: SupplierCreditStatus;

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
 * Aplicación inline de crédito al crear una compra. La PurchasesService
 * recibe un array de estos en `creditApplications`.
 */
export class ApplyCreditInput {
  @IsUUID()
  supplierCreditId!: string;

  @IsNumberString()
  amount!: string;
}

export class ManualSupplierCreditDto {
  @IsUUID()
  supplierId!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
