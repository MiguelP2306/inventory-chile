import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/**
 * Fase 9 — Endpoint único del dashboard. Devuelve el snapshot agregado
 * (operación del día + lifecycle + mes + alertas) en una sola request para
 * que el render inicial en mobile no haga 6-8 round trips. El frontend
 * cachea el resultado con TanStack Query.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('summary')
  summary() {
    return this.svc.summary();
  }
}
