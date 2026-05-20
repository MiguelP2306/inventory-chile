import type {
  PaginatedResult,
  SupplierCreditDto,
  SupplierCreditStatusDto,
} from '@inventory/shared';
import { api } from './api';

export interface ListSupplierCreditsParams {
  supplierId?: string;
  status?: SupplierCreditStatusDto;
  page?: number;
  pageSize?: number;
}

export const listSupplierCredits = (params: ListSupplierCreditsParams = {}) =>
  api
    .get<PaginatedResult<SupplierCreditDto>>('/supplier-credits', { params })
    .then((r) => r.data);

// Créditos ACTIVOS con balance > 0 para un proveedor. Lo consume el form de
// compra para mostrar la sección "Aplicar crédito disponible".
export const listAvailableSupplierCredits = (supplierId: string) =>
  api
    .get<SupplierCreditDto[]>(`/supplier-credits/available/${supplierId}`)
    .then((r) => r.data);

export interface ManualSupplierCreditInput {
  supplierId: string;
  amount: string;
  notes?: string | null;
}

export const createManualSupplierCredit = (input: ManualSupplierCreditInput) =>
  api
    .post<SupplierCreditDto>('/supplier-credits', input)
    .then((r) => r.data);

export const voidSupplierCredit = (id: string) =>
  api.post(`/supplier-credits/${id}/void`).then((r) => r.data);
