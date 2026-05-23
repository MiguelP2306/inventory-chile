import type { DashboardRangeDto } from '@inventory/shared';
import { IsIn, IsOptional } from 'class-validator';

const RANGES: DashboardRangeDto[] = ['hoy', '7d', '30d', 'mes'];

export class DashboardSummaryQueryDto {
  @IsOptional()
  @IsIn(RANGES)
  range?: DashboardRangeDto;
}
