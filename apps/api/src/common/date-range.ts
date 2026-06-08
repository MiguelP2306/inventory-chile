/**
 * Convierte un string `YYYY-MM-DD` (input nativo de `<input type="date">`) en
 * un par de bordes inclusivos del día en la ZONA HORARIA DEL NEGOCIO
 * (America/Santiago por default — ver `timezone.ts`):
 *
 *   from = `<fecha>T00:00:00.000` hora Chile (instante UTC)
 *   to   = `<fecha>T23:59:59.999` hora Chile (instante UTC)
 *
 * Antes se usaba la hora del SERVIDOR (UTC en la nube), lo que desfasaba los
 * filtros respecto del día real de la empresa. Ahora los bordes se calculan en
 * la zona del negocio.
 *
 * Si solo se provee una de las dos cotas, se usa un sentinel ancho para la otra.
 */
import { endOfBusinessDay, startOfBusinessDay } from './timezone';

const SENTINEL_FROM = new Date('1900-01-01T00:00:00.000Z');
const SENTINEL_TO = new Date('2999-12-31T23:59:59.999Z');

export function dayRange(
  dateFrom?: string,
  dateTo?: string,
): { from: Date; to: Date } {
  const from = dateFrom ? startOfBusinessDay(dateFrom) : SENTINEL_FROM;
  const to = dateTo ? endOfBusinessDay(dateTo) : SENTINEL_TO;
  return { from, to };
}
