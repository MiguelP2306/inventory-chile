import { SaleStatus } from '@inventory/shared';
import type {
  ReportCashFlowResponseDto,
  ReportIvaResponseDto,
  ReportSalesResponseDto,
} from '@inventory/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { dayRange } from '../common/date-range';
import {
  CashTransaction,
  PurchaseEntry,
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

    let debit = 0;
    const salesRows = sales
      .filter((s) => s.status !== SaleStatus.CANCELLED)
      .map((s) => {
        debit += Number(s.taxAmount);
        return {
          id: s.id,
          number: s.number,
          date: s.date.toISOString(),
          customerName: s.customer?.name ?? '—',
          customerTaxId: s.customer?.taxId ?? null,
          subtotal: s.subtotal,
          taxAmount: s.taxAmount,
          total: s.total,
        };
      });

    let credit = 0;
    const purchaseRows = purchases.map((p) => {
      credit += Number(p.taxAmount);
      return {
        id: p.id,
        date: p.date.toISOString(),
        supplierName: p.supplier?.name ?? '—',
        supplierTaxId: p.supplier?.taxId ?? null,
        subtotal: p.subtotal,
        taxAmount: p.taxAmount,
        total: p.total,
      };
    });

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
}
