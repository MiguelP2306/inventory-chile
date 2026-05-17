// Wrappers tipados sobre axios para Lifecycle / Seguimiento (Fase 8.5).

import type {
  CustomerDto,
  FollowUpListDto,
  FollowUpTab,
  HubspotTestResultDto,
  LeadEventDto,
} from '@inventory/shared';
import { api } from './api';

export interface FollowUpListParams {
  tab?: FollowUpTab;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const listFollowUps = (params: FollowUpListParams = {}) =>
  api
    .get<FollowUpListDto>('/follow-ups', { params })
    .then((r) => r.data);

export const touchCustomer = (customerId: string) =>
  api
    .post<CustomerDto>(`/customers/${customerId}/touch`, {})
    .then((r) => r.data);

export const markCustomerLost = (customerId: string, reason: string) =>
  api
    .post<CustomerDto>(`/customers/${customerId}/mark-lost`, { reason })
    .then((r) => r.data);

export const testHubspotSync = () =>
  api.post<HubspotTestResultDto>('/hubspot/test', {}).then((r) => r.data);

/**
 * Ronda 7 — histórico de eventos de un cliente (timeline). Usado por la
 * tab "Histórico" del detalle del cliente.
 */
export const listCustomerEvents = (customerId: string) =>
  api
    .get<LeadEventDto[]>(`/customers/${customerId}/events`)
    .then((r) => r.data);

/**
 * Construye una URL `wa.me` desde un teléfono E.164 y un mensaje pre-formado.
 * Si el teléfono está vacío o no parece E.164, devuelve null (la UI lo
 * usa para deshabilitar el botón). El mensaje se URL-encodea.
 */
export function buildWhatsappUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Reemplaza los tokens `{cliente}`, `{cotizacion}`, `{total}`, `{link}` en
 * la plantilla con los valores reales. Tokens no provistos quedan vacíos
 * (mejor que dejar literal `{token}` visible para el cliente final).
 */
export function applyWhatsappTokens(
  template: string,
  tokens: Partial<Record<'cliente' | 'cotizacion' | 'total' | 'link', string>>,
): string {
  return template
    .replace(/\{cliente\}/g, tokens.cliente ?? '')
    .replace(/\{cotizacion\}/g, tokens.cotizacion ?? '')
    .replace(/\{total\}/g, tokens.total ?? '')
    .replace(/\{link\}/g, tokens.link ?? '');
}
