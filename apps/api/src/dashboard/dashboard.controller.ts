import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardSummaryQueryDto } from './dto';

/**
 * Fase 9 — Endpoint único del dashboard. Devuelve el snapshot agregado en
 * una sola request para minimizar round trips en mobile.
 *
 * Polish Mayo 2026 — soporta `?range=hoy|7d|30d|mes`. El rango cambia los
 * bloques temporales (ventas/caja/utilidad/trend/top/comparison/won). Las
 * alertas y el embudo lifecycle quedan independientes. Default `hoy`.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  summary(@Query() query: DashboardSummaryQueryDto) {
    return this.svc.summary(query.range ?? 'hoy');
  }
}
