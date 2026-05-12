import {
  PaymentMethod,
  ReturnItemCondition,
  ReturnStatus,
  ReturnType,
} from '@inventory/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateReturnItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  saleItemId?: string | null;

  @IsOptional()
  @IsUUID()
  purchaseEntryItemId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsNumberString({ no_symbols: false })
  unitPrice!: string;

  @IsEnum(ReturnItemCondition)
  itemCondition!: ReturnItemCondition;
}

export class CreateReturnDto {
  @IsEnum(ReturnType)
  type!: ReturnType;

  // Si type=CUSTOMER, saleId es obligatorio. El service valida.
  @IsOptional()
  @IsUUID()
  saleId?: string | null;

  // Si type=SUPPLIER, purchaseEntryId es obligatorio.
  @IsOptional()
  @IsUUID()
  purchaseEntryId?: string | null;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsString()
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  reason!: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items!: CreateReturnItemDto[];
}

export class CancelReturnDto {
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  reason!: string;
}

export class ListReturnsQueryDto {
  @IsOptional()
  @IsEnum(ReturnType)
  type?: ReturnType;

  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsUUID()
  purchaseEntryId?: string;

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
