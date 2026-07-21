import {
  RefundMode,
  ReturnStatus,
  ReturnType,
  SaleStatus,
} from '@inventory/shared';
import type {
  NoMovementReportDto,
  ReportCashFlowResponseDto,
  ReportIvaResponseDto,
  ReportIvaPurchaseRowDto,
  ReportIvaSaleRowDto,
  ReportSalesResponseDto,
} from '@inventory/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { dayRange } from '../common/date-range';
import {
  CashTransaction,
  PurchaseEntry,
  Return,
  Sale,
} from '../database/entities';

/**
 * Servicios de reporte (Fase 8). Cada método devuelve el detalle + totales;
 * la conversión a CSV vive en el controller para mantener separadas las
 * responsabilidades (formato vs. cálculo).
 *
 * Convención de canceladas:
 *   - El listado incluye TODAS las ventas (canceladas también) para que el
 *     operador las vea con el badge tachado.
 *   - Los TOTALES suman solo ventas no canceladas. El IVA y la caja se
 *     compensan al cancelar (transacciones void + RETURN_OUT), por lo que
 *     los reportes de IVA y caja ya quedan correctos sin filtros adicionales.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    @InjectRepository(PurchaseEntry)
    private readonly purchases: Repository<PurchaseEntry>,
    @InjectRepository(CashTransaction)
    private readonly cashTxs: Repository<CashTransaction>,
    @InjectRepository(Return)
    private readonly returns: Repository<Return>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async sales_report(query: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ReportSalesResponseDto> {
    const { from, to } = dayRange(query.dateFrom, query.dateTo);
    const sales = await this.sales.find({
      where: { date: Between(from, to) },
      relations: { customer: true },
      order: { date: 'DESC' },
    });

    let totalSubtotal = 0;
    let totalTax = 0;
    let totalAmount = 0;
    let countActive = 0;
    let countCancelled = 0;

    const rows = sales.map((s) => {
      const cancelled = s.status === SaleStatus.CANCELLED;
      if (cancelled) {
        countCancelled += 1;
      } else {
        countActive += 1;
        totalSubtotal += Number(s.subtotal);
        totalTax += Number(s.taxAmount);
        totalAmount += Number(s.total);
      }

      return {
        id: s.id,
        number: s.number,
        date: s.date.toISOString(),
        customerName: s.customer?.name ?? '—',
        customerTaxId: s.customer?.taxId ?? null,
        paymentMethod: s.paymentMethod,
        status: s.status,
        subtotal: s.subtotal,
        taxAmount: s.taxAmount,
        total: s.total,
      };
    });

    return {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      rows,
      totalSubtotal: totalSubtotal.toFixed(2),
      totalTax: totalTax.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      countActive,
      countCancelled,
    };
  }

  async iva(query: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ReportIvaResponseDto> {
    const { from, to } = dayRange(query.dateFrom, query.dateTo);

    const sales = await this.sales.find({
      where: { date: Between(from, to) },
      relations: { customer: true },
      order: { date: 'DESC' },
    });
    const purchases = await this.purchases.find({
      where: { date: Between(from, to) },
      relations: { supplier: true },
      order: { date: 'DESC' },
    });

    // Devoluciones COMPLETADAS del período: las de cliente son notas de
    // crédito que bajan el IVA débito; las de proveedor bajan el IVA crédito.
    const returns = await this.returns.find({
      where: { date: Between(from, to), status: ReturnStatus.COMPLETED },
      relations: {
        sale: { customer: true },
        purchaseEntry: { supplier: true },
      },
      order: { date: 'DESC' },
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;

    let debit = 0;
    const salesRows: ReportIvaSaleRowDto[] = [];
    for (const s of sales) {
      // Excluimos canceladas y NO afectas a IVA (sin documento): no entran al
      // libro de IVA ni suman al débito.
      if (s.status === SaleStatus.CANCELLED || s.vatExempt) continue;
      debit += Number(s.taxAmount);
      salesRows.push({
        id: s.id,
        number: s.number,
        date: s.date.toISOString(),
        customerName: s.customer?.name ?? '—',
        customerTaxId: s.customer?.taxId ?? null,
        subtotal: s.subtotal,
        taxAmount: s.taxAmount,
        total: s.total,
      });
    }

    let credit = 0;
    const purchaseRows: ReportIvaPurchaseRowDto[] = [];
    for (const p of purchases) {
      credit += Number(p.taxAmount);
      purchaseRows.push({
        id: p.id,
        date: p.date.toISOString(),
        supplierName: p.supplier?.name ?? '—',
        supplierTaxId: p.supplier?.taxId ?? null,
        subtotal: p.subtotal,
        taxAmount: p.taxAmount,
        total: p.total,
      });
    }

    // Notas de crédito (devoluciones). La proporción de IVA se toma del
    // documento ORIGEN (taxAmount/total): así una venta/compra NO afecta
    // (taxAmount 0) resta 0. Los canjes (EXCHANGE) NO se tratan como nota de
    // crédito pura (la mercancía se reemplaza), así que se omiten del libro.
    for (const r of returns) {
      const refund = Number(r.refundAmount);
      if (refund === 0) continue;
      if (
        r.type === ReturnType.CUSTOMER &&
        r.sale &&
        r.refundMode !== RefundMode.EXCHANGE
      ) {
        const total = Number(r.sale.total);
        const ratio = total > 0 ? Number(r.sale.taxAmount) / total : 0;
        const ivaR = round2(refund * ratio);
        if (ivaR === 0) continue; // venta no afecta → no toca el libro de IVA
        debit -= ivaR;
        salesRows.push({
          id: r.id,
          number: r.number,
          date: r.date.toISOString(),
          customerName: r.sale.customer?.name ?? '—',
          customerTaxId: r.sale.customer?.taxId ?? null,
          subtotal: (-(refund - ivaR)).toFixed(2),
          taxAmount: (-ivaR).toFixed(2),
          total: (-refund).toFixed(2),
          isReturn: true,
        });
      } else if (r.type === ReturnType.SUPPLIER && r.purchaseEntry) {
        const total = Number(r.purchaseEntry.total);
        const ratio = total > 0 ? Number(r.purchaseEntry.taxAmount) / total : 0;
        const ivaR = round2(refund * ratio);
        if (ivaR === 0) continue;
        credit -= ivaR;
        purchaseRows.push({
          id: r.id,
          number: r.number,
          date: r.date.toISOString(),
          supplierName: r.purchaseEntry.supplier?.name ?? '—',
          supplierTaxId: r.purchaseEntry.supplier?.taxId ?? null,
          subtotal: (-(refund - ivaR)).toFixed(2),
          taxAmount: (-ivaR).toFixed(2),
          total: (-refund).toFixed(2),
          isReturn: true,
        });
      }
    }

    // Reordenar por fecha DESC (las devoluciones se agregaron al final).
    salesRows.sort((a, b) => b.date.localeCompare(a.date));
    purchaseRows.sort((a, b) => b.date.localeCompare(a.date));

    return {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      balance: (debit - credit).toFixed(2),
      salesRows,
      purchaseRows,
    };
  }

  async cashFlow(query: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ReportCashFlowResponseDto> {
    const { from, to } = dayRange(query.dateFrom, query.dateTo);
    const txs = await this.cashTxs.find({
      where: { date: Between(from, to) },
      order: { date: 'DESC' },
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const rows = txs.map((t) => {
      // Las transacciones anuladas tienen monto válido pero se contabilizan
      // con su compensación contraria que también está en la lista — así que
      // sumar todo cuadra. Mostramos `isVoided` para visualizar pero no las
      // excluimos del total.
      const amount = Number(t.amount);
      if (t.type === 'INCOME') totalIncome += amount;
      else totalExpense += amount;

      return {
        id: t.id,
        date: t.date.toISOString(),
        type: t.type,
        source: t.source,
        paymentMethod: t.paymentMethod,
        description: t.description ?? '',
        amount: t.amount,
        isVoided: t.isVoided,
      };
    });

    return {
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      rows,
      totalIncome: totalIncome.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      net: (totalIncome - totalExpense).toFixed(2),
    };
  }

  /**
   * Fase 9 — Reporte de productos sin movimiento en los últimos N días.
   * "Sin movimiento" = no aparece como `productId` en ninguna fila reciente
   * de `inventory_movements`. Productos NUEVOS (que nunca tuvieron
   * movimiento) también se incluyen porque típicamente son stock estancado.
   *
   * Para cada fila:
   *   - `lastMovementAt` = fecha del movimiento más reciente (null si nunca).
   *   - `totalStock` = suma de stock sobre todas las bodegas activas.
   *   - `inventoryValue` = totalStock × product.cost.
   *
   * Default `days = 30`. Soporta también 60/90 para análisis más profundo.
   */
  async noMovement(days: number): Promise<NoMovementReportDto> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Raw SQL — TypeORM queryBuilder con `from()` sin entity + subqueries
    // correlacionadas genera SQL mal aliasado en algunas versiones. Más
    // robusto ir directo a SQL parametrizado.
    const rows: Array<{
      productId: string;
      sku: string;
      name: string;
      cost: string;
      categoryName: string | null;
      brandName: string | null;
      lastMovementAt: Date | null;
      totalStock: string;
    }> = await this.ds.query(
      `SELECT
         p.id AS productId,
         p.sku AS sku,
         p.name AS name,
         p.cost AS cost,
         c.name AS categoryName,
         b.name AS brandName,
         (SELECT MAX(m.createdAt) FROM inventory_movements m WHERE m.productId = p.id) AS lastMovementAt,
         (SELECT COALESCE(SUM(s.quantity), 0) FROM stocks s WHERE s.productId = p.id) AS totalStock
       FROM products p
       LEFT JOIN categories c ON c.id = p.categoryId
       LEFT JOIN brands b ON b.id = p.brandId
       WHERE p.isActive = TRUE AND p.isService = FALSE
         AND NOT EXISTS (
           SELECT 1 FROM inventory_movements m2
           WHERE m2.productId = p.id AND m2.createdAt >= ?
         )
       ORDER BY totalStock DESC, p.name ASC`,
      [cutoff],
    );

    const now = Date.now();
    let totalInventoryValue = 0;
    const mapped = rows.map((r) => {
      const stock = Number(r.totalStock);
      const cost = Number(r.cost);
      const value = stock * cost;
      totalInventoryValue += value;
      const lastMovAt = r.lastMovementAt
        ? new Date(r.lastMovementAt).toISOString()
        : null;
      const daysSince = r.lastMovementAt
        ? Math.floor((now - new Date(r.lastMovementAt).getTime()) / 86_400_000)
        : null;
      return {
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        lastMovementAt: lastMovAt,
        daysSinceLastMovement: daysSince,
        totalStock: stock,
        inventoryValue: value.toFixed(2),
        categoryName: r.categoryName,
        brandName: r.brandName,
      };
    });

    return {
      days,
      rows: mapped,
      totalProducts: mapped.length,
      totalInventoryValue: totalInventoryValue.toFixed(2),
    };
  }
}
