import {
  LifecycleStatus,
  QuotationStatus,
  SaleStatus,
} from '@inventory/shared';
import type {
  DashboardCashFlowPointDto,
  DashboardCategoryBreakdownDto,
  DashboardFollowUpDto,
  DashboardLifecycleFunnelDto,
  DashboardRangeDto,
  DashboardSalesTrendPointDto,
  DashboardSummaryDto,
  DashboardTopProductDto,
} from '@inventory/shared';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { CashboxService } from '../cashbox/cashbox.service';
import {
  Customer,
  Expense,
  InventoryMovement,
  Product,
  ProductImage,
  Quotation,
  Sale,
  SaleItem,
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
 *   today          → operación del día actual (ventas/cotizaciones/caja).
 *   lifecycle      → conteos del embudo comercial (Fase 8.5).
 *   month          → métricas del mes actual (utilidad, inventario, gastos).
 *   alerts         → stock crítico, bajo, sin movimiento, rotación.
 *   trend          → series temporales últimos 30 días (ventas + flujo de caja).
 *   top            → top productos y desglose por categoría del mes.
 *   followUps      → top 10 seguimientos urgentes con snapshot de cotización.
 *   comparison     → deltas hoy vs ayer / mes vs mes anterior.
 *   monthBreakdown → alias de month.salesSubtotal/cogs/expenses agrupados.
 *   lifecycleFunnel→ embudo de 5 etapas (NEW/QUOTED/FOLLOW_UP/WON/LOST).
 *
 * Convenciones:
 *   - "Día" / "Mes" en zona horaria del servidor (America/Santiago en prod).
 *   - Ventas canceladas se EXCLUYEN de todos los counts y sumas.
 *   - Cantidades monetarias se devuelven como string en los bloques
 *     legacy (today/month/alerts) y como number en los bloques nuevos
 *     (trend/top/followUps/comparison/monthBreakdown). La frontera está
 *     marcada por el tipo del DTO.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(SaleItem) private readonly saleItems: Repository<SaleItem>,
    @InjectRepository(Quotation) private readonly quotations: Repository<Quotation>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Stock) private readonly stocks: Repository<Stock>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly productImages: Repository<ProductImage>,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cashbox: CashboxService,
  ) {}

  async summary(range: DashboardRangeDto): Promise<DashboardSummaryDto> {
    const {
      currentStart,
      currentEnd,
      prevStart,
      prevEnd,
      trendStart,
      trendEnd,
    } = computeRanges(range);

    // Disparamos todas las queries en paralelo. Cada bloque es independiente.
    const [
      currentSalesAgg,
      prevSalesAgg,
      currentQuotationsAgg,
      currentCashFlow,
      prevCashFlow,
      cashBalance,
      lifecycleCounts,
      lifecycleFunnel,
      wonInRange,
      currentCogs,
      currentExpensesAgg,
      prevCogs,
      prevExpensesAgg,
      inventoryValue,
      stockStatusCounts,
      noMovementCount,
      salesTrend,
      cashFlowTrend,
      topProducts,
      topCategories,
      followUps,
    ] = await Promise.all([
      this.aggregateSalesInRange(currentStart, currentEnd),
      this.aggregateSalesInRange(prevStart, prevEnd),
      this.aggregateQuotationsInRange(currentStart, currentEnd),
      this.aggregateCashFlowNetInRange(currentStart, currentEnd),
      this.aggregateCashFlowNetInRange(prevStart, prevEnd),
      this.cashbox.balance(),
      this.lifecycleCounts(),
      this.lifecycleFunnelCounts(),
      this.wonCustomersInRange(currentStart, currentEnd),
      this.aggregateCogsInRange(currentStart, currentEnd),
      this.aggregateExpensesInRange(currentStart, currentEnd),
      this.aggregateCogsInRange(prevStart, prevEnd),
      this.aggregateExpensesInRange(prevStart, prevEnd),
      this.totalInventoryValue(),
      this.stockStatusCounts(),
      this.noMovementCount(30),
      this.aggregateSalesByDayInRange(trendStart, trendEnd),
      this.aggregateCashFlowByDayInRange(trendStart, trendEnd),
      this.topProductsForRange(currentStart, currentEnd, prevStart, prevEnd, 10),
      this.categoriesBreakdownForRange(currentStart, currentEnd),
      this.urgentFollowUps(10),
    ]);

    // Utilidad del período seleccionado: total_ventas (CON IVA) − COGS − gastos.
    // Se usa el total bruto de ventas para emparejar con el COGS, que también
    // está en bruto (unitCost incluye IVA, ver purchases.service.ts).
    const currentProfitNum =
      Number(currentSalesAgg.total) -
      Number(currentCogs) -
      Number(currentExpensesAgg);
    const prevProfitNum =
      Number(prevSalesAgg.total) - Number(prevCogs) - Number(prevExpensesAgg);
    const profit = currentProfitNum.toFixed(2);

    // Rotación de inventario: COGS_del_rango / inventario_actual.
    // Aproximación válida mientras no haya snapshot histórico de stock.
    const turnover =
      Number(inventoryValue) > 0
        ? Number(currentCogs) / Number(inventoryValue)
        : 0;

    // Deltas: período actual vs período previo del mismo tamaño.
    const salesDeltaPct = pctDelta(
      Number(currentSalesAgg.total),
      Number(prevSalesAgg.total),
    );
    const cashDeltaPct = pctDelta(currentCashFlow, prevCashFlow);
    const profitDeltaPct = pctDelta(currentProfitNum, prevProfitNum);

    return {
      range,
      today: {
        sales: {
          count: currentSalesAgg.count,
          amount: currentSalesAgg.total,
        },
        quotations: {
          count: currentQuotationsAgg.count,
          amount: currentQuotationsAgg.total,
        },
        cash: {
          total: cashBalance.total,
          byMethod: cashBalance.byMethod,
        },
      },
      lifecycle: {
        pendingFollowUp: lifecycleCounts.pendingFollowUp,
        overdueFollowUp: lifecycleCounts.overdueFollowUp,
        wonThisMonth: wonInRange,
      },
      month: {
        profit,
        salesSubtotal: currentSalesAgg.subtotal,
        cogs: currentCogs,
        expenses: currentExpensesAgg,
        inventoryValue,
      },
      alerts: {
        outOfStock: stockStatusCounts.out,
        lowStock: stockStatusCounts.low,
        noMovement30d: noMovementCount,
        inventoryTurnover: turnover.toFixed(2),
        inventoryTurnoverIsApprox: true,
      },
      trend: {
        salesByDay: salesTrend,
        cashFlowByDay: cashFlowTrend,
      },
      top: {
        products: topProducts,
        categories: topCategories,
      },
      followUps,
      comparison: {
        salesDeltaPct,
        cashDeltaPct,
        profitDeltaPct,
      },
      monthBreakdown: {
        netSales: Number(currentSalesAgg.subtotal),
        cogs: Number(currentCogs),
        expenses: Number(currentExpensesAgg),
      },
      lifecycleFunnel: {
        NEW: lifecycleFunnel.NEW,
        QUOTED: lifecycleFunnel.QUOTED,
        FOLLOW_UP: lifecycleFunnel.FOLLOW_UP,
        WON: wonInRange,
        LOST: lifecycleFunnel.LOST,
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
   * Flujo neto de caja (INCOME − EXPENSE) en el rango, ignorando transacciones
   * anuladas. Usado para los deltas hoy vs ayer.
   */
  private async aggregateCashFlowNetInRange(
    from: Date,
    to: Date,
  ): Promise<number> {
    const row: Array<{ inflow: string | null; outflow: string | null }> =
      await this.ds.query(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS inflow,
           COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS outflow
         FROM cash_transactions
         WHERE date BETWEEN ? AND ? AND isVoided = FALSE`,
        [from, to],
      );
    const inflow = Number(row[0]?.inflow ?? 0);
    const outflow = Number(row[0]?.outflow ?? 0);
    return inflow - outflow;
  }

  /**
   * Serie diaria de ventas en el rango (huecos rellenados con 0). Devuelve
   * un punto por día calendario, ordenado ascendente.
   */
  private async aggregateSalesByDayInRange(
    from: Date,
    to: Date,
  ): Promise<DashboardSalesTrendPointDto[]> {
    const rows: Array<{ date: string; amount: string; count: string }> =
      await this.ds.query(
        `SELECT DATE(s.date) AS date,
                COALESCE(SUM(s.total), 0) AS amount,
                COUNT(s.id) AS count
         FROM sales s
         WHERE s.date BETWEEN ? AND ? AND s.status != ?
         GROUP BY DATE(s.date)
         ORDER BY DATE(s.date) ASC`,
        [from, to, SaleStatus.CANCELLED],
      );
    const byDate = new Map(
      rows.map((r) => [
        toIsoDate(r.date),
        { amount: Number(r.amount), count: Number(r.count) },
      ]),
    );
    return fillDailySeries(from, to, (dateIso) => {
      const hit = byDate.get(dateIso);
      return {
        date: dateIso,
        amount: hit?.amount ?? 0,
        count: hit?.count ?? 0,
      };
    });
  }

  /**
   * Serie diaria de flujo de caja: inflow (INCOME) vs outflow (EXPENSE) por
   * día calendario. Excluye transacciones anuladas. Huecos rellenados con 0.
   */
  private async aggregateCashFlowByDayInRange(
    from: Date,
    to: Date,
  ): Promise<DashboardCashFlowPointDto[]> {
    const rows: Array<{ date: string; inflow: string; outflow: string }> =
      await this.ds.query(
        `SELECT DATE(t.date) AS date,
                COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS inflow,
                COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS outflow
         FROM cash_transactions t
         WHERE t.date BETWEEN ? AND ? AND t.isVoided = FALSE
         GROUP BY DATE(t.date)
         ORDER BY DATE(t.date) ASC`,
        [from, to],
      );
    const byDate = new Map(
      rows.map((r) => [
        toIsoDate(r.date),
        { inflow: Number(r.inflow), outflow: Number(r.outflow) },
      ]),
    );
    return fillDailySeries(from, to, (dateIso) => {
      const hit = byDate.get(dateIso);
      return {
        date: dateIso,
        inflow: hit?.inflow ?? 0,
        outflow: hit?.outflow ?? 0,
      };
    });
  }

  /**
   * Top productos del mes por monto facturado (SUM(qty × unitPrice)), con:
   *   - `units` = SUM(qty) del mes
   *   - `deltaPct` = variación vs mismo producto el mes anterior
   *   - `coverUrl` = portada (relativa); el front la prefixa con NEXT_PUBLIC_API_URL
   *
   * Hace 3 queries: top del mes, mismos productos en mes anterior, covers en
   * batch. Ordenado por amount desc.
   */
  private async topProductsForRange(
    from: Date,
    to: Date,
    prevFrom: Date,
    prevTo: Date,
    limit: number,
  ): Promise<DashboardTopProductDto[]> {
    const rows: Array<{
      productId: string;
      sku: string | null;
      name: string;
      units: string;
      amount: string;
    }> = await this.ds.query(
      `SELECT si.productId AS productId,
              p.sku AS sku,
              p.name AS name,
              COALESCE(SUM(si.qty), 0) AS units,
              COALESCE(SUM(si.qty * si.unitPrice), 0) AS amount
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.saleId
       INNER JOIN products p ON p.id = si.productId
       WHERE s.date BETWEEN ? AND ? AND s.status != ?
       GROUP BY si.productId, p.sku, p.name
       ORDER BY amount DESC
       LIMIT ?`,
      [from, to, SaleStatus.CANCELLED, limit],
    );
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.productId);

    // Mes anterior para los mismos productos. QueryBuilder porque el patrón
    // `IN (?)` con array en raw `ds.query` depende de que el driver expanda
    // arrays — más robusto pasar por la abstracción de TypeORM.
    const prevRows = await this.saleItems
      .createQueryBuilder('si')
      .innerJoin(Sale, 's', 's.id = si.saleId')
      .select('si.productId', 'productId')
      .addSelect('COALESCE(SUM(si.qty * si.unitPrice), 0)', 'amount')
      .where('si.productId IN (:...ids)', { ids })
      .andWhere('s.date BETWEEN :from AND :to', { from: prevFrom, to: prevTo })
      .andWhere('s.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy('si.productId')
      .getRawMany<{ productId: string; amount: string }>();
    const prevByProduct = new Map(
      prevRows.map((r) => [r.productId, Number(r.amount)]),
    );

    // Covers en batch (reusa el patrón de products.service)
    const covers = await this.productImages
      .createQueryBuilder('img')
      .where('img.productId IN (:...ids)', { ids })
      .andWhere('img.isCover = TRUE')
      .getMany();
    const coverByProduct = new Map(covers.map((c) => [c.productId, c.url]));

    return rows.map((r) => {
      const amount = Number(r.amount);
      const prevAmount = prevByProduct.get(r.productId) ?? 0;
      return {
        id: r.productId,
        sku: r.sku,
        name: r.name,
        units: Number(r.units),
        amount,
        deltaPct: pctDelta(amount, prevAmount),
        coverUrl: coverByProduct.get(r.productId) ?? null,
      };
    });
  }

  /**
   * Breakdown por categoría del mes en curso. Incluye solo categorías con
   * ventas. Para cada una calcula:
   *   - `amount`    = SUM(qty × unitPrice) del mes
   *   - `marginPct` = (amount − cogs) / amount × 100
   *   - `turnover`  = cogs_categoría / inventario_actual_categoría
   *
   * Una sola query con LEFT JOIN a subqueries de inventario.
   */
  private async categoriesBreakdownForRange(
    from: Date,
    to: Date,
  ): Promise<DashboardCategoryBreakdownDto[]> {
    const rows: Array<{
      id: string;
      name: string;
      amount: string;
      cogs: string;
      inventoryValue: string;
    }> = await this.ds.query(
      `SELECT c.id AS id,
              c.name AS name,
              COALESCE(salesAgg.amount, 0) AS amount,
              COALESCE(salesAgg.cogs, 0) AS cogs,
              COALESCE(invAgg.inventoryValue, 0) AS inventoryValue
       FROM categories c
       INNER JOIN (
         SELECT p.categoryId AS catId,
                SUM(si.qty * si.unitPrice) AS amount,
                SUM(si.qty * si.unitCost) AS cogs
         FROM sale_items si
         INNER JOIN sales s ON s.id = si.saleId
         INNER JOIN products p ON p.id = si.productId
         WHERE s.date BETWEEN ? AND ? AND s.status != ? AND p.categoryId IS NOT NULL
         GROUP BY p.categoryId
       ) salesAgg ON salesAgg.catId = c.id
       LEFT JOIN (
         SELECT p.categoryId AS catId,
                SUM(st.quantity * p.cost) AS inventoryValue
         FROM stocks st
         INNER JOIN products p ON p.id = st.productId
         WHERE p.isActive = TRUE AND p.categoryId IS NOT NULL
         GROUP BY p.categoryId
       ) invAgg ON invAgg.catId = c.id
       ORDER BY salesAgg.amount DESC`,
      [from, to, SaleStatus.CANCELLED],
    );

    return rows.map((r) => {
      const amount = Number(r.amount);
      const cogs = Number(r.cogs);
      const inventoryValue = Number(r.inventoryValue);
      const marginPct = amount > 0 ? ((amount - cogs) / amount) * 100 : 0;
      const turnover = inventoryValue > 0 ? cogs / inventoryValue : 0;
      return {
        id: r.id,
        name: r.name,
        amount,
        marginPct: Math.round(marginPct * 10) / 10,
        turnover: Math.round(turnover * 100) / 100,
      };
    });
  }

  /**
   * Top N seguimientos pendientes: clientes en QUOTED o FOLLOW_UP ordenados
   * por `nextFollowUpAt` ascendente (vencidos primero), con snapshot de la
   * última cotización SENT/APPROVED del cliente.
   *
   * Solo devuelve clientes que tienen al menos una cotización SENT/APPROVED
   * — sin eso, el card del dashboard no tiene quoteNumber/amount que mostrar.
   *
   * Implementación con CTE + ROW_NUMBER() en lugar de subquery en ON.
   * TiDB rechaza "ON condition doesn't support subqueries yet" pero soporta
   * window functions y CTEs sin problema.
   */
  private async urgentFollowUps(limit: number): Promise<DashboardFollowUpDto[]> {
    const rows: Array<{
      customerId: string;
      customerName: string;
      whatsappPhone: string | null;
      phone: string | null;
      lastContactAt: Date | null;
      createdAt: Date;
      quotationId: string;
      quoteNumber: string;
      amount: string;
    }> = await this.ds.query(
      `WITH ranked_quotes AS (
         SELECT q.id,
                q.customerId,
                q.number,
                q.total,
                ROW_NUMBER() OVER (
                  PARTITION BY q.customerId
                  ORDER BY q.date DESC
                ) AS rn
         FROM quotations q
         WHERE q.status IN (?, ?)
       )
       SELECT c.id AS customerId,
              c.name AS customerName,
              c.whatsappPhone AS whatsappPhone,
              c.phone AS phone,
              c.lastContactAt AS lastContactAt,
              c.createdAt AS createdAt,
              q.id AS quotationId,
              q.number AS quoteNumber,
              q.total AS amount
       FROM customers c
       INNER JOIN ranked_quotes q
         ON q.customerId = c.id AND q.rn = 1
       WHERE c.lifecycleStatus IN (?, ?)
       ORDER BY c.nextFollowUpAt IS NULL, c.nextFollowUpAt ASC
       LIMIT ?`,
      [
        QuotationStatus.SENT,
        QuotationStatus.APPROVED,
        LifecycleStatus.QUOTED,
        LifecycleStatus.FOLLOW_UP,
        limit,
      ],
    );

    const now = Date.now();
    return rows.map((r) => {
      const ref = r.lastContactAt ?? r.createdAt;
      const days = Math.max(
        0,
        Math.floor((now - new Date(ref).getTime()) / (24 * 60 * 60 * 1000)),
      );
      return {
        id: r.quotationId,
        customerName: r.customerName,
        phone: r.whatsappPhone ?? r.phone ?? null,
        quoteNumber: r.quoteNumber,
        amount: Number(r.amount),
        daysSinceLastContact: days,
      };
    });
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
   * Funnel completo de 5 etapas. NEW/QUOTED/FOLLOW_UP/LOST son conteos del
   * estado ACTUAL del cliente (sin filtro temporal). WON se completa en el
   * caller con el mismo cálculo que `wonCustomersInRange` para mantener
   * consistencia con `lifecycle.wonThisMonth`.
   */
  private async lifecycleFunnelCounts(): Promise<
    Omit<DashboardLifecycleFunnelDto, 'WON'>
  > {
    const rows = await this.customers
      .createQueryBuilder('c')
      .select('c.lifecycleStatus', 'status')
      .addSelect('COUNT(c.id)', 'count')
      .where('c.lifecycleStatus IN (:...statuses)', {
        statuses: [
          LifecycleStatus.NEW,
          LifecycleStatus.QUOTED,
          LifecycleStatus.FOLLOW_UP,
          LifecycleStatus.LOST,
        ],
      })
      .groupBy('c.lifecycleStatus')
      .getRawMany<{ status: LifecycleStatus; count: string }>();

    const counts: Omit<DashboardLifecycleFunnelDto, 'WON'> = {
      NEW: 0,
      QUOTED: 0,
      FOLLOW_UP: 0,
      LOST: 0,
    };
    for (const r of rows) {
      const n = Number(r.count);
      if (r.status === LifecycleStatus.NEW) counts.NEW = n;
      else if (r.status === LifecycleStatus.QUOTED) counts.QUOTED = n;
      else if (r.status === LifecycleStatus.FOLLOW_UP) counts.FOLLOW_UP = n;
      else if (r.status === LifecycleStatus.LOST) counts.LOST = n;
    }
    return counts;
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

// ---------- helpers privados a este módulo ----------

/**
 * Calcula los bordes del rango seleccionado y el rango previo (de igual
 * tamaño) para los deltas de comparación. También fija la ventana de
 * tendencia (chart) según el rango.
 *
 * Reglas:
 *   - `hoy`  → currentRange = hoy. prevRange = ayer. trend = últimos 30 días
 *     (1 punto no se puede graficar, así que mantenemos el contexto extendido).
 *   - `7d`   → currentRange = últimos 7 días terminando hoy. prevRange = los 7
 *     días previos. trend = mismos 7 días.
 *   - `30d`  → currentRange = últimos 30 días. prevRange = los 30 días previos.
 *     trend = mismos 30 días.
 *   - `mes`  → currentRange = mes actual (día 1 al fin de mes). prevRange = mes
 *     anterior. trend = días del mes actual transcurridos + lo que falte hasta
 *     fin de mes (huecos se rellenan con 0).
 *
 * Producción corre en America/Santiago — el sistema usa `new Date()` y los
 * comparadores TypeORM/MySQL ya trabajan en la zona del server.
 */
function computeRanges(range: DashboardRangeDto): {
  currentStart: Date;
  currentEnd: Date;
  prevStart: Date;
  prevEnd: Date;
  trendStart: Date;
  trendEnd: Date;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const todayStart = new Date(y, m, d, 0, 0, 0, 0);
  const todayEnd = new Date(y, m, d, 23, 59, 59, 999);

  if (range === 'hoy') {
    return {
      currentStart: todayStart,
      currentEnd: todayEnd,
      prevStart: new Date(y, m, d - 1, 0, 0, 0, 0),
      prevEnd: new Date(y, m, d - 1, 23, 59, 59, 999),
      // 30 días terminando hoy para que el chart tenga contexto suficiente.
      trendStart: new Date(y, m, d - 29, 0, 0, 0, 0),
      trendEnd: todayEnd,
    };
  }

  if (range === '7d') {
    return {
      currentStart: new Date(y, m, d - 6, 0, 0, 0, 0),
      currentEnd: todayEnd,
      prevStart: new Date(y, m, d - 13, 0, 0, 0, 0),
      prevEnd: new Date(y, m, d - 7, 23, 59, 59, 999),
      trendStart: new Date(y, m, d - 6, 0, 0, 0, 0),
      trendEnd: todayEnd,
    };
  }

  if (range === '30d') {
    return {
      currentStart: new Date(y, m, d - 29, 0, 0, 0, 0),
      currentEnd: todayEnd,
      prevStart: new Date(y, m, d - 59, 0, 0, 0, 0),
      prevEnd: new Date(y, m, d - 30, 23, 59, 59, 999),
      trendStart: new Date(y, m, d - 29, 0, 0, 0, 0),
      trendEnd: todayEnd,
    };
  }

  // 'mes'
  const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
  const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return {
    currentStart: monthStart,
    currentEnd: monthEnd,
    prevStart: new Date(y, m - 1, 1, 0, 0, 0, 0),
    prevEnd: new Date(y, m, 0, 23, 59, 59, 999),
    trendStart: monthStart,
    trendEnd: monthEnd,
  };
}

/**
 * (a − b) / |b| × 100, redondeado a 1 decimal. Devuelve null cuando b = 0
 * para evitar Infinity. Se usa para todos los deltas de comparación.
 */
function pctDelta(current: number, base: number): number | null {
  if (base === 0) return null;
  const raw = ((current - base) / Math.abs(base)) * 100;
  return Math.round(raw * 10) / 10;
}

/**
 * Normaliza el valor `DATE(...)` que devuelve MySQL al formato YYYY-MM-DD.
 * MySQL puede devolver Date object o string según driver y configuración —
 * normalizamos a string para que el lookup en el Map funcione siempre igual.
 */
function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // 'YYYY-MM-DD HH:MM:SS' o 'YYYY-MM-DD' → tomamos los primeros 10 chars
  return value.slice(0, 10);
}

/**
 * Genera una serie diaria desde `from` hasta `to` (inclusive en ambos extremos)
 * aplicando `makePoint(isoDate)` a cada día. Garantiza que el array resultante
 * no tenga huecos — las fechas sin datos devuelven el punto que la función
 * de fábrica decida (típicamente con valores en 0).
 */
function fillDailySeries<T>(
  from: Date,
  to: Date,
  makePoint: (iso: string) => T,
): T[] {
  const out: T[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getFullYear();
    const mo = String(cursor.getMonth() + 1).padStart(2, '0');
    const da = String(cursor.getDate()).padStart(2, '0');
    out.push(makePoint(`${y}-${mo}-${da}`));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

