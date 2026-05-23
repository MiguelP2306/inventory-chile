import type { Cell, Worksheet } from 'exceljs';

/**
 * Helpers compartidos para los importadores XLSX (productos, clientes,
 * proveedores). Extraído de `imports.service.ts` durante el polish de la
 * Fase 10 para evitar duplicar la lógica que arregla los 3 bugs principales:
 *
 *  1. Iteración robusta de filas (`sheet.actualRowCount` poco confiable).
 *  2. Lector de celda que maneja fórmulas, richtext, hyperlinks, dates.
 *  3. Parser numérico con detección de formato chileno vs US.
 */

/**
 * Normaliza el texto de un header para comparación: sin acentos, sin
 * caracteres no alfanuméricos, lowercase. `"Código de Barras"` → `"codigodebarras"`.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Lector de celda robusto para ExcelJS. Maneja TODOS los tipos que la librería
 * devuelve en `cell.value`. Reemplaza al `String(v).trim()` original del
 * importer que rompía en fórmulas / richtext / hyperlinks.
 */
export function readCellText(cell: Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';

  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : '';
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString();

  if (typeof v === 'object') {
    // Fórmula o fórmula compartida → usar el `result` evaluado.
    if ('result' in v && (v as { result: unknown }).result != null) {
      const r = (v as { result: unknown }).result;
      if (typeof r === 'string') return r.trim();
      if (typeof r === 'number') return String(r);
      if (typeof r === 'boolean') return r ? 'true' : 'false';
      if (r instanceof Date) return r.toISOString();
      return '';
    }
    // RichText
    if ('richText' in v && Array.isArray((v as { richText: unknown }).richText)) {
      const runs = (v as { richText: Array<{ text?: unknown }> }).richText;
      return runs.map((rt) => String(rt.text ?? '')).join('').trim();
    }
    // Hyperlink (texto visible)
    if ('text' in v) {
      const t = (v as { text: unknown }).text;
      if (typeof t === 'string') return t.trim();
      if (typeof t === 'object' && t && 'richText' in t) {
        const runs = (t as { richText: Array<{ text?: unknown }> }).richText;
        return runs.map((rt) => String(rt.text ?? '')).join('').trim();
      }
    }
    if ('error' in v) return '';
  }

  const s = String(v);
  return s === '[object Object]' ? '' : s.trim();
}

/**
 * Encuentra la fila del header probando hasta `maxScan` filas y devuelve un
 * `{ headerRow, colIndex }` con el mapeo header → índice de columna. Si no
 * encuentra todas las columnas obligatorias (`requiredKeys`), devuelve null.
 *
 * Algunos exporters insertan filas vacías arriba del header (Google Sheets
 * export, Numbers, Looker Studio) y el código original explotaba con un
 * BadRequest poco útil. Acá toleramos esa basura.
 */
export function findHeaderRow<K extends string, R extends K = K>(
  sheet: Worksheet,
  headers: Record<K, string>,
  requiredKeys: R[],
  maxScan = 5,
): { headerRowNumber: number; colIndex: Partial<Record<K, number>> } | null {
  const allKeys = Object.keys(headers) as K[];
  for (let r = 1; r <= Math.min(maxScan, sheet.rowCount); r += 1) {
    const row = sheet.getRow(r);
    const idx: Partial<Record<K, number>> = {};
    row.eachCell({ includeEmpty: false }, (cell, cellIdx) => {
      const normalized = normalizeHeader(readCellText(cell));
      if (!normalized) return;
      for (const key of allKeys) {
        if (normalizeHeader(headers[key]) === normalized) {
          idx[key] = cellIdx;
          break;
        }
      }
    });
    if (requiredKeys.every((k) => idx[k] !== undefined)) {
      return { headerRowNumber: r, colIndex: idx };
    }
  }
  return null;
}

/**
 * Devuelve un upper-bound robusto del último número de fila que vale la pena
 * iterar. `sheet.actualRowCount` puede devolver 1 cuando el XLSX viene de
 * Google Sheets, Numbers, Looker Studio o un copy/paste raro — ese era el
 * bug raíz del "subo 10, importa 1". Acá probamos las 3 vías y tomamos el max.
 */
export function lastDataRow(sheet: Worksheet): number {
  return Math.max(
    sheet.rowCount,
    sheet.actualRowCount,
    sheet.lastRow?.number ?? 0,
  );
}

/**
 * Parser numérico tolerante a formatos regionales mixtos. Ver doc en
 * `imports.service.ts` (movido acá durante el polish).
 *
 *  - `8000`     → 8000
 *  - `8.000`    → 8000
 *  - `8,00`     → 8
 *  - `8.000,50` → 8000.5
 *  - `8,000.50` → 8000.5
 *  - `$ 8.000`  → 8000
 *  - `1.5`      → 1.5
 */
export function parseNumeric(raw: string): number | null {
  if (raw === '' || raw == null) return null;

  // OJO: NO usamos un early-return tipo `if (/^-?\d+(\.\d+)?$/.test(raw))`
  // aunque pareciera más rápido. `Number("8.000") === 8`, lo cual romperia
  // la heurística chilena (donde "8.000" debe leerse como 8000). Pagamos
  // los ~µs de pasar siempre por el switch hasta abajo.

  // Atajo SOLO para enteros puros sin separadores — siempre seguros.
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  let s = raw.replace(/[\s$€¥£₡₱]/g, '').replace(/^\+/, '');
  if (s === '') return null;

  let isNegative = false;
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1);
  }

  if (!/^[\d.,]+$/.test(s)) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  let normalized: string;
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot > lastComma) {
      normalized = s.replace(/,/g, '');
    } else {
      normalized = s.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length > 2) {
      normalized = s.replace(/,/g, '');
    } else {
      normalized = s.replace(',', '.');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    const intPart = parts[0] ?? '';
    const decPart = parts[1] ?? '';
    if (parts.length > 2) {
      normalized = s.replace(/\./g, '');
    } else if (
      parts.length === 2 &&
      intPart.length >= 1 &&
      decPart.length === 3 &&
      /^\d+$/.test(decPart)
    ) {
      normalized = s.replace(/\./g, '');
    } else {
      normalized = s;
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return isNegative ? -n : n;
}

export function parseInteger(raw: string): number | null {
  if (raw === '' || raw == null) return null;
  const n = parseNumeric(raw);
  if (n === null) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 0) return null;
  return n;
}
