// Wrappers tipados sobre axios para Devoluciones (Fase 7.6).

import type {
  CancelReturnInput,
  CreateReturnInput,
  PaginatedResult,
  ReturnDto,
  ReturnStatusDto,
  ReturnTypeDto,
  ReturnedQtyDto,
} from '@inventory/shared';
import { api } from './api';

export interface ListReturnsParams {
  type?: ReturnTypeDto;
  status?: ReturnStatusDto;
  saleId?: string;
  purchaseEntryId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const listReturns = (params: ListReturnsParams = {}) =>
  api
    .get<PaginatedResult<ReturnDto>>('/returns', { params })
    .then((r) => r.data);

export const getReturn = (id: string) =>
  api.get<ReturnDto>(`/returns/${id}`).then((r) => r.data);

export const createReturn = (input: CreateReturnInput) =>
  api.post<ReturnDto>('/returns', input).then((r) => r.data);

export const cancelReturn = (id: string, input: CancelReturnInput) =>
  api.post<ReturnDto>(`/returns/${id}/cancel`, input).then((r) => r.data);

/**
 * Cantidad ya devuelta por cada saleItem de una venta. El form de devolución
 * de cliente lo usa para calcular el máximo permitido por línea.
 */
export const getReturnedQtyBySale = (saleId: string) =>
  api
    .get<ReturnedQtyDto[]>(`/returns/by-sale/${saleId}/returned-qty`)
    .then((r) => r.data);

/**
 * Ronda 11 — análogo para compras. Devuelve qty acumulada devuelta por
 * cada `purchaseEntryItemId`. Lo consume el SupplierReturnForm para
 * limitar el máximo permitido por línea (anti-doble-devolución).
 */
export interface ReturnedQtyByPurchaseDto {
  purchaseEntryItemId: string;
  qty: number;
}
export const getReturnedQtyByPurchase = (purchaseEntryId: string) =>
  api
    .get<ReturnedQtyByPurchaseDto[]>(
      `/returns/by-purchase/${purchaseEntryId}/returned-qty`,
    )
    .then((r) => r.data);
