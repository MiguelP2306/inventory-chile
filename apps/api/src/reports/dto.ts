import { IsDateString, IsOptional } from 'class-validator';

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
