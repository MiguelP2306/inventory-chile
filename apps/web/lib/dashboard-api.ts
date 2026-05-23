// Wrappers tipados sobre axios para Dashboard (Fase 9).

import type {
  DashboardRangeDto,
  DashboardSummaryDto,
  NoMovementReportDto,
} from '@inventory/shared';
import { api } from './api';

/**
 * Snapshot agregado del dashboard. Endpoint único con todas las métricas
 * para minimizar round trips en mobile. Cachear con TanStack Query y
 * refrescar cada 60s o tras acciones que muevan los números.
 *
 * `range` cambia los bloques temporales (ventas/caja/utilidad/trend/top/
 * comparison). Default 'hoy'. Alertas y embudo lifecycle quedan
 * independientes del filtro.
 */
export const getDashboardSummary = (range: DashboardRangeDto = 'hoy') =>
  api
    .get<DashboardSummaryDto>('/dashboard/summary', { params: { range } })
    .then((r) => r.data);

/**
 * Reporte de productos sin movimiento en los últimos N días. Default 30.
 */
export const getNoMovementReport = (days?: number) =>
  api
    .get<NoMovementReportDto>('/reports/no-movement', {
      params: days ? { days } : undefined,
    })
    .then((r) => r.data);

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  );
}

/**
 * URL pública del CSV del reporte sin-movimiento. Usada como `href` del
 * botón "Exportar CSV" — el browser hace download nativo.
 */
export function getNoMovementCsvUrl(days?: number): string {
  const qs = days ? `?days=${days}` : '';
  return `${apiBase()}/reports/no-movement.csv${qs}`;
}
