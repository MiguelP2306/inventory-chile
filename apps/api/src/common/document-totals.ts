/**
 * Cálculo de totales de un documento comercial (cotización, venta, guía de
 * despacho valorizada).
 *
 * Los precios que entran son BRUTOS (IVA incluido), como los carga el operador.
 * De ahí se descompone el neto y el IVA. El redondeo es por línea, no sobre el
 * total, para que la suma de los subtotales impresos coincida con el total.
 *
 * Vivía duplicado en quotations y sales; al aparecer el tercer caso (guías) se
 * extrajo acá.
 */

export interface DocumentLineInput {
  qty: number;
  unitPrice: string;
  discount?: string | null;
  discountPercent?: string | null;
}

export interface DocumentLineTotals {
  lineGross: string;
  discountAmount: string;
  subtotalNeto: string;
  tax: string;
}

/**
 * Descuento aplicado al total del documento, después de sumar las líneas.
 * `percent` tiene precedencia sobre `amount` cuando ambos vienen, igual que
 * en las líneas. Ambos se interpretan sobre el BRUTO (la suma de los
 * subtotales impresos), coherente con que los precios cargados son brutos.
 */
export interface DocumentDiscountInput {
  amount?: string | null;
  percent?: string | null;
}

export interface DocumentTotals {
  subtotal: string;
  taxAmount: string;
  total: string;
  /** Suma de los subtotales de línea, antes del descuento global. */
  grossBeforeDiscount: string;
  /** Monto del descuento global efectivamente aplicado (0 si no hay). */
  discountAmount: string;
  lines: DocumentLineTotals[];
}

export function roundHalfUp(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return (Math.sign(n) * Math.round(Math.abs(n) * factor)) / factor;
}

export function fmt2(n: number): string {
  return roundHalfUp(n).toFixed(2);
}

/**
 * `taxRate` es la tasa decimal (0.19 = 19%). Pasar 0 para documentos exentos:
 * el total queda íntegro como neto y el IVA en 0.
 *
 * `discountPercent` tiene precedencia sobre `discount` cuando ambos vienen.
 *
 * `globalDiscount` (opcional) se descuenta del bruto ya sumado; el neto y el
 * IVA se recalculan sobre ese bruto rebajado, de modo que el IVA siempre grava
 * el monto realmente cobrado. Sin descuento global el resultado es idéntico al
 * de antes (suma de los netos por línea).
 */
export function computeDocumentTotals(
  items: DocumentLineInput[],
  taxRate: number,
  globalDiscount?: DocumentDiscountInput | null,
): DocumentTotals {
  const lines: DocumentLineTotals[] = [];
  let totalGross = 0;
  let totalNeto = 0;
  let totalTax = 0;

  for (const it of items) {
    const qty = it.qty;
    const unitPrice = parseFloat(it.unitPrice);
    let discountAmount: number;
    if (it.discountPercent != null && it.discountPercent !== '') {
      const pct = parseFloat(it.discountPercent);
      discountAmount = (qty * unitPrice * pct) / 100;
    } else if (it.discount != null && it.discount !== '') {
      discountAmount = parseFloat(it.discount);
    } else {
      discountAmount = 0;
    }
    discountAmount = roundHalfUp(discountAmount);

    const lineGrossNum = roundHalfUp(qty * unitPrice - discountAmount);
    const subtotalNetoNum = roundHalfUp(lineGrossNum / (1 + taxRate));
    const taxNum = roundHalfUp(lineGrossNum - subtotalNetoNum);

    lines.push({
      lineGross: fmt2(lineGrossNum),
      discountAmount: fmt2(discountAmount),
      subtotalNeto: fmt2(subtotalNetoNum),
      tax: fmt2(taxNum),
    });
    totalGross += lineGrossNum;
    totalNeto += subtotalNetoNum;
    totalTax += taxNum;
  }

  const grossBeforeDiscount = roundHalfUp(totalGross);
  const globalDiscountAmount = resolveGlobalDiscount(
    globalDiscount,
    grossBeforeDiscount,
  );

  // Sin descuento global conservamos la suma por línea tal cual, para no mover
  // ni un peso en los documentos que ya existen.
  if (globalDiscountAmount === 0) {
    return {
      subtotal: fmt2(totalNeto),
      taxAmount: fmt2(totalTax),
      total: fmt2(grossBeforeDiscount),
      grossBeforeDiscount: fmt2(grossBeforeDiscount),
      discountAmount: '0.00',
      lines,
    };
  }

  const netGross = roundHalfUp(grossBeforeDiscount - globalDiscountAmount);
  const netoNum = roundHalfUp(netGross / (1 + taxRate));
  const taxNum = roundHalfUp(netGross - netoNum);

  return {
    subtotal: fmt2(netoNum),
    taxAmount: fmt2(taxNum),
    total: fmt2(netGross),
    grossBeforeDiscount: fmt2(grossBeforeDiscount),
    discountAmount: fmt2(globalDiscountAmount),
    lines,
  };
}

/**
 * Resuelve el descuento global a un monto en pesos, acotado a [0, bruto]: un
 * descuento no puede dejar el documento en negativo ni ser mayor al total.
 */
function resolveGlobalDiscount(
  globalDiscount: DocumentDiscountInput | null | undefined,
  grossBeforeDiscount: number,
): number {
  if (!globalDiscount) return 0;

  let amount: number;
  if (globalDiscount.percent != null && globalDiscount.percent !== '') {
    const pct = Math.min(100, Math.max(0, parseFloat(globalDiscount.percent)));
    if (!Number.isFinite(pct)) return 0;
    amount = (grossBeforeDiscount * pct) / 100;
  } else if (globalDiscount.amount != null && globalDiscount.amount !== '') {
    amount = parseFloat(globalDiscount.amount);
    if (!Number.isFinite(amount)) return 0;
  } else {
    return 0;
  }

  return roundHalfUp(Math.min(Math.max(0, amount), grossBeforeDiscount));
}
