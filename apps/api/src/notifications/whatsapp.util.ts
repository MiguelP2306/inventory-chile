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

/**
 * Link de WhatsApp SIN número: abre WhatsApp (Web o app) con el texto
 * pre-cargado y deja que el usuario ELIJA el contacto destino. Útil cuando el
 * cliente no tiene número registrado o cuando se quiere mandar a otra persona.
 *
 * Limitación de WhatsApp Web: `wa.me/?text=` abre el selector de chats con el
 * texto listo, pero el usuario debe elegir el contacto manualmente (no se puede
 * preseleccionar sin número). En desktop requiere WhatsApp Web logueado.
 */
export function buildWhatsAppChooseUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
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
