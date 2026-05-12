// Wrappers tipados sobre axios para Guías de despacho (Fase 7.7).

import type {
  CreateDispatchNoteInput,
  DispatchNoteDto,
  DispatchStatusDto,
  PaginatedResult,
  VoidDispatchNoteInput,
} from '@inventory/shared';
import { api } from './api';

export interface ListDispatchNotesParams {
  status?: DispatchStatusDto;
  saleId?: string;
  carrier?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const listDispatchNotes = (params: ListDispatchNotesParams = {}) =>
  api
    .get<PaginatedResult<DispatchNoteDto>>('/dispatch', { params })
    .then((r) => r.data);

export const getDispatchNote = (id: string) =>
  api.get<DispatchNoteDto>(`/dispatch/${id}`).then((r) => r.data);

export const createDispatchNote = (input: CreateDispatchNoteInput) =>
  api.post<DispatchNoteDto>('/dispatch', input).then((r) => r.data);

export const voidDispatchNote = (id: string, input: VoidDispatchNoteInput) =>
  api.post<DispatchNoteDto>(`/dispatch/${id}/void`, input).then((r) => r.data);

/**
 * Lista de transportistas recientemente usados. Lo consume el form como
 * sugerencias autocompletables — sin necesidad de un CRUD dedicado de
 * transportistas.
 */
export const listRecentCarriers = () =>
  api.get<string[]>('/dispatch/recent-carriers').then((r) => r.data);

/**
 * Devuelve la guía activa de una venta (o null). El detalle de venta lo usa
 * para mostrar "Generar guía" vs "Ver guía existente".
 */
export const getActiveDispatchBySale = (saleId: string) =>
  api
    .get<DispatchNoteDto | null>(`/dispatch/by-sale/${saleId}/active`)
    .then((r) => r.data);

export type PdfFormat = 'letter' | 'thermal80';

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  );
}

export function getDispatchPdfUrl(
  id: string,
  format: PdfFormat = 'letter',
): string {
  return `${apiBase()}/dispatch/${id}/pdf?format=${format}`;
}
