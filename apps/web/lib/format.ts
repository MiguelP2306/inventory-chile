// Helpers de formato visual. La API devuelve decimales como string para no
// perder precisión; estas funciones los convierten a texto legible.

const CURRENCY_LOCALE = 'es-AR';
const CURRENCY_CODE = 'ARS';

const currencyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: 'currency',
  currency: CURRENCY_CODE,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return currencyFormatter.format(n);
}

export function formatNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return numberFormatter.format(n);
}

// Zona horaria del negocio (Chile). Usar SIEMPRE para los defaults de los
// `<input type="date">` y los rangos por fecha, en vez de `toISOString()` (que
// devuelve la fecha en UTC y, de noche en Chile, adelanta un día).
const BUSINESS_TZ = 'America/Santiago';

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha de hoy en hora Chile como `YYYY-MM-DD`. */
export function todayIso(): string {
  return isoDateFormatter.format(new Date());
}

/** Fecha de hace `days` días en hora Chile como `YYYY-MM-DD`. */
export function isoDaysAgo(days: number): string {
  return isoDateFormatter.format(new Date(Date.now() - days * 86_400_000));
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convierte una fecha-solo-día (`YYYY-MM-DD`, como las que devuelven las series
 * diarias de la API) a un `Date` seguro para formatear.
 *
 * `new Date('2026-07-30')` la ancla a MEDIANOCHE UTC y, al mostrarla en Chile
 * (UTC-3/-4), retrocede al día anterior: el gráfico etiquetaba cada punto con
 * el día previo. Anclamos al MEDIODÍA local, que nunca cruza el borde del día.
 *
 * Los valores que ya traen hora (ISO completo con `T`) se parsean tal cual.
 */
export function parseIsoDateLocal(value: string): Date {
  if (DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  return new Date(value);
}
