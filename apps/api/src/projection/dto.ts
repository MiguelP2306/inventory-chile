import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params para la proyección de stock. El operador puede sobreescribir
 * el `defaultLeadTimeDays` de CompanySettings para simular escenarios
 * (ej: "qué sería crítico si mi lead time bajara a 60 días?").
 */
export class ProjectionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  leadTimeDays?: number;
}
