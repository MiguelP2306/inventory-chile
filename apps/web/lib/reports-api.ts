// Wrappers tipados sobre axios para Proyección y Reportes (Fase 8).

import type {
  ProjectionResponseDto,
  ReportCashFlowResponseDto,
  ReportIvaResponseDto,
  ReportSalesResponseDto,
} from '@inventory/shared';
import { api } from './api';

// ---------- Proyección ----------

export interface ProjectionParams {
  leadTimeDays?: number;
  // Si `true`, devuelve TODOS los productos (no solo críticos). Útil para
  // explorar el catálogo proyectado.
  all?: boolean;
}

export const getProjection = (params: ProjectionParams = {}) =>
  api
    .get<ProjectionResponseDto>('/projection', {
      params: {
        leadTimeDays: params.leadTimeDays,
        all: params.all ? '1' : undefined,
      },
    })
    .then((r) => r.data);

/**
 * Devuelve la URL absoluta del CSV de proyección. Pensado para `<a download>`
 * — el navegador descarga el archivo respetando la cookie de autenticación
 * (axios no se usa porque queremos el header `Content-Disposition` directo).
 */
export function projectionCsvUrl(params: ProjectionParams = {}): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  const search = new URLSearchParams();
  if (params.leadTimeDays != null) {
    search.set('leadTimeDays', String(params.leadTimeDays));
  }
  if (params.all) search.set('all', '1');
  const qs = search.toString();
  return `${base}/projection/export.csv${qs ? `?${qs}` : ''}`;
}

// ---------- Reportes ----------

export interface ReportDateRangeParams {
  dateFrom?: string;
  dateTo?: string;
}

export const getSalesReport = (params: ReportDateRangeParams = {}) =>
  api
    .get<ReportSalesResponseDto>('/reports/sales', { params })
    .then((r) => r.data);

export const getIvaReport = (params: ReportDateRangeParams = {}) =>
  api
    .get<ReportIvaResponseDto>('/reports/iva', { params })
    .then((r) => r.data);

export const getCashFlowReport = (params: ReportDateRangeParams = {}) =>
  api
    .get<ReportCashFlowResponseDto>('/reports/cash-flow', { params })
    .then((r) => r.data);

function reportCsvUrl(path: string, params: ReportDateRangeParams): string {
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  const search = new URLSearchParams();
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  const qs = search.toString();
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

export const salesReportCsvUrl = (p: ReportDateRangeParams = {}) =>
  reportCsvUrl('/reports/sales.csv', p);
export const ivaReportCsvUrl = (p: ReportDateRangeParams = {}) =>
  reportCsvUrl('/reports/iva.csv', p);
export const cashFlowReportCsvUrl = (p: ReportDateRangeParams = {}) =>
  reportCsvUrl('/reports/cash-flow.csv', p);
