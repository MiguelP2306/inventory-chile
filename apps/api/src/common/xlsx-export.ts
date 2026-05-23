import type { Response } from 'express';
import type { Worksheet } from 'exceljs';

/**
 * Helpers transversales para exportar listados a XLSX con estilo consistente
 * (Fase 10 polish — Mayo 2026).
 *
 * Convenciones aplicadas a todos los exports:
 *  - Encabezado en negrita con fondo gris claro.
 *  - Primera fila congelada (freeze pane).
 *  - AutoFilter sobre todas las columnas para que el usuario pueda filtrar/
 *    ordenar el XLSX después de descargarlo.
 *  - Formato monetario `#,##0` para columnas de plata (sin decimales — Chile
 *    no usa centavos en CLP).
 *  - Fechas en formato `yyyy-mm-dd` para que Excel las reconozca como Date
 *    y permita ordenar correctamente.
 *
 * Cómo usar:
 *
 *   const wb = newWorkbook();
 *   const sheet = wb.addWorksheet('Clientes');
 *   sheet.columns = [
 *     { header: 'RUT', key: 'taxId', width: 14 },
 *     { header: 'Total compras', key: 'total', width: 16, style: { numFmt: MONEY_FMT } },
 *   ];
 *   for (const row of data) sheet.addRow(row);
 *   stylizeSheet(sheet);
 *   await sendXlsx(res, wb, 'clientes');
 */

export const MONEY_FMT = '#,##0';
export const MONEY_DECIMAL_FMT = '#,##0.00';
export const DATE_FMT = 'yyyy-mm-dd';
export const DATETIME_FMT = 'yyyy-mm-dd hh:mm';

const HEADER_FILL_COLOR = 'FFE5E7EB'; // gray-200 — neutral, imprime bien en B/N

/**
 * Aplica el estilo estándar a una hoja:
 *  - Header bold + fill gris.
 *  - Freeze pane sobre la primera fila.
 *  - AutoFilter sobre todo el rango usado.
 *
 * Llamar SIEMPRE después de cargar las columnas y todas las filas; depende de
 * `sheet.columnCount` y `sheet.rowCount` para calcular el rango del filtro.
 */
export function stylizeSheet(sheet: Worksheet): void {
  // Header
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL_COLOR },
  };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  // Freeze pane
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // AutoFilter sobre todas las columnas/filas con datos. Si la hoja está
  // vacía (solo el header), igual seteamos el filtro sobre la primera fila
  // — Excel lo respeta y queda listo cuando el operador pegue datos.
  const lastCol = sheet.columnCount;
  const lastRow = Math.max(sheet.rowCount, 1);
  if (lastCol > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastRow, column: lastCol },
    };
  }
}

/**
 * Setea headers HTTP y envía el workbook como descarga. El nombre incluye la
 * fecha de hoy en formato ISO corto para que el operador no sobreescriba
 * exports anteriores cuando descarga el mismo reporte en días distintos.
 */
export async function sendXlsx(
  res: Response,
  workbook: { xlsx: { writeBuffer: () => Promise<ArrayBuffer | Buffer> } },
  baseName: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${baseName}-${today}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`,
  );
  res.send(Buffer.from(buffer as ArrayBuffer));
}

/**
 * Devuelve `null` si el valor pasado no parsea a número finito. Útil para
 * convertir `decimal` columns de TypeORM (que vienen como `string`) a número
 * antes de escribir la celda — así Excel los entiende como número y aplica
 * el `numFmt` configurado.
 */
export function toNumber(input: string | number | null | undefined): number | null {
  if (input == null || input === '') return null;
  const n = typeof input === 'number' ? input : Number(input);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convierte un valor de fecha (Date | string ISO | null) a una instancia
 * Date que ExcelJS sabe escribir con el formato `yyyy-mm-dd`. Devuelve null
 * si la entrada está vacía o es inválida.
 */
export function toDate(input: Date | string | null | undefined): Date | null {
  if (input == null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Pagina automáticamente a través de un service paginado y devuelve la lista
 * completa. Útil cuando el export tiene que descargar TODOS los matches pero
 * el `list()` del service tiene un `pageSize` máximo de 200 (limitación
 * impuesta por validación en el DTO).
 *
 * Para listados muy grandes (>5000 filas) el resultado puede demorar; se
 * cortocircuita en `maxRows` (50000 por default) para evitar OOM.
 */
export async function fetchAllPages<T>(
  fetcher: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 200;
  const maxRows = options.maxRows ?? 50000;
  const all: T[] = [];
  let page = 1;
  // Safety net: hard-cap de iteraciones aunque algo se cuelgue.
  for (let i = 0; i < 1000; i += 1) {
    const { items, total } = await fetcher(page, pageSize);
    all.push(...items);
    if (all.length >= total || items.length < pageSize || all.length >= maxRows) {
      break;
    }
    page += 1;
  }
  return all;
}
