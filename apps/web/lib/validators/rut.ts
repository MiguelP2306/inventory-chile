// Espejo del validador del backend (apps/api/src/common/validators/rut.ts).
// Mantenelos sincronizados — si cambia uno, cambiá el otro.

export function normalizeRut(input: string): string {
  if (!input) return input;
  const cleaned = input.replace(/[.\s]/g, '').toUpperCase();
  if (!cleaned.includes('-') && cleaned.length >= 2) {
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    return `${body}-${dv}`;
  }
  return cleaned;
}

export function computeRutDv(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return '0';
  if (mod === 10) return 'K';
  return String(mod);
}

export function isValidRut(input: string): boolean {
  if (typeof input !== 'string') return false;
  const normalized = normalizeRut(input);
  const match = /^(\d{7,8})-([0-9K])$/.exec(normalized);
  if (!match) return false;
  const [, body, dv] = match;
  return computeRutDv(body!) === dv;
}

/** Formato visual con puntos: `12.345.678-9`. */
export function formatRutPretty(input: string): string {
  const normalized = normalizeRut(input);
  const match = /^(\d{1,8})-([0-9K])$/.exec(normalized);
  if (!match) return input;
  const [, body, dv] = match;
  const withDots = body!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}
