import { DispatchStatus } from '@inventory/shared';
import { Type } from 'class-transformer';
import {
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
