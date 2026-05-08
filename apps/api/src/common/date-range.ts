/**
 * Convierte un string `YYYY-MM-DD` (input nativo de `<input type="date">`) en
 * un par de bordes inclusivos del día en la zona horaria del servidor:
 *
 *   from = `<fecha>T00:00:00.000` local
 *   to   = `<fecha>T23:59:59.999` local
 *
 * Esto resuelve el bug donde `new Date('2026-05-07')` se parsea como UTC
 * medianoche y deja afuera todos los movimientos posteriores a las 00:00 UTC
 * (es decir, casi todos en zonas horarias negativas como Chile/Argentina).
 *
 * Si solo se provee una de las dos cotas, se usa un sentinel ancho para la otra.
 */
const SENTINEL_FROM = new Date('1900-01-01T00:00:00.000');
const SENTINEL_TO = new Date('2999-12-31T23:59:59.999');

function parseStartOfDay(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T00:00:00.000`);
}

function parseEndOfDay(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T23:59:59.999`);
}

export function dayRange(
  dateFrom?: string,
  dateTo?: string,
): { from: Date; to: Date } {
  const from = dateFrom ? parseStartOfDay(dateFrom) : SENTINEL_FROM;
  const to = dateTo ? parseEndOfDay(dateTo) : SENTINEL_TO;
  return { from, to };
}
