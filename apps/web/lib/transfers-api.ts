// Wrappers tipados sobre axios para Transferencias entre bodegas (Fase 7.5).

import type {
  CancelTransferInput,
  CreateTransferInput,
  PaginatedResult,
  TransferDto,
  TransferStatusDto,
} from '@inventory/shared';
import { api } from './api';

export interface ListTransfersParams {
  status?: TransferStatusDto;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const listTransfers = (params: ListTransfersParams = {}) =>
  api
    .get<PaginatedResult<TransferDto>>('/transfers', { params })
    .then((r) => r.data);

export const getTransfer = (id: string) =>
  api.get<TransferDto>(`/transfers/${id}`).then((r) => r.data);

export const createTransfer = (input: CreateTransferInput) =>
  api.post<TransferDto>('/transfers', input).then((r) => r.data);

export const cancelTransfer = (id: string, input: CancelTransferInput) =>
  api.post<TransferDto>(`/transfers/${id}/cancel`, input).then((r) => r.data);
