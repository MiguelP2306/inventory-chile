'use client';

/* ============================================================================
 *  Dashboard — REESTILIZADO con el sistema visual de "Dashboard.tsx".
 *
 *  QUÉ CAMBIÓ (solo UI/UX — la capa de datos es idéntica al original):
 *   · Fondo de app slate-100 / tarjetas blancas con sombra suave.
 *   · Acento azul #2F6BFF (antes naranja). Positivos emerald, negativos rose.
 *   · Tipografía font-black en títulos, labels font-bold uppercase slate-400.
 *   · KPIs: tarjetas blancas h-32 con chip de ícono de color (azul/indigo/
 *     rose/amber) y delta en pastilla rounded-full (se eliminó la tarjeta
 *     oscura invertida del original para igualar el diseño de referencia).
 *   · Tarjetas grandes rounded-3xl p-6; KPIs y chips rounded-2xl.
 *   · Toolbar con controles tipo "pill" (rounded-full) + botón Exportar azul.
 *   · Charts recharts recoloreados a #2F6BFF / emerald / rose.
 *
 *  DEPENDENCIAS: idénticas a las que ya usás (react-query, recharts, lucide,
 *  next/link, @inventory/shared, helpers de @/lib/*). No agrega ninguna.
 *
 *  NOTA Tailwind: las sombras suaves van como valor arbitrario
 *  (shadow-[...]) vía la constante SOFT, así funciona sin tocar
 *  tailwind.config. Si preferís, podés mover esa sombra a
 *  theme.extend.boxShadow.soft y reemplazar SOFT por 'shadow-soft'.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Clock,
  ExternalLink,
  FileText,
  Info,
  PackageX,
  RefreshCw,
  Send,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  Wallet,
  type LucideIcon,
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
import {
  formatCurrency,
  isoDaysAgo,
  parseIsoDateLocal,
  todayIso,
} from '@/lib/format';
import { useUrlFilters } from '@/lib/use-url-filters';
import { cn } from '@/lib/utils';
import type { DashboardRangeDto } from '@inventory/shared';

/* ============================================================
   DESIGN TOKENS (del sistema visual de referencia)
   ============================================================ */
const ACCENT = '#2F6BFF';
/* Sombra suave reutilizable (valor arbitrario → funciona sin config). */
const SOFT =
  'shadow-[0_1px_2px_rgba(15,23,42,0.05),0_6px_20px_-8px_rgba(15,23,42,0.12)]';
/* Variantes hover como LITERALES (necesario para que Tailwind JIT las detecte
 * — nunca las construyas por concatenación). */
const HOVER_SOFT =
  'hover:shadow-[0_1px_2px_rgba(15,23,42,0.05),0_6px_20px_-8px_rgba(15,23,42,0.12)]';
const HOVER_SOFT_LG =
  'hover:shadow-[0_8px_30px_-10px_rgba(15,23,42,0.18)]';
/* Tarjeta base (blanca light / #11151C dark). */
const CARD =
  'rounded-3xl border border-transparent bg-white dark:border-slate-800 dark:bg-[#11151C]';

/* Rangos válidos del dashboard. Persistidos como `?range=hoy|7d|30d|mes`. */
const RANGES: DashboardRangeDto[] = ['hoy', '7d', '30d', 'mes'];

function parseRange(raw: string | undefined): DashboardRangeDto {
  return RANGES.includes(raw as DashboardRangeDto)
    ? (raw as DashboardRangeDto)
    : 'hoy';
}

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

/* ============================================================
   HELPERS (idénticos al original — lógica de datos sin cambios)
   ============================================================ */

