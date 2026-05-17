import {
  LifecycleStatus,
  PaymentMethod,
  SaleStatus,
} from '@inventory/shared';
import type { DashboardSummaryDto } from '@inventory/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { CashboxService } from '../cashbox/cashbox.service';
import {
  Customer,
  Expense,
  InventoryMovement,
  Product,
  Quotation,
  Sale,
  Stock,
} from '../database/entities';

/**
 * Fase 9 — Dashboard.
 *
 * Servicio agregador: combina queries de varias entidades para devolver un
 * snapshot único con TODO lo que renderiza `/`. Diseñado como una sola
 * request (`GET /dashboard/summary`) para minimizar round trips en mobile.
 *
 * Estructura de la respuesta:
 *
 *   today      → operación del día actual (ventas/cotizaciones/caja).
 *   lifecycle  → conteos del embudo comercial (Fase 8.5).
 *   month      → métricas del mes actual (utilidad, inventario, gastos).
 *   alerts     → stock crítico, bajo, sin movimiento, rotación.
 *
 * Convenciones:
 *   - "Día" / "Mes" en zona horaria del servidor (America/Santiago en prod).
 *   - Ventas canceladas se EXCLUYEN de todos los counts y sumas.
 *   - Cantidades monetarias se devuelven como string para preservar precisión.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Quotation) private readonly quotations: Repository<Quotation>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Stock) private readonly stocks: Repository<Stock>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cashbox: CashboxService,
  ) {}

  async summary(): Promise<DashboardSummaryDto> {
    const { todayStart, todayEnd, monthStart, monthEnd } = computeRanges();

    // Disparamos todas las queries en paralelo. Cada bloque es independiente.
    const [
      todaySalesAgg,
      todayQuotationsAgg,
      cashBalance,
      lifecycleCounts,
      wonThisMonth,
      monthSalesAgg,
      monthCogs,
      monthExpensesAgg,
      inventoryValue,
      stockStatusCounts,
      noMovementCount,
      monthInventoryAvg,
    ] = await Promise.all([
      this.aggregateSalesInRange(todayStart, todayEnd),
      this.aggregateQuotationsInRange(todayStart, todayEnd),
      this.cashbox.balance(),
      this.lifecycleCounts(),
      this.wonCustomersInRange(monthStart, monthEnd),
      this.aggregateSalesInRange(monthStart, monthEnd),
      this.aggregateCogsInRange(monthStart, monthEnd),
      this.aggregateExpensesInRange(monthStart, monthEnd),
      this.totalInventoryValue(),
      this.stockStatusCounts(),
      this.noMovementCount(30),
      this.aggregateCogsInRange(monthStart, monthEnd), // reusamos para promedio
    ]);

    // Utilidad del mes (sin IVA): ventas_subtotal − COGS − gastos.
    // (Decisión documentada en CHANGELOG-FASE-9: la fórmula deja afuera el IVA
    // débito porque no es ganancia del negocio; el IVA se balancea contra el
    // IVA crédito de compras en el reporte de IVA separado.)
    const profit = (
      Number(monthSalesAgg.subtotal) -
      Number(monthCogs) -
      Number(monthExpensesAgg)
    ).toFixed(2);

    // Rotación de inventario: COGS_del_mes / inventario_promedio_del_mes.
    // Si todavía no tenemos un snapshot histórico para inventario promedio,
    // aproximamos con el inventario ACTUAL (single-point en lugar de
    // promedio). Es una aproximación razonable mientras no haya un job que
    // capture stock diario. Lo marcamos en la respuesta para que la UI lo
    // muestre como "aprox.".
    const turnover =
      Number(inventoryValue) > 0
        ? Number(monthCogs) / Number(inventoryValue)
        : 0;
    void monthInventoryAvg; // placeholder explícito: no usado aún

    return {
      today: {
        sales: {
          count: todaySalesAgg.count,
          amount: todaySalesAgg.total,
        },
        quotations: {
          count: todayQuotationsAgg.count,
          amount: todayQuotationsAgg.total,
        },
        cash: {
          total: cashBalance.total,
          byMethod: cashBalance.byMethod,
        },
      },
      lifecycle: {
        pendingFollowUp: lifecycleCounts.pendingFollowUp,
        overdueFollowUp: lifecycleCounts.overdueFollowUp,
        wonThisMonth,
      },
      month: {
        profit,
        salesSubtotal: monthSalesAgg.subtotal,
        cogs: monthCogs,
        expenses: monthExpensesAgg,
        inventoryValue,
      },
      alerts: {
        outOfStock: stockStatusCounts.out,
        lowStock: stockStatusCounts.low,
        noMovement30d: noMovementCount,
        inventoryTurnover: turnover.toFixed(2),
        inventoryTurnoverIsApprox: true,
      },
    };
  }

  // ---------- helpers ----------

  /**
   * Suma de ventas (excluye CANCELLED) en el rango: count + total bruto +
   * subtotal neto.
   */
  private async aggregateSalesInRange(
    from: Date,
    to: Date,
  ): Promise<{ count: number; total: string; subtotal: string }> {
    const row = await this.sales
      .createQueryBuilder('s')
      .select('COUNT(s.id)', 'count')
      .addSelect('COALESCE(SUM(s.total), 0)', 'total')
      .addSelect('COALESCE(SUM(s.subtotal), 0)', 'subtotal')
      .where('s.date BETWEEN :from AND :to', { from, to })
      .andWhere('s.status != :cancelled', {
        cancelled: SaleStatus.CANCELLED,
      })
      .getRawOne<{ count: string; total: string; subtotal: string }>();
    return {
      count: Number(row?.count ?? 0),
      total: Number(row?.total ?? 0).toFixed(2),
      subtotal: Number(row?.subtotal ?? 0).toFixed(2),
    };
  }

  /**
   * COGS del mes: suma de `unitCost × qty` sobre los items de ventas no
   * canceladas. Raw SQL para evitar quirks de TypeORM con queryBuilder
   * sobre `from()` sin entity.
   */
  private async aggregateCogsInRange(from: Date, to: Date): Promise<string> {
    const rows: Array<{ cogs: string | null }> = await this.ds.query(
      `SELECT COALESCE(SUM(si.unitCost * si.qty), 0) AS cogs
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.saleId
       WHERE s.date BETWEEN ? AND ? AND s.status != ?`,
      [from, to, SaleStatus.CANCELLED],
    );
    return Number(rows[0]?.cogs ?? 0).toFixed(2);
  }

  private async aggregateQuotationsInRange(
    from: Date,
    to: Date,
  ): Promise<{ count: number; total: string }> {
    const row = await this.quotations
      .createQueryBuilder('q')
      .select('COUNT(q.id)', 'count')
      .addSelect('COALESCE(SUM(q.total), 0)', 'total')
      .where('q.date BETWEEN :from AND :to', { from, to })
      .getRawOne<{ count: string; total: string }>();
    return {
      count: Number(row?.count ?? 0),
      total: Number(row?.total ?? 0).toFixed(2),
    };
  }

  private async aggregateExpensesInRange(from: Date, to: Date): Promise<string> {
    // Expense usa `voidedAt IS NULL` (no un boolean `isVoided`) — la anulación
    // se materializa con timestamp + usuario + transacción compensatoria.
    const row = await this.expenses
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'total')
      .where('e.date BETWEEN :from AND :to', { from, to })
      .andWhere('e.voidedAt IS NULL')
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0).toFixed(2);
  }

  /**
   * Conteos del embudo comercial (Fase 8.5):
   *   - pendingFollowUp: clientes en QUOTED o FOLLOW_UP.
   *   - overdueFollowUp: clientes en FOLLOW_UP (cron ya los detectó vencidos).
   */
  private async lifecycleCounts(): Promise<{
    pendingFollowUp: number;
    overdueFollowUp: number;
  }> {
    const rows = await this.customers
      .createQueryBuilder('c')
      .select('c.lifecycleStatus', 'status')
      .addSelect('COUNT(c.id)', 'count')
      .where('c.lifecycleStatus IN (:...statuses)', {
        statuses: [LifecycleStatus.QUOTED, LifecycleStatus.FOLLOW_UP],
      })
      .groupBy('c.lifecycleStatus')
      .getRawMany<{ status: LifecycleStatus; count: string }>();

    let pending = 0;
    let overdue = 0;
    for (const r of rows) {
      const n = Number(r.count);
      pending += n;
      if (r.status === LifecycleStatus.FOLLOW_UP) overdue += n;
    }
    return { pendingFollowUp: pending, overdueFollowUp: overdue };
  }

  /**
   * "Ventas ganadas del mes": clientes WON cuyo `lastContactAt` cae en el
   * mes actual. Aproxima la cantidad de ventas confirmadas que cerraron el
   * embudo este mes.
   */
  private async wonCustomersInRange(from: Date, to: Date): Promise<number> {
    return this.customers.count({
      where: {
        lifecycleStatus: LifecycleStatus.WON,
        lastContactAt: Between(from, to),
      },
    });
  }

  /**
   * Valor total del inventario actual: SUM(stock.quantity × product.cost)
   * sobre productos activos. Usa el costo BRUTO de catálogo.
   */
  private async totalInventoryValue(): Promise<string> {
    const rows: Array<{ total: string | null }> = await this.ds.query(
      `SELECT COALESCE(SUM(s.quantity * p.cost), 0) AS total
       FROM stocks s
       INNER JOIN products p ON p.id = s.productId
       WHERE p.isActive = TRUE AND s.quantity > 0`,
    );
    return Number(rows[0]?.total ?? 0).toFixed(2);
  }

  /**
   * Conteo de productos en cada estado del semáforo (out / low / ok),
   * agregando stock de TODAS las bodegas activas. Antes el dashboard pedía
   * el stock de una sola bodega y subestimaba — Fase 9 unifica con la
   * decisión de Ronda 7 sobre stock agregado.
   */
  private async stockStatusCounts(): Promise<{
    out: number;
    low: number;
    ok: number;
  }> {
    // Query agregada: SUM(quantity) por producto + comparación contra minStock.
    // Raw SQL para sortear el quirk de TypeORM con queryBuilder + `from()` sin
    // entity (que genera SQL mal aliasado en algunas versiones).
    const rows: Array<{ minStock: number; qty: string }> = await this.ds.query(
      `SELECT p.minStock AS minStock, COALESCE(SUM(s.quantity), 0) AS qty
       FROM products p
       LEFT JOIN stocks s ON s.productId = p.id
       WHERE p.isActive = TRUE
       GROUP BY p.id, p.minStock`,
    );

    let out = 0;
    let low = 0;
    let ok = 0;
    for (const r of rows) {
      const qty = Number(r.qty);
      const min = Number(r.minStock);
      if (qty <= 0) out += 1;
      else if (qty <= min) low += 1;
      else ok += 1;
    }
    return { out, low, ok };
  }

  /**
   * Cuenta productos activos sin movimiento en los últimos N días. "Sin
   * movimiento" = no aparece como referencia en ningún row de
   * `inventory_movements` posterior a `now - N días`. Productos NUEVOS
   * (sin ningún movimiento jamás) también cuentan porque pueden ser stock
   * estancado.
   */
  private async noMovementCount(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Raw SQL para el subquery correlacionado — TypeORM queryBuilder con
    // `from()` sin entity y subQuery correlacionada genera SQL mal formado.
    const rows: Array<{ count: string | number }> = await this.ds.query(
      `SELECT COUNT(DISTINCT p.id) AS count
       FROM products p
       WHERE p.isActive = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM inventory_movements m
           WHERE m.productId = p.id AND m.createdAt >= ?
         )`,
      [cutoff],
    );
    return Number(rows[0]?.count ?? 0);
  }
}

/**
 * Calcula los bordes del día y mes ACTUAL en horario local del servidor.
 * Producción corre en America/Santiago — el sistema usa `new Date()` y los
 * comparadores TypeORM/MySQL ya trabajan en la zona del server.
 */
function computeRanges(): {
  todayStart: Date;
  todayEnd: Date;
  monthStart: Date;
  monthEnd: Date;
} {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { todayStart, todayEnd, monthStart, monthEnd };
}

