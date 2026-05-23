'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Clock,
  ExternalLink,
  FileText,
  Info,
  MoreHorizontal,
  Package,
  PackageX,
  Plus,
  Receipt,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  Wallet,
  Warehouse,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { publicImageUrl } from '@/lib/catalog-api';
import { getDashboardSummary } from '@/lib/dashboard-api';
import { formatCurrency } from '@/lib/format';
import { useUrlFilters } from '@/lib/use-url-filters';
import { cn } from '@/lib/utils';
import type { DashboardRangeDto } from '@inventory/shared';

/* Rangos válidos del dashboard. Persistidos como `?range=hoy|7d|30d|mes`. */
const RANGES: DashboardRangeDto[] = ['hoy', '7d', '30d', 'mes'];

function parseRange(raw: string | undefined): DashboardRangeDto {
  return RANGES.includes(raw as DashboardRangeDto)
    ? (raw as DashboardRangeDto)
    : 'hoy';
}

/* Texto que reemplaza al "hoy/del día/este mes" según el rango activo.
 *  - `bigTitle`: usado en el H1 ("Hoy llevás X ventas").
 *  - `period`:   sufijo genérico ("X cotizaciones del día").
 *  - `kpiSub`:   subtítulo de KPI cards ("Ventas del día").
 *  - `deltaBase`: descripción del período de comparación ("vs ayer").
 *  - `trendWindow`: descripción de la ventana temporal del chart. Cuando
 *    range='hoy' el chart muestra 30 días para que tenga contexto; cuando
 *    se elige otro rango, la ventana iguala al rango. */
const RANGE_TEXT: Record<
  DashboardRangeDto,
  {
    bigTitle: string;
    period: string;
    kpiSub: string;
    deltaBase: string;
    trendWindow: string;
  }
> = {
  hoy: {
    bigTitle: 'Hoy llevás',
    period: 'del día',
    kpiSub: 'del día',
    deltaBase: 'vs ayer',
    trendWindow: 'últimos 30 días',
  },
  '7d': {
    bigTitle: 'En los últimos 7 días llevás',
    period: 'últimos 7 días',
    kpiSub: '7 días',
    deltaBase: 'vs 7d previos',
    trendWindow: 'últimos 7 días',
  },
  '30d': {
    bigTitle: 'En los últimos 30 días llevás',
    period: 'últimos 30 días',
    kpiSub: '30 días',
    deltaBase: 'vs 30d previos',
    trendWindow: 'últimos 30 días',
  },
  mes: {
    bigTitle: 'Este mes llevás',
    period: 'este mes',
    kpiSub: 'del mes',
    deltaBase: 'vs mes anterior',
    trendWindow: 'este mes',
  },
};

/**
 * Fase 9 — Dashboard rediseño D1+D3 fusion.
 *
 * Layout:
 *  · Page head — saludo + título + range + refresh
 *  · Alerts banner (solo si hay productos sin stock)
 *  · Quick actions (5 atajos a operaciones)
 *  · 4 KPI cards (Ventas hoy primary · Caja · Utilidad mes · Cotizaciones día)
 *  · Hero chart — tendencia ventas últimos 30 días
 *  · Flujo de caja 30 días + Embudo comercial
 *  · Top productos del mes + Mix de pago
 *  · Ventas por categoría + Follow-ups
 *  · Margen por categoría + Rotación por categoría
 *  · Alertas grid (sin stock / bajo stock / sin movimiento / rotación)
 *
 * Datos: `getDashboardSummary` (refresca 60s) devuelve el snapshot completo
 * descrito en `DashboardSummaryDto`. EmptyChartState aparece solo cuando un
 * array viene vacío (sin ventas, sin categorías con movimiento, etc.) — no
 * por falta de campos en el endpoint.
 */

/* ============================================================
   HELPERS
   ============================================================ */

function todayHuman(): string {
  return new Date()
    .toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, (c) => c.toUpperCase());
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/* Convierte el rango activo del dashboard a parámetros `?dateFrom=&dateTo=`
 * usables en los links a /ventas, /cotizaciones, etc. — así el click de un
 * KPI lleva al listado filtrado por el mismo período del dashboard. */
function rangeToDateParams(range: DashboardRangeDto): {
  from: string;
  to: string;
} {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  if (range === 'hoy') return { from: todayIso, to: todayIso };
  if (range === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to: todayIso };
  }
  if (range === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { from: d.toISOString().slice(0, 10), to: todayIso };
  }
  // 'mes'
  return { from: monthStartIso(), to: todayIso };
}

/** Formatea CLP compacto ($1.2M, $80K, $250). */
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/* Métodos de cobro — orden y colores fijos para el donut + leyenda */
const CASH_METHODS = [
  { key: 'CASH', label: 'Efectivo', color: '#10b981' },
  { key: 'TRANSFER', label: 'Transferencia', color: '#3b82f6' },
  { key: 'CARD_DEBIT', label: 'T. débito', color: '#8b5cf6' },
  { key: 'CARD_CREDIT', label: 'T. crédito', color: '#f59e0b' },
  { key: 'PAYMENT_LINK', label: 'Link de pago', color: '#f43f5e' },
] as const;