function todayHuman(): string {
  return new Date()
    .toLocaleDateString('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    .replace(/^./, (c) => c.toUpperCase());
}

function monthStartIso(): string {
  // Primer día del mes actual en hora Chile (todayIso ya viene en hora Chile).
  return `${todayIso().slice(0, 7)}-01`;
}

function rangeToDateParams(range: DashboardRangeDto): {
  from: string;
  to: string;
} {
  const today = todayIso();
  if (range === 'hoy') return { from: today, to: today };
  if (range === '7d') return { from: isoDaysAgo(6), to: today };
  if (range === '30d') return { from: isoDaysAgo(29), to: today };
  return { from: monthStartIso(), to: today };
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

  const setRange = (r: DashboardRangeDto) => {
    setFilter('range', r === 'hoy' ? null : r);
  };

  if (q.isLoading) return <DashboardSkeleton />;
  if (q.error || !q.data) {
    return (
      <div className={cn(CARD, SOFT, 'p-6 text-sm')}>
        <p className="font-bold text-rose-600 dark:text-rose-400">
          No se pudo cargar el dashboard.
        </p>
        <p className="mt-1 text-slate-400">
          Revisá la conexión con el servidor o reintentá en unos segundos.
        </p>
      </div>
    );
  }

  const s: DashboardSummary = q.data;

  return (
    <div className="flex flex-col gap-5 text-slate-800 dark:text-slate-200">
      <PageHead
        summary={s}
        range={range}
        onRangeChange={setRange}
        onRefresh={() => q.refetch()}
        isRefreshing={q.isFetching && !q.isLoading}
      />

      {s.alerts.outOfStock > 0 && <AlertsBanner summary={s} />}

      <QuickActions />

      {/* ROW 1 · 4 KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiVentas summary={s} range={range} />
        <KpiCaja summary={s} range={range} />
        <KpiUtilidad summary={s} range={range} />
        <KpiCotizaciones summary={s} range={range} />
      </div>

      {/* ROW 2 · TENDENCIA (hero) */}
      <SalesTrendCard summary={s} range={range} />

      {/* ROW 3 · FLUJO CAJA (2/3) + EMBUDO (1/3) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <CashFlowCard summary={s} range={range} />
        <FunnelCard summary={s} range={range} />
      </div>

      {/* ROW 4 · TOP PRODUCTOS (1/2) + MIX DE PAGO (1/2) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TopProductsCard summary={s} range={range} />
        <MixPagoCard summary={s} range={range} />
      </div>

      {/* ROW 5 · VENTAS POR CATEGORÍA (1/2) + FOLLOW-UPS (1/2) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CategorySalesCard summary={s} range={range} />
        <FollowUpsCard summary={s} />
      </div>

      {/* ROW 6 · MARGEN (1/2) + ROTACIÓN (1/2) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <MarginCategoryCard summary={s} range={range} />
        <RotationByCategoryCard summary={s} range={range} />
      </div>

      {/* ROW 7 · ALERTAS GRID */}
      <AlertsGrid summary={s} />
    </div>
  );
}

/* ============================================================
   PAGE HEAD — saludo + título + toolbar pill
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
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span>Buen día · {todayHuman()}</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[28px]">
          {txt.bigTitle}{' '}
          <span style={{ color: ACCENT }} className="dark:brightness-125">
            {s.today.sales.count}{' '}
            {s.today.sales.count === 1 ? 'venta' : 'ventas'}
          </span>{' '}
          por {formatCurrency(s.today.sales.amount)}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-slate-400">
          <span>
            <strong className="font-bold text-slate-600 dark:text-slate-300">
              {s.today.quotations.count}
            </strong>{' '}
            cotizaciones {txt.period}
          </span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>
            <strong className="font-bold text-slate-600 dark:text-slate-300">
              {s.lifecycle.pendingFollowUp}
            </strong>{' '}
            pendientes de seguimiento
          </span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>
            <strong className="font-bold text-slate-600 dark:text-slate-300">
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
    <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/25 dark:bg-rose-500/[0.06]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
        <ShieldAlert className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[13.5px] font-bold text-slate-800 dark:text-slate-100">
          <span className="tabular-nums text-rose-600 dark:text-rose-400">
            {s.alerts.outOfStock} productos sin stock
          </span>
          {s.alerts.lowStock > 0 && (
            <>
              {' '}
              y{' '}
              <span className="tabular-nums text-rose-600 dark:text-rose-400">
                {s.alerts.lowStock}
              </span>{' '}
              en nivel crítico requieren reposición
            </>
          )}
        </div>
        <div className="mt-0.5 text-[12px] font-medium text-slate-400">
          Revisá el inventario para reponer antes de seguir vendiendo.
        </div>
      </div>
      <div className="hidden items-center gap-1.5 md:flex">
        {s.lifecycle.overdueFollowUp > 0 && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-semibold dark:border-slate-700 dark:bg-[#11151C]">
            <span className="font-mono text-rose-600 dark:text-rose-400">
              {s.lifecycle.overdueFollowUp}
            </span>
            <span className="text-slate-400">vencidos</span>
          </span>
        )}
        {s.alerts.noMovement30d > 0 && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-semibold dark:border-slate-700 dark:bg-[#11151C]">
            <span className="font-mono text-rose-600 dark:text-rose-400">
              {s.alerts.noMovement30d}
            </span>
            <span className="text-slate-400">sin movimiento</span>
          </span>
        )}
      </div>
      <Link
        href="/inventario?status=out"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-slate-900"
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
    <div className={cn(CARD, SOFT, 'flex flex-wrap items-center gap-2 !rounded-2xl p-2.5')}>
      <span className="px-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Acciones rápidas
      </span>
      <span className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
      <Link
        href="/ventas/nueva"
        style={{ backgroundColor: ACCENT }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
      >
        <ShoppingCart className="h-3.5 w-3.5" />
        Nueva venta
      </Link>
      <QuickAction href="/cotizaciones?new=1" icon={FileText} label="Cotización" />
      <QuickAction href="/compras/nuevo" icon={Truck} label="Compra" />
      <QuickAction href="/inventario" icon={ShieldAlert} label="Ajustar stock" />
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      {label}
    </Link>
  );
}

/* ============================================================
   KPI CARDS — blancas con chip de ícono de color (estilo referencia)
   ============================================================ */
function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  iconClass,
  children,
  isNegative,
}: {
  href: string;
  label: string;
  value: string;
  icon: LucideIcon;
  iconClass: string;
  children: ReactNode;
  isNegative?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        CARD,
        SOFT,
        HOVER_SOFT_LG,
        '!rounded-2xl group flex h-32 flex-col justify-between overflow-hidden p-5 transition-all hover:-translate-y-0.5',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <h3
            className={cn(
              'mt-1 text-2xl font-black tracking-tight tabular-nums text-slate-800 dark:text-white',
              isNegative && 'text-rose-600 dark:text-rose-400',
            )}
          >
            {value}
          </h3>
        </div>
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
            iconClass,
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">{children}</div>
    </Link>
  );
}

