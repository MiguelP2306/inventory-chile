/**
 * Descuento sobre el TOTAL de un documento (cotización / venta), aparte de los
 * descuentos por línea.
 *
 * Espeja `apps/api/src/common/document-totals.ts` — el backend es la fuente de
 * verdad y recalcula todo al guardar; esto es solo el preview en vivo del
 * formulario. Vive acá y no dentro de cada form para que cotización y venta no
 * se desincronicen (el cálculo por línea ya está duplicado entre ambos).
 */

export type DiscountKind = '$' | '%';

/**
 * Resuelve el descuento global a un monto en pesos, acotado a [0, bruto]:
 * un descuento no puede dejar el documento en negativo ni superar el total.
 *
 * `gross` es la suma de los subtotales de línea (ya con sus propios
 * descuentos aplicados), en bruto — los precios que carga el operador
 * incluyen IVA.
 */
export function resolveGlobalDiscount(
  kind: DiscountKind,
  value: string,
  gross: number,
): number {
  const raw = Number(value) || 0;
  const amount =
    kind === '%' ? (gross * Math.max(0, Math.min(100, raw))) / 100 : Math.max(0, raw);
  return Math.min(amount, Math.max(0, gross));
}

export interface DocumentTotalsPreview {
  /** Suma de los subtotales de línea, antes del descuento global. */
  grossBeforeDiscount: number;
  /** Monto del descuento global ya acotado. */
  discountAmount: number;
  subtotalNeto: number;
  taxAmount: number;
  /** Total bruto final, ya rebajado. */
  totalBruto: number;
}

/**
 * El descuento se aplica sobre el bruto y el neto/IVA se derivan del bruto ya
 * rebajado, de modo que el IVA siempre grava el monto realmente cobrado.
 */
export function computeTotalsPreview(
  lineSubtotals: number[],
  taxRate: number,
  discountKind: DiscountKind,
  discountValue: string,
): DocumentTotalsPreview {
  const grossBeforeDiscount = lineSubtotals.reduce((acc, n) => acc + n, 0);
  const discountAmount = resolveGlobalDiscount(
    discountKind,
    discountValue,
    grossBeforeDiscount,
  );
  const totalBruto = Math.max(0, grossBeforeDiscount - discountAmount);
  const subtotalNeto = totalBruto / (1 + taxRate);

  return {
    grossBeforeDiscount,
    discountAmount,
    subtotalNeto,
    taxAmount: totalBruto - subtotalNeto,
    totalBruto,
  };
}

/**
 * Convierte el par (kind, value) del formulario al formato de la API:
 * `discount` siempre lleva el monto; `discountPercent` solo va cuando se
 * ingresó como porcentaje, para reimprimir el documento como fue pactado.
 */
export function serializeGlobalDiscount(
  kind: DiscountKind,
  value: string,
  gross: number,
): { discount: string; discountPercent: string | null } {
  if (kind === '%') {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    return {
      discount: ((gross * pct) / 100).toFixed(2),
      discountPercent: pct.toFixed(2),
    };
  }
  return {
    discount: resolveGlobalDiscount('$', value, gross).toFixed(2),
    discountPercent: null,
  };
}
