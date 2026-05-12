// Wrappers tipados sobre axios para Bodegas (Fase 7.5).

import type {
  CreateWarehouseInput,
  PaginatedResult,
  UpdateWarehouseInput,
  WarehouseDto,
} from '@inventory/shared';
import { api } from './api';

export interface ListWarehousesParams {
  q?: string;
  // 'true' devuelve solo activas (usado por selectores de venta/transferencia).
  // Sin filtro o 'false' devuelve todas (pantalla /almacenes).
  active?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}

export const listWarehouses = (params: ListWarehousesParams = {}) =>
  api
    .get<WarehouseDto[] | PaginatedResult<WarehouseDto>>('/warehouses', {
      params,
    })
    .then((r) => r.data);

export const getWarehouse = (id: string) =>
  api.get<WarehouseDto>(`/warehouses/${id}`).then((r) => r.data);

export const createWarehouse = (input: CreateWarehouseInput) =>
  api.post<WarehouseDto>('/warehouses', input).then((r) => r.data);

export const updateWarehouse = (id: string, input: UpdateWarehouseInput) =>
  api.patch<WarehouseDto>(`/warehouses/${id}`, input).then((r) => r.data);

export const deleteWarehouse = (id: string) =>
  api
    .delete<{ ok: true; softDeleted: boolean }>(`/warehouses/${id}`)
    .then((r) => r.data);