/* ============================================================
   TIPOS — alias del DTO del backend para mantener la inferencia local
   compacta. Todos los bloques nuevos (trend/top/followUps/comparison/
   monthBreakdown/lifecycleFunnel) están en DashboardSummaryDto desde Ronda 9.
   ============================================================ */
type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */
export default function DashboardHome() {
  const { values, setFilter } = useUrlFilters({ range: '' });
  const range = parseRange(values.range);

  const q = useQuery({
    queryKey: ['dashboard', 'summary', range],
    queryFn: () => getDashboardSummary(range),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const monthStart = monthStartIso();

  const setRange = (r: DashboardRangeDto) => {
    // `range=hoy` es el default — lo limpiamos de la URL para mantenerla corta.
    setFilter('range', r === 'hoy' ? null : r);
  };

  if (q.isLoading) return <DashboardSkeleton />;
  if (q.error || !q.data) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm shadow-sm">
        <p className="font-medium text-destructive">
          No se pudo cargar el dashboard.
        </p>
        <p className="mt-1 text-muted-foreground">
          Revisá la conexión con el servidor o reintentá en unos segundos.
        </p>
      </div>
    );
  }

  const s: DashboardSummary = q.data;

  return (
    <div className="flex flex-col gap-5">
      {/* ============================================================
          PAGE HEAD
          ============================================================ */}
      <PageHead
        summary={s}
        range={range}
        onRangeChange={setRange}
        onRefresh={() => q.refetch()}
        isRefreshing={q.isFetching && !q.isLoading}
      />

      {/* ============================================================
          ALERTS BANNER (solo si hay productos sin stock)
          ============================================================ */}
      {s.alerts.outOfStock > 0 && <AlertsBanner summary={s} />}

      {/* ============================================================
          QUICK ACTIONS
          ============================================================ */}
      <QuickActions />

      {/* ============================================================
          ROW 1 · 4 KPIs (ventas / caja / utilidad / cotizaciones)
          ============================================================ */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiVentasHoy summary={s} range={range} />
        <KpiCaja summary={s} range={range} />
        <KpiUtilidad summary={s} range={range} />
        <KpiCotizaciones summary={s} range={range} />
      </div>

      {/* ============================================================
          ROW 2 · TENDENCIA (hero chart — sigue el rango)
          ============================================================ */}
      <SalesTrendCard summary={s} range={range} />

      {/* ============================================================
          ROW 3 · FLUJO CAJA (2/3) + EMBUDO (1/3)
          ============================================================ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <CashFlowCard summary={s} range={range} />
        <FunnelCard summary={s} range={range} />
      </div>

      {/* ============================================================
          ROW 4 · TOP PRODUCTOS (1/2) + MIX DE PAGO (1/2)
          ============================================================ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProductsCard summary={s} range={range} />
        <MixPagoCard summary={s} range={range} />
      </div>

      {/* ============================================================
          ROW 5 · VENTAS POR CATEGORÍA (1/2) + FOLLOW-UPS (1/2)
          ============================================================ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategorySalesCard summary={s} range={range} />
        <FollowUpsCard summary={s} />
      </div>

      {/* ============================================================
          ROW 6 · MARGEN (1/2) + ROTACIÓN HEATMAP (1/2)
          ============================================================ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MarginCategoryCard summary={s} range={range} />
        <RotationByCategoryCard summary={s} range={range} />
      </div>

      {/* ============================================================
          ROW 7 · ALERTAS GRID
          ============================================================ */}
      <AlertsGrid summary={s} />
    </div>
  );
}

/* ============================================================
   PAGE HEAD — saludo + título con acento naranja + toolbar
   ============================================================ */
function PageHead({
  summary: s,
  range,
  onRangeChange,
  onRefresh,
  isRefreshing,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
  onRangeChange: (r: DashboardRangeDto) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const txt = RANGE_TEXT[range];
  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-40" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
          </span>
          <span>Buen día · {todayHuman()}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          {txt.bigTitle}{' '}
          <span className="text-orange-600 dark:text-orange-400">
            {s.today.sales.count} {s.today.sales.count === 1 ? 'venta' : 'ventas'}
          </span>{' '}
          por {formatCurrency(s.today.sales.amount)}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
          <span>
            <strong className="font-medium text-foreground">
              {s.today.quotations.count}
            </strong>{' '}
            cotizaciones {txt.period}
          </span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          <span>
            <strong className="font-medium text-foreground">
              {s.lifecycle.pendingFollowUp}
            </strong>{' '}
            pendientes de seguimiento
          </span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          <span>
            <strong className="font-medium text-foreground">
              {s.alerts.outOfStock}
            </strong>{' '}
            productos sin stock
          </span>
        </p>
      </div>
      <Toolbar
        range={range}
        onRangeChange={onRangeChange}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}

/* ============================================================
   ALERTS BANNER
   ============================================================ */
function AlertsBanner({ summary: s }: { summary: DashboardSummary }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400">
        <ShieldAlert className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[13.5px] font-semibold">
          <span className="text-rose-600 tabular-nums dark:text-rose-400">
            {s.alerts.outOfStock} productos sin stock
          </span>
          {s.alerts.lowStock > 0 && (
            <> y <span className="text-rose-600 tabular-nums dark:text-rose-400">{s.alerts.lowStock}</span> en nivel crítico requieren reposición</>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          Revisá el inventario para reponer antes de seguir vendiendo.
        </div>
      </div>
      <div className="hidden items-center gap-1.5 md:flex">
        {s.lifecycle.overdueFollowUp > 0 && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[11px] font-medium">
            <span className="font-mono text-rose-600 dark:text-rose-400">{s.lifecycle.overdueFollowUp}</span>
            <span className="text-muted-foreground">vencidos</span>
          </span>
        )}
        {s.alerts.noMovement30d > 0 && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[11px] font-medium">
            <span className="font-mono text-rose-600 dark:text-rose-400">{s.alerts.noMovement30d}</span>
            <span className="text-muted-foreground">sin movimiento</span>
          </span>
        )}
      </div>
      <Link
        href="/inventario?status=out"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[12.5px] font-medium text-background transition-opacity hover:opacity-90"
      >
        <span className="hidden sm:inline">Ver inventario</span>
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/* ============================================================
   QUICK ACTIONS
   ============================================================ */
function QuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
      <span className="px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Acciones rápidas
      </span>
      <span className="h-5 w-px bg-border" />
      <Link
        href="/ventas/nueva"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12.5px] font-medium text-background transition-opacity hover:opacity-90"
      >
        <ShoppingCart className="h-3.5 w-3.5" />
        Nueva venta
      </Link>
      <Link
        href="/cotizaciones?new=1"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium hover:bg-accent hover:text-accent-foreground"
      >
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        Cotización
      </Link>
      <Link
        href="/compras/nuevo"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium hover:bg-accent hover:text-accent-foreground"
      >
        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
        Compra
      </Link>
      <Link
        href="/inventario"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium hover:bg-accent hover:text-accent-foreground"
      >
        <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
        Ajustar stock
      </Link>
      <Link
        href="/productos"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium hover:bg-accent hover:text-accent-foreground"
      >
        <ScanLine className="h-3.5 w-3.5 text-muted-foreground" />
        Escanear
      </Link>
    </div>
  );
}

