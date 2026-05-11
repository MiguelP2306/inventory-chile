// Wrappers tipados sobre axios para Ventas (Fase 7).

import type {
  CancelSaleInput,
  CreateSaleInput,
  PaginatedResult,
  PaymentMethodDto,
  SaleDto,
  SaleStatusDto,
} from '@inventory/shared';
import { api } from './api';

export interface ListSalesParams {
  status?: SaleStatusDto;
  paymentMethod?: PaymentMethodDto;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
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
export const getAvailableStock = (productIds: string[], warehouseId?: string) =>
  api
    .get<AvailableStockRow[]>('/sales/available-stock', {
      params: {
        productIds: productIds.join(','),
        warehouseId,
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
