import {
  RefundMode,
  ReturnItemCondition,
  ReturnStatus,
  ReturnType,
} from '@inventory/shared';
import type { DataSource } from 'typeorm';

/**
 * Neteo de devoluciones sobre las métricas de venta.
 *
 * Problema que resuelve: una venta con devolución NO cambia de estado (sigue
 * `PAID` y la devolución se muestra como incidencia), así que cualquier KPI que
 * sume `sales.total` la sigue contando como vendida. El operador devuelve una
 * venta y el dashboard le sigue mostrando el monto como ingreso del día.
 *
 * Criterio (acordado con el cliente, espejo del que ya usaba el libro de IVA en
 * `reports.service.ts`):
 *
 *  - Se netea por **fecha de la devolución**, no por la de la venta original:
 *    "vendido del período" = ventas del período − devoluciones del período. Así
 *    un mes ya cerrado no cambia retroactivamente.
 *  - Solo devoluciones de tipo CUSTOMER y estado COMPLETED.
 *  - Los canjes (`EXCHANGE`) NO netean: la mercadería se reemplaza, la venta
 *    sigue existiendo. Solo se mueve la diferencia, que ya vive en caja.
 *  - El IVA del reembolso se prorratea con la razón `taxAmount/total` de la
 *    venta ORIGEN, para que una venta no afecta a IVA reste 0 de IVA.
 *  - El COGS solo se revierte para items `RESELLABLE`: si volvió dañado, el
 *    costo sigue siendo costo del negocio (pérdida real, no se devuelve al
 *    stock).
 */

/** Filtro común: devoluciones a cliente que sí descuentan venta. */
const NETTING_RETURNS_WHERE = `
  r.type = ?
  AND r.status = ?
  AND r.refundMode <> ?
  AND r.date BETWEEN ? AND ?
`;

const nettingParams = (from: Date, to: Date) => [
  ReturnType.CUSTOMER,
  ReturnStatus.COMPLETED,
  RefundMode.EXCHANGE,
  from,
  to,
];

export interface RefundTotals {
  /** Cantidad de devoluciones que netean en el rango. */
  count: number;
  /** Monto bruto reembolsado (comparable con `sales.total`). */
  total: number;
  /** Porción neta del reembolso (sin IVA), comparable con `sales.subtotal`. */
  subtotal: number;
  /** Porción de IVA del reembolso, comparable con `sales.taxAmount`. */
  tax: number;
}

/** Totales de devoluciones a cliente en el rango, por fecha de devolución. */
export async function refundTotalsInRange(
  ds: DataSource,
  from: Date,
  to: Date,
): Promise<RefundTotals> {
  const rows: Array<{
    count: string | null;
    total: string | null;
    tax: string | null;
  }> = await ds.query(
    `SELECT COUNT(r.id) AS count,
            COALESCE(SUM(r.refundAmount), 0) AS total,
            COALESCE(
              SUM(r.refundAmount * (s.taxAmount / NULLIF(s.total, 0))), 0
            ) AS tax
     FROM returns r
     INNER JOIN sales s ON s.id = r.saleId
     WHERE ${NETTING_RETURNS_WHERE}`,
    nettingParams(from, to),
  );
  const total = Number(rows[0]?.total ?? 0);
  const tax = Number(rows[0]?.tax ?? 0);
  return {
    count: Number(rows[0]?.count ?? 0),
    total,
    tax,
    subtotal: total - tax,
  };
}

/**
 * Costo de la mercadería devuelta que volvió al stock en el rango. Se resta del
 * COGS para que la utilidad no cargue el costo de algo que no se vendió.
 */
export async function refundedCogsInRange(
  ds: DataSource,
  from: Date,
  to: Date,
): Promise<number> {
  const rows: Array<{ cogs: string | null }> = await ds.query(
    `SELECT COALESCE(SUM(ri.unitCost * ri.qty), 0) AS cogs
     FROM return_items ri
     INNER JOIN returns r ON r.id = ri.returnId
     WHERE ${NETTING_RETURNS_WHERE}
       AND ri.itemCondition = ?`,
    [...nettingParams(from, to), ReturnItemCondition.RESELLABLE],
  );
  return Number(rows[0]?.cogs ?? 0);
}

/**
 * Devoluciones agrupadas por día, para la serie del dashboard. `date` se
 * devuelve tal cual lo entrega el driver (string o Date, según el caso): el
 * caller la normaliza con su propio `toIsoDate`.
 */
export async function refundsByDayInRange(
  ds: DataSource,
  from: Date,
  to: Date,
): Promise<Array<{ date: string | Date; amount: number; count: number }>> {
  const rows: Array<{ date: string | Date; amount: string; count: string }> =
    await ds.query(
      `SELECT DATE(r.date) AS date,
              COALESCE(SUM(r.refundAmount), 0) AS amount,
              COUNT(r.id) AS count
       FROM returns r
       INNER JOIN sales s ON s.id = r.saleId
       WHERE ${NETTING_RETURNS_WHERE}
       GROUP BY DATE(r.date)
       ORDER BY DATE(r.date) ASC`,
      nettingParams(from, to),
    );
  return rows.map((r) => ({
    date: r.date,
    amount: Number(r.amount),
    count: Number(r.count),
  }));
}

/** Unidades y monto devuelto por producto en el rango. */
export async function refundsByProductInRange(
  ds: DataSource,
  from: Date,
  to: Date,
): Promise<Map<string, { qty: number; amount: number }>> {
  const rows: Array<{ productId: string; qty: string; amount: string }> =
    await ds.query(
      `SELECT ri.productId AS productId,
              COALESCE(SUM(ri.qty), 0) AS qty,
              COALESCE(SUM(ri.subtotal), 0) AS amount
       FROM return_items ri
       INNER JOIN returns r ON r.id = ri.returnId
       WHERE ${NETTING_RETURNS_WHERE}
       GROUP BY ri.productId`,
      nettingParams(from, to),
    );
  return new Map(
    rows.map((r) => [
      r.productId,
      { qty: Number(r.qty), amount: Number(r.amount) },
    ]),
  );
}

/** Monto devuelto por cliente en el rango (cliente de la venta origen). */
export async function refundsByCustomerInRange(
  ds: DataSource,
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const rows: Array<{ customerId: string | null; amount: string }> =
    await ds.query(
      `SELECT s.customerId AS customerId,
              COALESCE(SUM(r.refundAmount), 0) AS amount
       FROM returns r
       INNER JOIN sales s ON s.id = r.saleId
       WHERE ${NETTING_RETURNS_WHERE}
       GROUP BY s.customerId`,
      nettingParams(from, to),
    );
  return new Map(
    rows
      .filter((r) => r.customerId)
      .map((r) => [r.customerId as string, Number(r.amount)]),
  );
}