function KpiVentas({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const delta = s.comparison?.salesDeltaPct;
  const txt = RANGE_TEXT[range];
  const dates = rangeToDateParams(range);
  return (
    <KpiCard
      href={`/ventas?dateFrom=${dates.from}&dateTo=${dates.to}`}
      label={`Ventas ${txt.kpiSub}`}
      value={formatCurrency(s.today.sales.amount)}
      icon={ShoppingCart}
      iconClass="bg-blue-50 text-[#2F6BFF] dark:bg-blue-900/20 dark:text-blue-400"
    >
      {delta != null && <Delta pct={delta} />}
      <span className="text-[10px] font-medium text-slate-400">
        · {s.today.sales.count} {s.today.sales.count === 1 ? 'venta' : 'ventas'}{' '}
        {txt.period}
      </span>
      {/* El monto ya viene neto de devoluciones: se explicita cuánto se
          descontó para que el número cuadre con lo que ve el operador. */}
      {s.today.returns && s.today.returns.count > 0 && (
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
          · devoluciones −{formatCurrency(s.today.returns.amount)}
        </span>
      )}
    </KpiCard>
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
    <KpiCard
      href="/caja"
      label="Caja disponible"
      value={formatCurrency(cashTotal)}
      icon={Wallet}
      iconClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
    >
      {delta != null ? (
        <Delta pct={delta} />
      ) : (
        <span className="text-[10px] font-medium text-slate-400">
          {txt.deltaBase}
        </span>
      )}
      <span className="text-[10px] font-medium text-slate-400">
        · por método de cobro
      </span>
    </KpiCard>
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
  const txt = RANGE_TEXT[range];
  const dates = rangeToDateParams(range);
  return (
    <KpiCard
      href={`/reportes/ventas?dateFrom=${dates.from}&dateTo=${dates.to}`}
      label={`Ganancia bruta ${txt.kpiSub}`}
      value={formatCurrency(s.month.profit)}
      icon={TrendingUp}
      iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
      isNegative={profit < 0}
    >
      {delta != null ? (
        <Delta pct={delta} />
      ) : null}
      <span className="text-[10px] font-medium text-slate-400">
        · ventas − COGS − gastos
      </span>
    </KpiCard>
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
    <KpiCard
      href={`/cotizaciones?dateFrom=${dates.from}&dateTo=${dates.to}`}
      label={`Cotizaciones ${txt.kpiSub}`}
      value={formatCurrency(s.today.quotations.amount)}
      icon={FileText}
      iconClass="bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400"
    >
      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-50 px-2 text-[10px] font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
        <Clock className="h-2.5 w-2.5" />
        {s.lifecycle.pendingFollowUp} pendientes
      </span>
      {s.lifecycle.overdueFollowUp > 0 && (
        <span className="inline-flex h-5 items-center rounded-full bg-rose-50 px-2 text-[10px] font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          {s.lifecycle.overdueFollowUp} vencidos
        </span>
      )}
    </KpiCard>
  );
}

/* ============================================================
   SECTION CARD + HEADER (scaffolding compartido)
   ============================================================ */
function SectionCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(CARD, SOFT, 'flex min-w-0 flex-col p-6', className)}>
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
        <h3 className="text-[15px] font-black tracking-tight text-slate-900 dark:text-white">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-[11.5px] font-medium text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-7 items-center gap-1 rounded-full px-3 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

/* ============================================================
   TENDENCIA DE VENTAS — hero area chart
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
                <strong className="tabular-nums text-slate-700 dark:text-slate-200">
                  {formatCurrency(String(totalRange))}
                </strong>
              )}
              {delta != null && (
                <>
                  {' · '}
                  <span
                    className={cn(
                      'font-bold',
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
        action={<CardLink href="/reportes/ventas" label="Ver reporte" />}
      />
      {data && data.length > 0 ? (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#94A3B8"
                strokeOpacity={0.18}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v) =>
                  parseIsoDateLocal(v).toLocaleDateString('es-CL', {
                    day: '2-digit',
                  })
                }
                stroke="#94A3B8"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => fmtCompact(v)}
                stroke="#94A3B8"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <ReTooltip
                content={
                  <ChartTooltip
                    valueFormatter={(v) => formatCurrency(String(v))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke={ACCENT}
                strokeWidth={2.6}
                fill="url(#trendGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChartState
          title="Sin datos de tendencia"
          hint={`Aún no hay ventas registradas en ${txt.trendWindow}.`}
          height={240}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================
   FLUJO DE CAJA — área ingresos vs egresos
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
        action={<CardLink href="/caja" label="Libro de caja" />}
      />
      {data && data.length > 0 ? (
        <>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#94A3B8"
                  strokeOpacity={0.18}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) =>
                    parseIsoDateLocal(v).toLocaleDateString('es-CL', {
                      day: '2-digit',
                    })
                  }
                  stroke="#94A3B8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => fmtCompact(v)}
                  stroke="#94A3B8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <ReTooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(v) => formatCurrency(String(v))}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="outflow"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#outGrad)"
                  name="Egresos"
                />
                <Area
                  type="monotone"
                  dataKey="inflow"
                  stroke="#10b981"
                  strokeWidth={2.4}
                  fill="url(#inGrad)"
                  name="Ingresos"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-[11.5px] dark:border-slate-800">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
              <span className="font-medium text-slate-400">Ingresos</span>
              <span className="font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {fmtCompact(totalIn)}
              </span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-rose-500" />
              <span className="font-medium text-slate-400">Egresos</span>
              <span className="font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {fmtCompact(totalOut)}
              </span>
            </span>
            <span className="ml-auto inline-flex items-center gap-2">
              <span className="font-medium text-slate-400">Neto</span>
              <span
                className={cn(
                  'font-mono font-bold tabular-nums',
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
   EMBUDO COMERCIAL
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
    amber: 'bg-gradient-to-r from-amber-500 to-amber-400',
    rose: 'bg-gradient-to-r from-rose-500 to-rose-400',
    emerald: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    blue: 'bg-gradient-to-r from-blue-500 to-blue-400',
    violet: 'bg-gradient-to-r from-violet-500 to-violet-400',
  };
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <Link
          key={r.label}
          href={r.href}
          className="-mx-1.5 grid grid-cols-[88px_1fr_44px] items-center gap-3 rounded-lg px-1.5 py-1 text-[12.5px] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="truncate font-semibold text-slate-400">
            {r.label}
          </span>
          <div className="h-6 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            <div
              className={cn(
                'flex h-full items-center justify-end rounded-lg px-2 text-[11px] font-bold text-white transition-all',
                toneClass[r.tone],
              )}
              style={{ width: `${(r.value / max) * 100}%` }}
            >
              {r.value > 0 && r.value}
            </div>
          </div>
          <span className="text-right font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {r.value}
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ============================================================
   TOP PRODUCTOS
   ============================================================ */
function TopProductsCard({
  summary: s,
  range,
}: {
  summary: DashboardSummary;
  range: DashboardRangeDto;
}) {
  const items = s.top?.products;
  const max =
    items && items.length > 0 ? Math.max(...items.map((i) => i.amount)) : 0;
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title={`Top productos ${txt.kpiSub}`}
        subtitle="Por monto facturado"
        action={<CardLink href="/reportes/ventas?view=top" label="Ver todos" />}
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
                className="-mx-1.5 grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1 text-[12.5px] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="h-9 w-9 overflow-hidden rounded-xl border border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
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
                  <span className="block truncate text-[13px] font-bold text-slate-800 dark:text-slate-200">
                    {p.name}
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-1 max-w-[200px] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span
                        className="block h-full rounded-full bg-slate-800 dark:bg-slate-200"
                        style={{ width: `${w}%` }}
                      />
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-400">
                      {p.units} u.
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[12.5px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmtCompact(p.amount)}
                  </div>
                  {p.deltaPct != null && (
                    <div
                      className={cn(
                        'text-[10.5px] font-bold tabular-nums',
                        up
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400',
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
   MIX DE PAGO — donut
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
      (s.today.cash.byMethod as Record<string, string | undefined>)[m.key] ??
        '0',
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
      <div className="flex items-center gap-5">
        <Donut
          data={donutData}
          size={130}
          thickness={16}
          centerValue={fmtCompact(cashTotal)}
          centerLabel="caja total"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {donutData.map((d) => {
            const pct = sumAll > 0 ? Math.round((d.value / sumAll) * 100) : 0;
            return (
              <div
                key={d.label}
                className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2 text-[12px]"
              >
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: d.color }}
                />
                <span className="truncate font-semibold text-slate-600 dark:text-slate-300">
                  {d.label}
                </span>
                <span className="font-mono text-[10.5px] tabular-nums text-slate-400">
                  {pct}%
                </span>
                <span className="font-mono text-[11.5px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                  {fmtCompact(d.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

/* ============================================================
   VENTAS POR CATEGORÍA
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
  const palette = [
    '#10b981',
    '#3b82f6',
    '#ef4444',
    '#0ea5e9',
    '#8b5cf6',
    '#f59e0b',
    '#06b6d4',
  ];
  const txt = RANGE_TEXT[range];
  return (
    <SectionCard>
      <SectionHeader
        title="Ventas por categoría"
        subtitle={`Distribución ${txt.period}`}
      />
      {items && items.length > 0 ? (
        <>
          <div className="mb-4 flex h-7 overflow-hidden rounded-lg">
            {items.map((c, i) => {
              const pct = (c.amount / total) * 100;
              const color = palette[i % palette.length];
              return (
                <span
                  key={c.id}
                  className="flex items-center justify-start overflow-hidden whitespace-nowrap px-2 font-mono text-[10.5px] font-bold text-white"
                  style={{
                    background: color,
                    width: `${pct}%`,
                    minWidth: pct < 8 ? '8%' : undefined,
                  }}
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
                <div
                  key={c.id}
                  className="flex items-center gap-2 text-[11.5px]"
                >
                  <span
                    className="h-2 w-2 rounded-[3px]"
                    style={{ background: color }}
                  />
                  <span className="truncate text-slate-500 dark:text-slate-400">
                    {c.name}
                  </span>
                  <span className="ml-auto font-mono text-[10.5px] tabular-nums text-slate-400">
                    {pct.toFixed(0)}%
                  </span>
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
   FOLLOW-UPS
   ============================================================ */
function FollowUpsCard({ summary: s }: { summary: DashboardSummary }) {
  const items = s.followUps;
  return (
    <SectionCard>
      <SectionHeader
        title="Follow-ups pendientes"
        subtitle={
          <>
            <strong className="text-slate-700 dark:text-slate-200">
              {s.lifecycle.pendingFollowUp}
            </strong>{' '}
            pendientes
            {s.lifecycle.overdueFollowUp > 0 && (
              <>
                {' · '}
                <span className="text-rose-600 dark:text-rose-400">
                  {s.lifecycle.overdueFollowUp} vencidos
                </span>
              </>
            )}
          </>
        }
        action={<CardLink href="/seguimiento?tab=pendientes" label="Bandeja" />}
      />
      {items && items.length > 0 ? (
        <div className="flex flex-col gap-1">
          {items.slice(0, 5).map((f) => (
            <div
              key={f.id}
              className="-mx-1.5 grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl px-1.5 py-1.5 text-[12.5px] transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-[12px] font-bold text-white">
                {initialsOf(f.customerName)}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/cotizaciones/${f.id}`}
                  className="block truncate text-[13px] font-bold text-slate-800 hover:underline dark:text-slate-200"
                >
                  {f.customerName}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                    {f.quoteNumber}
                  </span>
                  <span>·</span>
                  <span className="font-mono tabular-nums">
                    {fmtCompact(f.amount)}
                  </span>
                  <span>·</span>
                  <span
                    className={cn(
                      'font-semibold',
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
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#25d366] px-2.5 text-[11.5px] font-bold text-white hover:opacity-90"
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
   MARGEN POR CATEGORÍA
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
                <div
                  key={c.id}
                  className="grid grid-cols-[100px_1fr_60px] items-center gap-3 text-[12px]"
                >
                  <span className="truncate text-slate-500 dark:text-slate-400">
                    {c.name}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span
                      className="block h-full rounded-full bg-slate-800 dark:bg-slate-200"
                      style={{ width: `${(c.marginPct / max) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
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
   ROTACIÓN POR CATEGORÍA
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
  const maxTurnover =
    sorted.length > 0 ? Math.max(...sorted.map((c) => c.turnover), 0.0001) : 1;
  const txt = RANGE_TEXT[range];

  return (
    <SectionCard>
      <SectionHeader
        title="Rotación por categoría"
        subtitle={
          isFinite(overall) ? (
            <>
              Global:{' '}
              <strong className="tabular-nums text-slate-700 dark:text-slate-200">
                {overall.toFixed(1)}×
              </strong>
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
      ? {
          bar: 'bg-emerald-500',
          label: 'alta',
          labelClass: 'text-emerald-600 dark:text-emerald-400',
        }
      : turnover >= 1.5
        ? {
            bar: 'bg-amber-500',
            label: 'media',
            labelClass: 'text-amber-600 dark:text-amber-400',
          }
        : {
            bar: 'bg-rose-500',
            label: 'baja',
            labelClass: 'text-rose-600 dark:text-rose-400',
          };
  return (
    <div className="grid grid-cols-[100px_1fr_80px] items-center gap-3 text-[12px]">
      <span className="truncate text-slate-500 dark:text-slate-400">
        {name}
      </span>
      <span className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span
          className={cn('block h-full rounded-full', tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </span>
      <div className="text-right">
        <span className="font-mono text-[11.5px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
          {turnover.toFixed(1)}×
        </span>
        <span
          className={cn(
            'block text-[9.5px] font-bold uppercase tracking-wider',
            tone.labelClass,
          )}
        >
          {tone.label}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   ALERTAS GRID
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
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
}) {
  const tones = {
    rose: 'border-rose-200 bg-rose-50/60 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/[0.08] dark:text-rose-400',
    amber:
      'border-amber-200 bg-amber-50/60 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/[0.08] dark:text-amber-400',
    neutral:
      'border-slate-200 bg-slate-50/60 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40',
  };
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-1 rounded-2xl border px-4 py-3 transition-all hover:-translate-y-0.5',
        HOVER_SOFT,
        tones[tone],
      )}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-black tabular-nums text-slate-800 dark:text-white">
          {value}
        </span>
        {sub && (
          <span className="text-[10px] font-medium text-slate-400">{sub}</span>
        )}
      </div>
    </Link>
  );
}

/* ============================================================
   PRIMITIVES
   ============================================================ */

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
        up
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-400'
          : 'bg-rose-50 text-rose-600 dark:bg-rose-950/45 dark:text-rose-400',
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct)}%
    </span>
  );
}

/* Donut SVG (preservado del original). */
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
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(15,23,42,0.07)"
            strokeWidth={thickness}
            className="dark:stroke-white/10"
          />
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
          <div className="text-base font-black leading-none tabular-nums text-slate-800 dark:text-white">
            {centerValue}
          </div>
        )}
        {centerLabel && (
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
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
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center dark:border-slate-700 dark:bg-slate-800/20"
      style={{ minHeight: height }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-[#11151C]">
        <Info className="h-4 w-4 text-slate-400" />
      </div>
      <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">
        {title}
      </p>
      <p className="max-w-[44ch] text-[11.5px] font-medium leading-snug text-slate-400">
        {hint}
      </p>
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
  payload?: Array<{
    name?: string;
    value: number;
    color?: string;
    dataKey?: string;
  }>;
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-[11.5px] shadow-[0_8px_30px_-10px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-[#161B22]">
      {label && (
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
          {typeof label === 'string' && label.length === 10
            ? parseIsoDateLocal(label).toLocaleDateString('es-CL', {
                day: '2-digit',
                month: 'short',
              })
            : label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-[3px]"
            style={{ background: p.color }}
          />
          <span className="text-slate-400">{p.name ?? p.dataKey}</span>
          <span className="ml-auto font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {valueFormatter ? valueFormatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   TOOLBAR — controles tipo "pill" + Exportar azul
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
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {/* Segmented range — estilo pill */}
      <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:border-slate-700 dark:bg-[#11151C]">
        {RANGES.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onRangeChange(k)}
            style={range === k ? { backgroundColor: ACCENT } : undefined}
            className={cn(
              'rounded-full px-3.5 py-1 text-[12px] font-bold transition-colors',
              range === k
                ? 'text-white'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {k === 'hoy' ? 'Hoy' : k === 'mes' ? 'Mes' : k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:text-slate-700 dark:border-slate-700 dark:bg-[#11151C] dark:hover:text-slate-200"
        aria-label="Refrescar"
      >
        <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((c) => (
          <Skeleton key={c} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[320px] rounded-3xl" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-[300px] rounded-3xl" />
        <Skeleton className="h-[300px] rounded-3xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-3xl" />
        <Skeleton className="h-[260px] rounded-3xl" />
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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 11.5a8.4 8.4 0 01-1 4 8.5 8.5 0 01-7.6 4.5 8.4 8.4 0 01-4-1L3 21l1.9-5.4a8.4 8.4 0 01-1-4 8.5 8.5 0 014.5-7.6 8.4 8.4 0 014-1A8.5 8.5 0 0121 11.5z" />
    </svg>
  );
}
