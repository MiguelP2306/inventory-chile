import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Filtros comunes a los reportes de Fase 8. Si no se envían fechas, el
 * service usa el rango completo histórico (a discreción del operador).
 */
export class ReportDateRangeQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

/**
 * Fase 9 — Filtro del reporte de sin-movimiento. Default 30 días; el
 * frontend permite cambiar a 60 o 90 vía selector.
 */
export class NoMovementQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