/* ============================================================
   KPI CARDS — 4 cards en row 1
   ============================================================ */

function KpiVentasHoy({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const delta = s.comparison?.salesDeltaPct;
  const txt = RANGE_TEXT[range];
  const dates = rangeToDateParams(range);
  // Para el sparkline tomamos hasta 14 puntos. En rango 'hoy' la serie es 30
  // días largos; en 'mes' es ~30; en '7d' / '30d' coincide con el rango.
  const series = s.trend?.salesByDay?.slice(-14).map((p) => p.amount) ?? null;
  return (
    <Link
      href={`/ventas?dateFrom=${dates.from}&dateTo=${dates.to}`}
      className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-foreground bg-foreground p-5 text-background shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <KpiHeader icon={<ShoppingCart className="h-3.5 w-3.5" />} title={`Ventas ${txt.kpiSub}`} invert />
      <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
        {formatCurrency(s.today.sales.amount)}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-background/70">
        {delta != null && <Delta pct={delta} invert />}
        <span>
          · {s.today.sales.count} {s.today.sales.count === 1 ? 'venta' : 'ventas'} {txt.period}
        </span>
      </div>
      {series && series.length > 1 && <Sparkline data={series} invert />}
    </Link>
  );
}

function KpiCaja({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const cashTotal = Number(s.today.cash.total);
  const delta = s.comparison?.cashDeltaPct;
  const txt = RANGE_TEXT[range];
  return (
    <Link
      href="/caja"
      className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <KpiHeader icon={<Wallet className="h-3.5 w-3.5" />} title="Caja disponible" />
      <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
        {formatCurrency(cashTotal)}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {delta != null ? (
          <Delta pct={delta} />
        ) : (
          <span className="text-muted-foreground">{txt.deltaBase}</span>
        )}
        <span>· por método</span>
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {CASH_METHODS.slice(0, 4).map((m) => {
          const value = Number(
            (s.today.cash.byMethod as Record<string, string | undefined>)[m.key] ?? '0',
          );
          return (
            <div key={m.key} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[11px]">
              <span className="h-2 w-2 rounded-[2.5px]" style={{ background: m.color }} />
              <span className="truncate text-muted-foreground">{m.label}</span>
              <span className="font-mono font-medium tabular-nums">{fmtCompact(value)}</span>
            </div>
          );
        })}
      </div>
    </Link>
  );
}

function KpiUtilidad({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const profit = Number(s.month.profit);
  const delta = s.comparison?.profitDeltaPct;
  const netSales = s.monthBreakdown?.netSales;
  const cogs = s.monthBreakdown?.cogs;
  const expenses = Number(s.month.expenses);
  const isNegative = profit < 0;
  const txt = RANGE_TEXT[range];
  const dates = rangeToDateParams(range);
  return (
    <Link
      href={`/reportes/ventas?dateFrom=${dates.from}&dateTo=${dates.to}`}
      className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <KpiHeader icon={<TrendingUp className="h-3.5 w-3.5" />} title={`Utilidad ${txt.kpiSub}`} />
      <div
        className={cn(
          'text-3xl font-semibold leading-none tracking-tight tabular-nums',
          isNegative && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {formatCurrency(s.month.profit)}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {delta != null ? <Delta pct={delta} /> : <span>ventas − COGS − gastos</span>}
      </div>
      {(netSales != null || cogs != null) && (
        <div className="mt-1 flex flex-col gap-1">
          {netSales != null && (
            <BreakdownRow color="#10b981" label="Ventas netas" value={fmtCompact(netSales)} />
          )}
          {cogs != null && (
            <BreakdownRow color="#3b82f6" label="COGS" value={fmtCompact(cogs)} />
          )}
          <BreakdownRow color="#ef4444" label="Gastos" value={fmtCompact(expenses)} />
        </div>
      )}
    </Link>
  );
}

function KpiCotizaciones({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const txt = RANGE_TEXT[range];
  const dates = rangeToDateParams(range);
  return (
    <Link
      href={`/cotizaciones?dateFrom=${dates.from}&dateTo=${dates.to}`}
      className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <KpiHeader
        icon={<FileText className="h-3.5 w-3.5" />}
        title={`Cotizaciones ${txt.kpiSub}`}
      />
      <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
        {formatCurrency(s.today.quotations.amount)}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>{s.today.quotations.count} cotizaciones emitidas</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-500/10 px-2 font-medium text-amber-700 dark:text-amber-300">
          <Clock className="h-2.5 w-2.5" />
          {s.lifecycle.pendingFollowUp} pendientes
        </span>
        {s.lifecycle.overdueFollowUp > 0 && (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-rose-500/10 px-2 font-medium text-rose-700 dark:text-rose-300">
            {s.lifecycle.overdueFollowUp} vencidos
          </span>
        )}
      </div>
    </Link>
  );
}

function KpiHeader({
  icon,
  title,
  invert,
}: {
  icon: ReactNode;
  title: string;
  invert?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md',
          invert ? 'bg-background/15 text-background' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          'flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-wider',
          invert ? 'text-background/65' : 'text-muted-foreground',
        )}
      >
        {title}
      </span>
      <ArrowUpRight
        className={cn(
          'h-3.5 w-3.5 opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100',
          invert ? 'text-background/70' : 'text-muted-foreground',
        )}
      />
    </div>
  );
}

function BreakdownRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-[11px]">
      <span className="h-2 w-2 rounded-[2.5px]" style={{ background: color }} />
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

/* ============================================================
   SECTION CARD + HEADER (shared scaffolding)
   ============================================================ */

function SectionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border bg-card p-5 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
        {subtitle && (
          <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ============================================================
   TENDENCIA DE VENTAS — hero area chart 30 días
   ============================================================ */
function SalesTrendCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const data = s.trend?.salesByDay;
  const totalRange = data?.reduce((a, b) => a + b.amount, 0);
  const delta = s.comparison?.salesDeltaPct;
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title="Tendencia de ventas"
        subtitle={
          data ? (
            <>
              {totalRange != null && (
                <strong className="text-foreground tabular-nums">
                  {formatCurrency(String(totalRange))}
                </strong>
              )}
              {delta != null && (
                <>
                  {' · '}
                  <span
                    className={cn(
                      'font-semibold',
                      delta >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
                    )}
                  >
                    {delta >= 0 ? '+' : ''}
                    {delta}% {txt.deltaBase}
                  </span>
                </>
              )}
              {` · ${txt.trendWindow}`}
            </>
          ) : (
            txt.trendWindow.charAt(0).toUpperCase() + txt.trendWindow.slice(1)
          )
        }
        action={
          <Link
            href="/reportes/ventas"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Ver reporte <ExternalLink className="h-3 w-3" />
          </Link>
        }
      />
      {data && data.length > 0 ? (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => new Date(v).toLocaleDateString('es-CL', { day: '2-digit' })}
                stroke="currentColor"
                strokeOpacity={0.4}
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => fmtCompact(v)}
                stroke="currentColor"
                strokeOpacity={0.4}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <ReTooltip content={<ChartTooltip valueFormatter={(v) => formatCurrency(String(v))} />} />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="currentColor"
                strokeWidth={2}
                fill="url(#trendGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChartState
          title="Sin datos de tendencia"
          hint={`Aún no hay ventas registradas en ${txt.trendWindow}.`}
          height={220}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================
   FLUJO DE CAJA — área apilada ingresos vs egresos
   ============================================================ */
function CashFlowCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const data = s.trend?.cashFlowByDay;
  const totalIn = data?.reduce((a, b) => a + b.inflow, 0) ?? 0;
  const totalOut = data?.reduce((a, b) => a + b.outflow, 0) ?? 0;
  const net = totalIn - totalOut;
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title="Flujo de caja"
        subtitle={`Ingresos vs egresos · ${txt.trendWindow}`}
        action={
          <Link
            href="/caja"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Libro de caja <ExternalLink className="h-3 w-3" />
          </Link>
        }
      />
      {data && data.length > 0 ? (
        <>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => new Date(v).toLocaleDateString('es-CL', { day: '2-digit' })}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => fmtCompact(v)}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <ReTooltip content={<ChartTooltip valueFormatter={(v) => formatCurrency(String(v))} />} />
                <Area type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} fill="url(#outGrad)" name="Egresos" />
                <Area type="monotone" dataKey="inflow" stroke="#10b981" strokeWidth={2} fill="url(#inGrad)" name="Ingresos" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-[11.5px]">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2.5px] bg-emerald-500" />
              <span className="text-muted-foreground">Ingresos</span>
              <span className="font-mono font-semibold tabular-nums">{fmtCompact(totalIn)}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2.5px] bg-rose-500" />
              <span className="text-muted-foreground">Egresos</span>
              <span className="font-mono font-semibold tabular-nums">{fmtCompact(totalOut)}</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-2">
              <span className="text-muted-foreground">Neto</span>
              <span
                className={cn(
                  'font-mono font-semibold tabular-nums',
                  net >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {net >= 0 ? '+' : ''}
                {fmtCompact(net)}
              </span>
            </span>
          </div>
        </>
      ) : (
        <EmptyChartState
          title="Sin datos de flujo"
          hint={`Aún no hay movimientos de caja en ${txt.trendWindow}.`}
          height={200}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================
   EMBUDO COMERCIAL — el funnel mezcla estado actual (NEW/QUOTED/
   FOLLOW_UP/LOST son conteos de lifecycle independientes del rango) con
   "Ganados" que SÍ depende del rango (clientes WON en el período).
   ============================================================ */
function FunnelCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const full = s.lifecycleFunnel;
  const txt = RANGE_TEXT[range];
  const dates = rangeToDateParams(range);
  const wonLabel =
    range === 'hoy'
      ? 'Ganados (hoy)'
      : range === 'mes'
        ? 'Ganados (mes)'
        : `Ganados (${txt.period})`;
  const rows = [
    { label: 'Nuevos', value: full.NEW, tone: 'blue' as const, href: '/seguimiento?tab=nuevos' },
    { label: 'Cotizados', value: full.QUOTED, tone: 'violet' as const, href: '/seguimiento?tab=cotizados' },
    { label: 'Seguimiento', value: full.FOLLOW_UP, tone: 'amber' as const, href: '/seguimiento?tab=pendientes' },
    {
      label: wonLabel,
      value: full.WON,
      tone: 'emerald' as const,
      href: `/ventas?status=PAID&dateFrom=${dates.from}&dateTo=${dates.to}`,
    },
    { label: 'Perdidos', value: full.LOST, tone: 'rose' as const, href: '/seguimiento?tab=perdidos' },
  ];
  return (
    <SectionCard>
      <SectionHeader
        title="Embudo comercial"
        subtitle={`Lifecycle · ganados ${txt.period}`}
      />
      <Funnel rows={rows} />
    </SectionCard>
  );
}

function Funnel({
  rows,
}: {
  rows: Array<{
    label: string;
    value: number;
    tone: 'amber' | 'rose' | 'emerald' | 'blue' | 'violet';
    href: string;
  }>;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const toneClass = {
    amber: 'bg-gradient-to-r from-amber-500 to-amber-300',
    rose: 'bg-gradient-to-r from-rose-500 to-rose-300',
    emerald: 'bg-gradient-to-r from-emerald-500 to-emerald-300',
    blue: 'bg-gradient-to-r from-blue-500 to-blue-300',
    violet: 'bg-gradient-to-r from-violet-500 to-violet-300',
  };
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <Link
          key={r.label}
          href={r.href}
          className="-mx-1.5 grid grid-cols-[96px_1fr_56px] items-center gap-3 rounded-md px-1.5 py-1 text-[12.5px] transition-colors hover:bg-accent/50"
        >
          <span className="truncate font-medium text-muted-foreground">{r.label}</span>
          <div className="h-[24px] overflow-hidden rounded-md bg-muted/60">
            <div
              className={cn('flex h-full items-center justify-end rounded-md px-2 text-[11px] font-semibold text-white transition-all', toneClass[r.tone])}
              style={{ width: `${(r.value / max) * 100}%` }}
            >
              {r.value > 0 && r.value}
            </div>
          </div>
          <span className="text-right font-mono font-semibold tabular-nums">{r.value}</span>
        </Link>
      ))}
    </div>
  );
}

/* ============================================================
   TOP PRODUCTOS — del período seleccionado
   ============================================================ */
function TopProductsCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const items = s.top?.products;
  const max = items && items.length > 0 ? Math.max(...items.map((i) => i.amount)) : 0;
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title={`Top productos ${txt.kpiSub}`}
        subtitle="Por monto facturado"
        action={
          <Link
            href="/reportes/ventas?view=top"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Ver todos <ExternalLink className="h-3 w-3" />
          </Link>
        }
      />
      {items && items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {items.slice(0, 5).map((p) => {
            const w = (p.amount / max) * 100;
            const up = (p.deltaPct ?? 0) >= 0;
            return (
              <Link
                key={p.id}
                href={`/productos/${p.id}`}
                className="-mx-1.5 grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1 text-[12.5px] transition-colors hover:bg-accent/50"
              >
                <div className="h-9 w-9 overflow-hidden rounded-lg border bg-muted">
                  {publicImageUrl(p.coverUrl) && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={publicImageUrl(p.coverUrl) ?? ''}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{p.name}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-1 max-w-[200px] flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-foreground" style={{ width: `${w}%` }} />
                    </span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {p.units} u.
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[12.5px] font-semibold tabular-nums">
                    {fmtCompact(p.amount)}
                  </div>
                  {p.deltaPct != null && (
                    <div
                      className={cn(
                        'text-[10.5px] font-medium tabular-nums',
                        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {up ? '+' : ''}
                      {p.deltaPct}%
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyChartState
          title="Sin datos de top productos"
          hint={`Sin ventas ${txt.period} — los productos top aparecen cuando hay al menos una venta confirmada.`}
          height={200}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================
   MIX DE PAGO — donut con la caja del período seleccionado
   ============================================================ */
function MixPagoCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const cashTotal = Number(s.today.cash.total);
  const donutData = CASH_METHODS.map((m) => ({
    label: m.label,
    value: Number(
      (s.today.cash.byMethod as Record<string, string | undefined>)[m.key] ?? '0',
    ),
    color: m.color,
  }));
  const sumAll = donutData.reduce((a, b) => a + b.value, 0);
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title="Mix de pago"
        subtitle={`Distribución de caja ${txt.period}`}
      />
      <div className="flex items-center gap-6">
        <Donut
          data={donutData}
          size={140}
          thickness={16}
          centerValue={fmtCompact(cashTotal)}
          centerLabel="caja total"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {donutData.map((d) => {
            const pct = sumAll > 0 ? Math.round((d.value / sumAll) * 100) : 0;
            return (
              <div key={d.label} className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 rounded-[2.5px]" style={{ background: d.color }} />
                <span className="truncate font-medium">{d.label}</span>
                <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">{pct}%</span>
                <span className="font-mono text-[11.5px] font-semibold tabular-nums">{fmtCompact(d.value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

/* ============================================================
   VENTAS POR CATEGORÍA — stacked horizontal bar + legend
   ============================================================ */
function CategorySalesCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const items = s.top?.categories;
  const total = items?.reduce((a, c) => a + c.amount, 0) ?? 0;
  const palette = ['#10b981', '#3b82f6', '#ef4444', '#0ea5e9', '#8b5cf6', '#f59e0b', '#06b6d4'];
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title="Ventas por categoría"
        subtitle={`Distribución ${txt.period}`}
      />
      {items && items.length > 0 ? (
        <>
          <div className="mb-4 flex h-7 overflow-hidden rounded-md">
            {items.map((c, i) => {
              const pct = (c.amount / total) * 100;
              const color = palette[i % palette.length];
              return (
                <span
                  key={c.id}
                  className="flex items-center justify-start overflow-hidden whitespace-nowrap px-2 font-mono text-[10.5px] font-semibold text-white"
                  style={{ background: color, width: `${pct}%`, minWidth: pct < 8 ? '8%' : undefined }}
                  title={`${c.name} · ${fmtCompact(c.amount)} (${pct.toFixed(0)}%)`}
                >
                  {pct > 8 ? c.name : ''}
                </span>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((c, i) => {
              const pct = (c.amount / total) * 100;
              const color = palette[i % palette.length];
              return (
                <div key={c.id} className="flex items-center gap-2 text-[11.5px]">
                  <span className="h-2 w-2 rounded-[2.5px]" style={{ background: color }} />
                  <span className="truncate text-muted-foreground">{c.name}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyChartState
          title="Sin datos por categoría"
          hint={`Aún no hay categorías con ventas ${txt.period}.`}
          height={140}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================
   FOLLOW-UPS — list with WhatsApp buttons
   ============================================================ */
function FollowUpsCard({ summary: s }: { summary: DashboardSummary }) {
  const items = s.followUps;
  return (
    <SectionCard>
      <SectionHeader
        title="Follow-ups pendientes"
        subtitle={
          <>
            <strong className="text-foreground">{s.lifecycle.pendingFollowUp}</strong> pendientes
            {s.lifecycle.overdueFollowUp > 0 && (
              <> · <span className="text-rose-600 dark:text-rose-400">{s.lifecycle.overdueFollowUp} vencidos</span></>
            )}
          </>
        }
        action={
          <Link
            href="/seguimiento?tab=pendientes"
            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Bandeja <ExternalLink className="h-3 w-3" />
          </Link>
        }
      />
      {items && items.length > 0 ? (
        <div className="flex flex-col gap-1">
          {items.slice(0, 5).map((f) => (
            <div
              key={f.id}
              className="-mx-1.5 grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1.5 text-[12.5px] transition-colors hover:bg-accent/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-[12px] font-semibold text-white">
                {initialsOf(f.customerName)}
              </span>
              <div className="min-w-0">
                <Link href={`/cotizaciones/${f.id}`} className="block truncate text-[13px] font-medium hover:underline">
                  {f.customerName}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    {f.quoteNumber}
                  </span>
                  <span>·</span>
                  <span className="font-mono tabular-nums">{fmtCompact(f.amount)}</span>
                  <span>·</span>
                  <span
                    className={cn(
                      'font-medium',
                      f.daysSinceLastContact <= 2
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
                    )}
                  >
                    hace {f.daysSinceLastContact}d
                  </span>
                </div>
              </div>
              {f.phone && (
                <a
                  href={`https://wa.me/${f.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#25d366] px-2.5 text-[11.5px] font-semibold text-white hover:opacity-90"
                >
                  <WhatsAppIcon className="h-3 w-3" />
                  WhatsApp
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyChartState
          title="Sin lista de follow-ups"
          hint="No hay clientes pendientes de seguimiento — los QUOTED/FOLLOW_UP con cotización SENT/APPROVED aparecen acá."
          height={200}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================
   MARGEN POR CATEGORÍA — bars simples
   ============================================================ */
function MarginCategoryCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const items = s.top?.categories;
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title="Margen por categoría"
        subtitle={`Promedio ${txt.period} · ventas − costo`}
      />
      {items && items.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {[...items]
            .sort((a, b) => b.marginPct - a.marginPct)
            .map((c) => {
              const max = Math.max(...items.map((i) => i.marginPct));
              return (
                <div key={c.id} className="grid grid-cols-[100px_1fr_60px] items-center gap-3 text-[12px]">
                  <span className="truncate text-muted-foreground">{c.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-foreground"
                      style={{ width: `${(c.marginPct / max) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-mono font-semibold tabular-nums">
                    {c.marginPct}%
                  </span>
                </div>
              );
            })}
        </div>
      ) : (
        <EmptyChartState
          title="Sin datos de margen"
          hint={`Aún no hay categorías con margen calculable ${txt.period}.`}
          height={180}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================
   ROTACIÓN POR CATEGORÍA — lista con turnover real (sin heatmap sintético)
   ============================================================
   Decisión: mostramos turnover REAL por categoría (COGS_mes / stock_actual).
   Antes había un heatmap de 12 celdas/mes que ruidaba valores alrededor del
   turnover real — era estético pero falso. Para tener histórico real
   necesitamos snapshots diarios de stock (fuera de scope). El día que llegue,
   se reintroduce un heatmap apoyado en /reportes/rotacion/12m.
   ============================================================ */
function RotationByCategoryCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const items = s.top.categories;
  const overall = Number(s.alerts.inventoryTurnover);
  const sorted = [...items].sort((a, b) => b.turnover - a.turnover);
  const maxTurnover = sorted.length > 0 ? Math.max(...sorted.map((c) => c.turnover), 0.0001) : 1;
  const txt = RANGE_TEXT[range];

  return (
    <SectionCard>
      <SectionHeader
        title="Rotación por categoría"
        subtitle={
          isFinite(overall) ? (
            <>
              Global: <strong className="text-foreground tabular-nums">{overall.toFixed(1)}×</strong>
              {s.alerts.inventoryTurnoverIsApprox && <> · aproximado</>}
            </>
          ) : (
            `COGS ${txt.period} / inventario actual`
          )
        }
      />
      {sorted.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {sorted.slice(0, 8).map((c) => (
            <RotationByCategoryRow
              key={c.id}
              name={c.name}
              turnover={c.turnover}
              maxTurnover={maxTurnover}
            />
          ))}
        </div>
      ) : (
        <EmptyChartState
          title="Sin datos de rotación"
          hint="Aún no hay ventas en categorías este mes. La rotación se calcula como COGS de la categoría / stock actual de la categoría."
          height={180}
        />
      )}
    </SectionCard>
  );
}

function RotationByCategoryRow({
  name,
  turnover,
  maxTurnover,
}: {
  name: string;
  turnover: number;
  maxTurnover: number;
}) {
  const pct = (turnover / maxTurnover) * 100;
  const tone =
    turnover >= 3
      ? { bar: 'bg-emerald-500', label: 'alta', labelClass: 'text-emerald-600 dark:text-emerald-400' }
      : turnover >= 1.5
        ? { bar: 'bg-amber-500', label: 'media', labelClass: 'text-amber-600 dark:text-amber-400' }
        : { bar: 'bg-rose-500', label: 'baja', labelClass: 'text-rose-600 dark:text-rose-400' };
  return (
    <div className="grid grid-cols-[100px_1fr_80px] items-center gap-3 text-[12px]">
      <span className="truncate text-muted-foreground">{name}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-full rounded-full', tone.bar)} style={{ width: `${pct}%` }} />
      </span>
      <div className="text-right">
        <span className="font-mono text-[11.5px] font-semibold tabular-nums">{turnover.toFixed(1)}×</span>
        <span className={cn('block text-[9.5px] font-medium uppercase tracking-wider', tone.labelClass)}>
          {tone.label}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   ALERTAS GRID — 4 chips
   ============================================================ */
function AlertsGrid({ summary: s }: { summary: DashboardSummary }) {
  return (
    <SectionCard>
      <SectionHeader
        title="Alertas activas"
        subtitle="Inventario y rotación que requieren atención"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AlertChip
          href="/inventario?status=out"
          tone={s.alerts.outOfStock > 0 ? 'rose' : 'neutral'}
          icon={PackageX}
          label="Sin stock"
          value={s.alerts.outOfStock}
        />
        <AlertChip
          href="/inventario?status=low"
          tone={s.alerts.lowStock > 0 ? 'amber' : 'neutral'}
          icon={AlertTriangle}
          label="Bajo stock"
          value={s.alerts.lowStock}
        />
        <AlertChip
          href="/reportes/sin-movimiento"
          tone={s.alerts.noMovement30d > 0 ? 'amber' : 'neutral'}
          icon={BarChart3}
          label="Sin movimiento 30d"
          value={s.alerts.noMovement30d}
        />
        <AlertChip
          href="/reportes/sin-movimiento"
          tone="neutral"
          icon={TrendingUp}
          label="Rotación inv."
          value={s.alerts.inventoryTurnover}
          sub={s.alerts.inventoryTurnoverIsApprox ? 'aprox.' : undefined}
        />
      </div>
    </SectionCard>
  );
}

function AlertChip({
  href,
  tone,
  icon: Icon,
  label,
  value,
  sub,
}: {
  href: string;
  tone: 'rose' | 'amber' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  const tones = {
    rose: 'bg-rose-500/[0.06] border-rose-500/20 text-rose-700 dark:bg-rose-500/[0.08] dark:text-rose-400',
    amber: 'bg-amber-500/[0.06] border-amber-500/20 text-amber-700 dark:bg-amber-500/[0.08] dark:text-amber-400',
    neutral: 'bg-foreground/[0.02] border-border text-muted-foreground',
  };
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-1 rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-sm',
        tones[tone],
      )}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider opacity-90">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
        {sub && <span className="text-[10px] opacity-80">{sub}</span>}
      </div>
    </Link>
  );
}

/* ============================================================
   PRIMITIVES — Delta, Sparkline, Donut, EmptyChartState, Tooltip
   ============================================================ */

function Delta({ pct, invert }: { pct: number; invert?: boolean }) {
  const up = pct >= 0;
  const positive = up
    ? invert ? 'bg-background/15 text-background' : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
    : invert ? 'bg-background/15 text-background' : 'bg-rose-500/12 text-rose-700 dark:text-rose-400';
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums', positive)}>
      {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {Math.abs(pct)}%
    </span>
  );
}

function Sparkline({ data, invert }: { data: number[]; invert?: boolean }) {
  const W = 200, H = 32, pad = 2;
  const max = Math.max(...data), min = Math.min(...data);
  const xStep = (W - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * xStep;
    const y = pad + (H - pad * 2) * (1 - (v - min) / (max - min || 1));
    return [x, y];
  });
  const line = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const fill = `${line} L${W - pad},${H} L${pad},${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1 block">
      <path d={fill} fill={invert ? 'rgba(255,255,255,0.18)' : 'currentColor'} opacity={invert ? 1 : 0.12} />
      <path d={line} fill="none" stroke={invert ? 'rgba(255,255,255,0.85)' : 'currentColor'} strokeWidth={1.5} />
    </svg>
  );
}

/* Donut SVG (preservado del original — no requiere recharts). */
function Donut({
  data,
  size,
  thickness,
  centerValue,
  centerLabel,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size: number;
  thickness: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={thickness} className="dark:stroke-white/10" />
          {data.map((seg, i) => {
            if (total === 0) return null;
            const length = (seg.value / total) * circumference;
            const node = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return node;
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {centerValue && (
          <div className="text-base font-semibold leading-none tabular-nums">{centerValue}</div>
        )}
        {centerLabel && (
          <div className="mt-1 text-[9.5px] uppercase tracking-wider text-muted-foreground">
            {centerLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyChartState({
  title,
  hint,
  height,
}: {
  title: string;
  hint: string;
  height: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-6 text-center"
      style={{ minHeight: height }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card">
        <Info className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-medium">{title}</p>
      <p className="max-w-[44ch] text-[11.5px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value: number; color?: string; dataKey?: string }>;
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border bg-card px-2.5 py-1.5 text-[11.5px] shadow-md">
      {label && (
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {typeof label === 'string' && label.length === 10
            ? new Date(label).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
            : label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-[2.5px]" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name ?? p.dataKey}</span>
          <span className="ml-auto font-mono font-semibold tabular-nums">
            {valueFormatter ? valueFormatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   TOOLBAR — range selector + refresh (idem original, sólo retoque)
   ============================================================ */
function Toolbar({
  range,
  onRangeChange,
  onRefresh,
  isRefreshing,
}: {
  range: DashboardRangeDto;
  onRangeChange: (r: DashboardRangeDto) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  // Polish Mayo 2026 — los 4 rangos están cableados. El range se persiste en
  // URL como `?range=hoy|7d|30d|mes` (default `hoy` sin param). Cambia los
  // bloques temporales del dashboard; alertas y embudo quedan independientes.
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="inline-flex h-9 items-center rounded-[10px] border bg-card p-0.5 shadow-sm">
        {RANGES.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onRangeChange(k)}
            className={cn(
              'h-full rounded-md px-3 text-xs font-medium transition-colors',
              range === k
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {k === 'hoy' ? 'Hoy' : k === 'mes' ? 'Mes' : k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Refrescar"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
      </button>
    </div>
  );
}

/* ============================================================
   SKELETON
   ============================================================ */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-[80px] w-full rounded-2xl" />
      <Skeleton className="h-[60px] w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((c) => (
          <Skeleton key={c} className="h-[180px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[280px] rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-[280px] rounded-2xl" />
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-2xl" />
        <Skeleton className="h-[260px] rounded-2xl" />
      </div>
    </div>
  );
}

/* ============================================================
   HELPERS — initials + WhatsApp icon
   ============================================================ */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 11.5a8.4 8.4 0 01-1 4 8.5 8.5 0 01-7.6 4.5 8.4 8.4 0 01-4-1L3 21l1.9-5.4a8.4 8.4 0 01-1-4 8.5 8.5 0 014.5-7.6 8.4 8.4 0 014-1A8.5 8.5 0 0121 11.5z" />
    </svg>
  );
}

