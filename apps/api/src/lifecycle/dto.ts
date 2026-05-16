import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class TouchCustomerDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkLostDto {
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  reason!: string;
}

const FOLLOW_UP_TABS = [
  'pendientes',
  'sin-respuesta',
  'vencidos',
  'ultimo-contacto',
] as const;
type FollowUpTabValue = (typeof FOLLOW_UP_TABS)[number];

export class FollowUpQueryDto {
  // Default 'pendientes' si el operador entra sin tab seleccionado.
  @IsOptional()
  @IsEnum(FOLLOW_UP_TABS)
  tab?: FollowUpTabValue;

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
