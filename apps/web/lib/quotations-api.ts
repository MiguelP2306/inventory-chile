// Wrappers tipados sobre axios para Cotizaciones (Fase 6).

import type {
  PaginatedResult,
  PublicQuotationDto,
  QuotationDto,
  QuotationSendResultDto,
  QuotationStatusDto,
} from '@inventory/shared';
import { api } from './api';

export interface CreateQuotationItemInput {
  // Ronda 9 — productId opcional para soportar productos temporales creados
  // al vuelo desde el ProductPicker.
  productId?: string | null;
  tempProductName?: string | null;
  tempProductSku?: string | null;
  tempProductPartNumber?: string | null;
  qty: number;
  unitPrice: string;
  discount?: string;
  discountPercent?: string | null;
  // Observación libre por ítem (opcional).
  observation?: string | null;
}

export interface CreateQuotationInput {
  customerId?: string | null;
  customerNameSnapshot?: string | null;
  customerPhoneSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  customerTaxIdSnapshot?: string | null;
  date: string;
  validUntil?: string | null;
  notes?: string | null;
  items: CreateQuotationItemInput[];
}

export type UpdateQuotationInput = Partial<CreateQuotationInput>;

export interface ListQuotationsParams {
  status?: QuotationStatusDto;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface RejectInput {
  notes?: string;
}

export interface ConvertResultDto {
  prefill: {
    quotationId: string;
    customerId: string | null;
    customerSnapshot: {
      name: string | null;
      taxId: string | null;
      email: string | null;
      phone: string | null;
    };
    items: Array<{
      productId: string;
      qty: number;
      unitPrice: string;
      discount: string;
      discountPercent: string | null;
      observation: string | null;
    }>;
    subtotal: string;
    taxAmount: string;
    total: string;
    notes: string | null;
  };
}

export const listQuotations = (params: ListQuotationsParams = {}) =>
  api
    .get<PaginatedResult<QuotationDto>>('/quotations', { params })
    .then((r) => r.data);

export const getQuotation = (id: string) =>
  api.get<QuotationDto>(`/quotations/${id}`).then((r) => r.data);

export const createQuotation = (input: CreateQuotationInput) =>
  api.post<QuotationDto>('/quotations', input).then((r) => r.data);

export const updateQuotation = (id: string, input: UpdateQuotationInput) =>
  api.patch<QuotationDto>(`/quotations/${id}`, input).then((r) => r.data);

export const deleteQuotation = (id: string) =>
  api.delete(`/quotations/${id}`).then((r) => r.data);

export const approveQuotation = (id: string) =>
  api.post<QuotationDto>(`/quotations/${id}/approve`).then((r) => r.data);

export const rejectQuotation = (id: string, input: RejectInput = {}) =>
  api.post<QuotationDto>(`/quotations/${id}/reject`, input).then((r) => r.data);

export const convertQuotation = (id: string) =>
  api.post<ConvertResultDto>(`/quotations/${id}/convert`).then((r) => r.data);

// Si se pasa `to`, sobrescribe el destino y (para cliente libre) lo persiste
// en el snapshot — la próxima vez no hace falta volver a ingresarlo.
export interface WhatsappSendResult
  extends Omit<QuotationSendResultDto, 'whatsappUrl'> {
  // Link al número registrado del cliente (null si no tiene número).
  whatsappUrl: string | null;
  // Link sin número: el usuario elige el contacto en WhatsApp. Siempre presente.
  whatsappChooseUrl: string;
  phone: string | null;
}

export const sendWhatsapp = (id: string, to?: string) =>
  api
    .post<WhatsappSendResult>(
      `/quotations/${id}/send/whatsapp`,
      to ? { to } : {},
    )
    .then((r) => r.data);

export const sendEmail = (id: string, to?: string) =>
  api
    .post<QuotationSendResultDto>(`/quotations/${id}/send/email`, to ? { to } : {})
    .then((r) => r.data);

// El backend devuelve PDF binario. El frontend abre la URL directamente con
// `<a target="_blank">` o `window.open`, así que devolvemos sólo la URL completa.
export type PdfFormat = 'letter' | 'thermal80';

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  );
}

export function getPdfUrl(id: string, format: PdfFormat = 'letter'): string {
  return `${apiBase()}/quotations/${id}/pdf?format=${format}`;
}

// ---------- Endpoints públicos (sin auth) ----------

export const getPublicQuotation = async (token: string) => {
  const res = await fetch(`${apiBase()}/public/quotations/${token}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = new Error('Public quotation fetch failed') as Error & {
      status: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as PublicQuotationDto;
};

export function getPublicPdfUrl(
  token: string,
  format: PdfFormat = 'letter',
): string {
  return `${apiBase()}/public/quotations/${token}/pdf?format=${format}`;
}
