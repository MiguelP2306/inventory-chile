// Helpers tipados sobre axios para Inventory + Suppliers + Purchases.

import type {
  MovementDto,
  PaginatedResult,
  PurchaseEntryDto,
  StockStatus,
  StockSummary,
  SupplierDto,
} from '@inventory/shared';
import { api } from './api';

// ---------- Suppliers ----------
export const listSuppliers = (q?: string) =>
  api
    .get<SupplierDto[]>('/suppliers', { params: q ? { q } : {} })
    .then((r) => r.data);

export interface ListSuppliersParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export const listSuppliersPaginated = (params: ListSuppliersParams) =>
  api
    .get<PaginatedResult<SupplierDto>>('/suppliers', { params })
    .then((r) => r.data);

export const getSupplier = (id: string) =>
  api.get<SupplierDto>(`/suppliers/${id}`).then((r) => r.data);

export interface SupplierInput {
  name: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export const createSupplier = (input: SupplierInput) =>
  api.post<SupplierDto>('/suppliers', input).then((r) => r.data);

export const updateSupplier = (id: string, input: Partial<SupplierInput>) =>
  api.patch<SupplierDto>(`/suppliers/${id}`, input).then((r) => r.data);

export const deleteSupplier = (id: string) =>
  api.delete(`/suppliers/${id}`).then((r) => r.data);

// ---------- Inventory ----------
export interface ListStockParams {
  q?: string;
  warehouseId?: string;
  status?: StockStatus;
}

export const listStock = (params: ListStockParams = {}) =>
  api.get<StockSummary[]>('/inventory/stock', { params }).then((r) => r.data);

export interface ListStockPaginatedParams extends ListStockParams {
  page?: number;
  pageSize?: number;
}

export const listStockPaginated = (params: ListStockPaginatedParams) =>
  api
    .get<PaginatedResult<StockSummary>>('/inventory/stock', { params })
    .then((r) => r.data);

export interface ListMovementsParams {
  productId?: string;
  warehouseId?: string;
  type?: MovementDto['type'];
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export const listMovements = (params: ListMovementsParams = {}) =>
  api
    .get<PaginatedResult<MovementDto>>('/inventory/movements', { params })
    .then((r) => r.data);

export interface AdjustInput {
  productId: string;
  warehouseId?: string;
  qty: number;
  reason: string;
  unitCost?: string;
}

export const adjustStock = (input: AdjustInput) =>
  api
    .post<{ movement: MovementDto; reason: string }>('/inventory/adjust', input)
    .then((r) => r.data);

// ---------- Location code (Fase 7.5) ----------

export interface SetLocationInput {
  productId: string;
  warehouseId: string;
  // null o string vacío para limpiar
  locationCode: string | null;
}

export const setStockLocation = (input: SetLocationInput) =>
  api
    .patch<{ stockId: string; locationCode: string | null }>(
      '/inventory/stock/location',
      input,
    )
    .then((r) => r.data);

// ---------- Purchases ----------
export interface PurchaseItemInput {
  productId: string;
  qty: number;
  unitCost: string;
}

export interface PurchaseInput {
  supplierId: string;
  warehouseId?: string;
  date?: string;
  notes?: string;
  // Fase 5: factura adjunta (ahora N archivos, Ronda 7) + override del IVA
  // cuando la factura del proveedor tiene un redondeo distinto del
  // auto-calculado.
  invoiceUrls?: string[];
  taxAmountOverride?: string;
  items: PurchaseItemInput[];
}

export interface ListPurchasesParams {
  supplierId?: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
  // Ronda 7 — filtros por rango de total (bruto, con IVA).
  totalMin?: string;
  totalMax?: string;
  page?: number;
  pageSize?: number;
}

export const listPurchases = (params: ListPurchasesParams = {}) =>
  api
    .get<PaginatedResult<PurchaseEntryDto>>('/purchases', { params })
    .then((r) => r.data);

export const getPurchase = (id: string) =>
  api.get<PurchaseEntryDto>(`/purchases/${id}`).then((r) => r.data);

export const createPurchase = (input: PurchaseInput) =>
  api.post<PurchaseEntryDto>('/purchases', input).then((r) => r.data);

// ---------- Ronda 7: facturas múltiples por compra ----------

export interface AddInvoiceFile {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export const addPurchaseInvoices = (purchaseId: string, files: AddInvoiceFile[]) =>
  api
    .post<import('@inventory/shared').PurchaseInvoiceDto[]>(
      `/purchases/${purchaseId}/invoices`,
      { files },
    )
    .then((r) => r.data);

export const removePurchaseInvoice = (purchaseId: string, invoiceId: string) =>
  api.delete(`/purchases/${purchaseId}/invoices/${invoiceId}`).then((r) => r.data);
