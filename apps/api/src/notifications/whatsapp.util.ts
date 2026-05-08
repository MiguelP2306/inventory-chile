/**
 * Builders para los links `wa.me` que abre el frontend en una nueva pestaña.
 * El backend NO envía nada por la Cloud API de WhatsApp en Fase 6 — solo arma
 * la URL pre-poblada con texto. La decisión está documentada en PLAN.md.
 */

function cleanPhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function buildWhatsAppUrl(phone: string, text: string): string {
  const clean = cleanPhone(phone);
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export interface QuotationMessageInput {
  customerName: string | null;
  number: string;
  totalFormatted: string;
  publicUrl: string;
}

export function buildQuotationMessage(input: QuotationMessageInput): string {
  const greeting = input.customerName
    ? `Hola ${input.customerName}`
    : 'Hola';
  return `${greeting}, te envío la cotización ${input.number} por un total de ${input.totalFormatted}. La podés ver y descargar acá: ${input.publicUrl}`;
}
