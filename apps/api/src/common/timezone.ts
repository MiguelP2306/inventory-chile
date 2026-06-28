/**
 * Zona horaria del negocio (Fase 12). El servidor en la nube corre en UTC, lo
 * que provocaba que las fechas-solo-día (`YYYY-MM-DD`) parseadas con
 * `new Date('2026-06-05')` quedaran ancladas a MEDIANOCHE UTC y, al mostrarse
 * en Chile (UTC-3/-4), retrocedieran al día anterior.
 *
 * Estrategia:
 *  - Toda fecha "de negocio" (fecha de un egreso, compra, venta, cotización,
 *    etc.) se ancla al MEDIODÍA de la zona del negocio. El mediodía nunca cruza
 *    el límite del día ni en UTC ni en Chile, así que el día calendario se
 *    preserva sin importar dónde se formatee, y `DATE()` en MySQL agrupa bien.
 *  - Los rangos de día para filtros/reportes se calculan como instantes UTC de
 *    las 00:00:00 y 23:59:59.999 de la zona del negocio.
 *
 * La zona es fija `America/Santiago` (deploy chileno), con override por la
 * variable de entorno `APP_TZ` por si se reusa el sistema en otra región.
 */

export const BUSINESS_TZ = process.env.APP_TZ ?? 'America/Santiago';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Offset (en ms) de la zona `tz` respecto de UTC para el instante `date`.
 * Positivo cuando la zona está adelantada a UTC. Usa Intl (sin dependencias).
 */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUTC - date.getTime();
}

/**
 * Convierte una hora "de pared" en la zona del negocio a un instante UTC.
 * Ej: 2026-06-05 12:00 en America/Santiago → Date(2026-06-05T16:00:00Z).
 */
function zonedWallTimeToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  s: number,
  ms: number,
  tz: string = BUSINESS_TZ,
): Date {
  // Primera aproximación: interpretamos la hora de pared como si fuera UTC.
  const utcGuess = Date.UTC(y, m - 1, d, h, min, s, ms);
  // Corregimos por el offset real de la zona en ese instante. Como el mediodía
  // y los bordes de día no caen en saltos DST, una sola corrección alcanza.
  const offset = tzOffsetMs(new Date(utcGuess), tz);
  return new Date(utcGuess - offset);
}

/** Parsea `YYYY-MM-DD` (o `Y-M-D`) en sus componentes numéricos. */
function parseYmd(yyyymmdd: string): [number, number, number] {
  const [y, m, d] = yyyymmdd.split('-').map((p) => Number(p));
  return [y!, m!, d!];
}

/**
 * Convierte un valor de fecha proveniente de un input a un Date anclado al
 * MEDIODÍA de la zona del negocio cuando es fecha-solo-día (`YYYY-MM-DD`). Si
 * ya trae hora (ISO completo), se respeta tal cual.
 */
export function parseBusinessDate(input: string): Date {
  if (DATE_ONLY_RE.test(input)) {
    const [y, m, d] = parseYmd(input);
    return zonedWallTimeToUtc(y, m, d, 12, 0, 0, 0);
  }
  return new Date(input);
}

/** "Hoy" en la zona del negocio, anclado al mediodía (instante UTC). */
export function businessNoonToday(): Date {
  const today = businessTodayStr();
  const [y, m, d] = parseYmd(today);
  return zonedWallTimeToUtc(y, m, d, 12, 0, 0, 0);
}

/**
 * Resuelve la fecha de negocio para CREAR una venta o compra, aplicando las
 * reglas de permisos:
 *  - Sin fecha explícita → hoy.
 *  - Con fecha pero el usuario NO es admin → se ignora y se usa hoy. Solo el
 *    admin puede registrar con otra fecha (backdating).
 *  - Con fecha y admin → se respeta tal cual (se permiten fechas pasadas y futuras).
 */
export function resolveCreationDate(
  rawDate: string | undefined | null,
  isAdmin: boolean,
): Date {
  if (!rawDate || !isAdmin) return businessNoonToday();
  return parseBusinessDate(rawDate);
}

/** Fecha de hoy en la zona del negocio como `YYYY-MM-DD`. */
export function businessTodayStr(now: Date = new Date()): string {
  // en-CA da formato YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Inicio del día (00:00:00.000) de `YYYY-MM-DD` en la zona del negocio. */
export function startOfBusinessDay(yyyymmdd: string): Date {
  const [y, m, d] = parseYmd(yyyymmdd);
  return zonedWallTimeToUtc(y, m, d, 0, 0, 0, 0);
}

/** Fin del día (23:59:59.999) de `YYYY-MM-DD` en la zona del negocio. */
export function endOfBusinessDay(yyyymmdd: string): Date {
  const [y, m, d] = parseYmd(yyyymmdd);
  return zonedWallTimeToUtc(y, m, d, 23, 59, 59, 999);
}

/** Primer día del mes actual (00:00) de la zona del negocio, como instante UTC. */
export function startOfBusinessMonth(now: Date = new Date()): Date {
  const ymd = businessTodayStr(now);
  const [y, m] = parseYmd(ymd);
  return zonedWallTimeToUtc(y, m, 1, 0, 0, 0, 0);
}
