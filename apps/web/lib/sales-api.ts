// Wrappers tipados sobre axios para Ventas (Fase 7).

import type {
  CancelSaleInput,
  CreateSaleInput,
  PaginatedResult,
  PaymentMethodDto,
  SaleDraftDto,
  SaleDto,
  SaleIncidentFilterDto,
  SalesKpisDto,
  SaleStatusDto,
  SaveSaleDraftInput,
} from '@inventory/shared';
import { api } from './api';

export interface ListSalesParams {
  status?: SaleStatusDto;
  paymentMethod?: PaymentMethodDto;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  incident?: SaleIncidentFilterDto;
  page?: number;
  pageSize?: number;
}

export const listSales = (params: ListSalesParams = {}) =>
  api
    .get<PaginatedResult<SaleDto>>('/sales', { params })
    .then((r) => r.data);

export const getSale = (id: string) =>
  api.get<SaleDto>(`/sales/${id}`).then((r) => r.data);

export const createSale = (input: CreateSaleInput) =>
  api.post<SaleDto>('/sales', input).then((r) => r.data);

export const cancelSale = (id: string, input: CancelSaleInput) =>
  api.post<SaleDto>(`/sales/${id}/cancel`, input).then((r) => r.data);

export interface AvailableStockRow {
  productId: string;
  warehouseId: string;
  quantity: number;
}

/**
 * Devuelve el stock disponible por producto en la bodega seleccionada (default:
 * la única bodega activa). El frontend lo usa para mostrar "stock disponible"
 * al armar la venta y bloquear el botón "Confirmar" si la cantidad ingresada
 * excede el disponible.
 */
export const getAvailableStock = (
  productIds: string[],
  warehouseId?: string,
  aggregate?: boolean,
) =>
  api
    .get<AvailableStockRow[]>('/sales/available-stock', {
      params: {
        productIds: productIds.join(','),
        warehouseId,
        // Ronda 7 — aggregate=1 hace SUM(stock) sobre todas las bodegas
        // activas. Usado por el form de cotización porque no se ata a una
        // bodega concreta hasta que se convierte a venta.
        aggregate: aggregate ? '1' : undefined,
      },
    })
    .then((r) => r.data);

export type PdfFormat = 'letter' | 'thermal80';

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  );
}

export function getSalePdfUrl(id: string, format: PdfFormat = 'letter'): string {
  return `${apiBase()}/sales/${id}/pdf?format=${format}`;
}

// Ronda 12 — KPIs de ventas para los cards arriba de la lista.
export interface SalesKpisParams {
  dateFrom?: string;
  dateTo?: string;
}
export const getSalesKpis = (params: SalesKpisParams = {}) =>
  api.get<SalesKpisDto>('/sales/kpis', { params }).then((r) => r.data);

/* ============================================================================
 *  Borradores de venta ("ventas parkeadas")
 *
 *  Ruta propia `/sale-drafts` (no `/sales/drafts`) para no chocar con
 *  `GET /sales/:id`, que valida UUID.
 *
 *  Un borrador NO descuenta stock, no registra caja y no consume correlativo:
 *  todo eso pasa recién al confirmar la venta. Al confirmar se manda su id en
 *  `draftId` y el backend lo borra en la misma transacción.
 * ========================================================================== */

export const listSaleDrafts = () =>
  api.get<SaleDraftDto[]>('/sale-drafts').then((r) => r.data);

export const getSaleDraft = (id: string) =>
  api.get<SaleDraftDto>(`/sale-drafts/${id}`).then((r) => r.data);

export const createSaleDraft = (input: SaveSaleDraftInput) =>
  api.post<SaleDraftDto>('/sale-drafts', input).then((r) => r.data);

/** Parcial de verdad: lo que no mandes queda como estaba. */
export const updateSaleDraft = (id: string, input: SaveSaleDraftInput) =>
  api.patch<SaleDraftDto>(`/sale-drafts/${id}`, input).then((r) => r.data);

export const deleteSaleDraft = (id: string) =>
  api.delete<void>(`/sale-drafts/${id}`).then((r) => r.data);
