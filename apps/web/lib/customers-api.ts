// Wrappers tipados sobre axios para clientes (Fase 4) y catálogo de comunas.

import type {
  CommuneDto,
  CustomerDto,
  PaginatedResult,
  PurchaseEntryDto,
} from '@inventory/shared';
import { api } from './api';

// ---------- Customers ----------

export interface ListCustomersParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export const listCustomers = (params: ListCustomersParams = {}) =>
  api
    .get<CustomerDto[] | PaginatedResult<CustomerDto>>('/customers', { params })
    .then((r) => r.data);

export const listCustomersPaginated = (params: ListCustomersParams) =>
  api
    .get<PaginatedResult<CustomerDto>>('/customers', { params })
    .then((r) => r.data);

export const getCustomer = (id: string) =>
  api.get<CustomerDto>(`/customers/${id}`).then((r) => r.data);

import type { CustomerSourceDto } from '@inventory/shared';

export interface CustomerInput {
  name: string;
  taxId: string;
  email?: string | null;
  phone?: string | null;
  addressStreet?: string | null;
  addressNumber?: string | null;
  communeId?: string | null;
  internalNotes?: string | null;
  // Fase 8.5
  source?: CustomerSourceDto;
  whatsappPhone?: string | null;
}

export const createCustomer = (input: CustomerInput) =>
  api.post<CustomerDto>('/customers', input).then((r) => r.data);

export const updateCustomer = (id: string, input: Partial<CustomerInput>) =>
  api.patch<CustomerDto>(`/customers/${id}`, input).then((r) => r.data);

export const deleteCustomer = (id: string) =>
  api.delete(`/customers/${id}`).then((r) => r.data);

// ---------- Communes ----------

export const listCommunes = (region?: string) =>
  api
    .get<CommuneDto[]>('/communes', { params: region ? { region } : {} })
    .then((r) => r.data);

// ---------- Supplier purchases ----------

export interface ListSupplierPurchasesParams {
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export const listSupplierPurchases = (
  supplierId: string,
  params: ListSupplierPurchasesParams = {},
) =>
  api
    .get<PaginatedResult<PurchaseEntryDto>>(`/suppliers/${supplierId}/purchases`, {
      params,
    })
    .then((r) => r.data);
