// Wrappers tipados sobre axios para Reclamos de Garantía (Fase 7.6).

import type {
  CreateWarrantyClaimInput,
  PaginatedResult,
  UpdateWarrantyClaimStatusInput,
  WarrantyClaimDto,
  WarrantyStatusDto,
} from '@inventory/shared';
import { api } from './api';

export interface ListWarrantyClaimsParams {
  status?: WarrantyStatusDto;
  customerId?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const listWarrantyClaims = (params: ListWarrantyClaimsParams = {}) =>
  api
    .get<PaginatedResult<WarrantyClaimDto>>('/warranties', { params })
    .then((r) => r.data);

export const getWarrantyClaim = (id: string) =>
  api.get<WarrantyClaimDto>(`/warranties/${id}`).then((r) => r.data);

export const createWarrantyClaim = (input: CreateWarrantyClaimInput) =>
  api.post<WarrantyClaimDto>('/warranties', input).then((r) => r.data);

export const updateWarrantyClaimStatus = (
  id: string,
  input: UpdateWarrantyClaimStatusInput,
) =>
  api
    .patch<WarrantyClaimDto>(`/warranties/${id}/status`, input)
    .then((r) => r.data);

export const linkReturnToWarranty = (id: string, returnId: string) =>
  api
    .post<WarrantyClaimDto>(`/warranties/${id}/link-return/${returnId}`)
    .then((r) => r.data);
