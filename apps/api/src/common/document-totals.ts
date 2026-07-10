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

export interface DocumentTotals {
  subtotal: string;
  taxAmount: string;
  total: string;
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
 */
export function computeDocumentTotals(
  items: DocumentLineInput[],
  taxRate: number,
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

  return {
    subtotal: fmt2(totalNeto),
    taxAmount: fmt2(totalTax),
    total: fmt2(totalGross),
    lines,
  };
}
