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
  items: PurchaseItemInput[];
}

export interface ListPurchasesParams {
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
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
