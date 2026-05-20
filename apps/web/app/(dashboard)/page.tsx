'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Clock,
  CreditCard,
  FileClock,
  FileText,
  PackageX,
  PieChart,
  Receipt,
  Send,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { getDashboardSummary } from '@/lib/dashboard-api';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Fase 9 — Dashboard mobile-first.
 *
 * Estructura: 4 secciones de cards, cada card es clicable y lleva a la
 * pantalla detalle filtrada. Grid responsivo:
 *   - mobile: 1 columna
 *   - md: 2 columnas
 *   - lg: 4 columnas
 *
 * La fuente de datos es `GET /dashboard/summary` (un único endpoint
 * agregado). Refresca cada 60 segundos en background.
 */
export default function DashboardHome() {
  const q = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const monthStart = monthStartIso();

  if (q.isLoading) return <DashboardSkeleton />;
  if (q.error || !q.data) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm">
        <p className="font-medium text-destructive">
          No se pudo cargar el dashboard.
        </p>
        <p className="mt-1 text-muted-foreground">
          Revisá la conexión con el servidor o reintentá en unos segundos.
        </p>
      </div>
    );
  }

  const s = q.data;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Operación del día */}
      <Section title="Operación del día" subtitle={chileToday()}>
        <KpiCard
          href={`/ventas?dateFrom=${todayIso}&dateTo=${todayIso}`}
          icon={ShoppingCart}
          accent="emerald"
          title="Ventas del día"
          value={String(s.today.sales.count)}
          subValue={formatCurrency(s.today.sales.amount)}
          subLabel="facturado"
        />
        <KpiCard
          href={`/cotizaciones?dateFrom=${todayIso}&dateTo=${todayIso}`}
          icon={FileText}
          accent="violet"
          title="Cotizaciones del día"
          value={String(s.today.quotations.count)}
          subValue={formatCurrency(s.today.quotations.amount)}
          subLabel="cotizado"
        />
        <KpiCard
          href="/caja"
          icon={Wallet}
          accent="blue"
          title="Caja disponible"
          value={formatCurrency(s.today.cash.total)}
          subValue={
            <span className="text-xs">
              <Banknote className="mr-1 inline h-3 w-3" />
              {formatCurrency(s.today.cash.byMethod.CASH)} efectivo ·{' '}
              <Send className="mr-1 inline h-3 w-3" />
              {formatCurrency(s.today.cash.byMethod.TRANSFER)} transf ·{' '}
              <CreditCard className="mr-1 inline h-3 w-3" />
              {formatCurrency(
                String(
                  Number(s.today.cash.byMethod.CARD_DEBIT ?? '0') +
                    Number(s.today.cash.byMethod.CARD_CREDIT ?? '0') +
                    Number(s.today.cash.byMethod.PAYMENT_LINK ?? '0'),
                ),
              )}{' '}
              tarj
            </span>
          }
        />
      </Section>

      {/* Lifecycle / Comercial — depende de Fase 8.5 */}
      <Section title="Embudo comercial">
        <KpiCard
          href="/seguimiento?tab=pendientes"
          icon={Clock}
          accent={s.lifecycle.pendingFollowUp > 0 ? 'amber' : 'neutral'}
          title="Pendientes de seguimiento"
          value={String(s.lifecycle.pendingFollowUp)}
          subLabel="clientes en QUOTED + FOLLOW_UP"
        />
        <KpiCard
          href="/seguimiento?tab=vencidos"
          icon={FileClock}
          accent={s.lifecycle.overdueFollowUp > 0 ? 'destructive' : 'neutral'}
          title="Vencidos"
          value={String(s.lifecycle.overdueFollowUp)}
          subLabel="follow-up sin respuesta a tiempo"
        />
        <KpiCard
          href={`/ventas?status=PAID&dateFrom=${monthStart}&dateTo=${todayIso}`}
          icon={Trophy}
          accent="emerald"
          title="Ventas ganadas del mes"
          value={String(s.lifecycle.wonThisMonth)}
          subLabel="clientes que cerraron este mes"
        />
      </Section>

      {/* Mes */}
      <Section title="Mes actual">
        <KpiCard
          href={`/reportes/ventas?dateFrom=${monthStart}&dateTo=${todayIso}`}
          icon={Number(s.month.profit) >= 0 ? TrendingUp : TrendingDown}
          accent={Number(s.month.profit) >= 0 ? 'emerald' : 'destructive'}
          title="Utilidad del mes"
          value={formatCurrency(s.month.profit)}
          subLabel="ventas netas − COGS − gastos"
        />
        <KpiCard
          href="/inventario"
          icon={Warehouse}
          accent="blue"
          title="Valor inventario"
          value={formatCurrency(s.month.inventoryValue)}
          subLabel="stock activo × costo unitario"
        />
        <KpiCard
          href={`/gastos?dateFrom=${monthStart}&dateTo=${todayIso}`}
          icon={Receipt}
          accent="neutral"
          title="Gastos del mes"
          value={formatCurrency(s.month.expenses)}
          subLabel="gastos no anulados"
        />
      </Section>

      {/* Alertas */}
      <Section title="Alertas">
        <KpiCard
          href="/inventario?status=out"
          icon={PackageX}
          accent={s.alerts.outOfStock > 0 ? 'destructive' : 'neutral'}
          title="Stock crítico"
          value={String(s.alerts.outOfStock)}
          subLabel="productos sin stock"
        />
        <KpiCard
          href="/inventario?status=low"
          icon={AlertTriangle}
          accent={s.alerts.lowStock > 0 ? 'amber' : 'neutral'}
          title="Bajo stock"
          value={String(s.alerts.lowStock)}
          subLabel="productos por debajo del mínimo"
        />
        <KpiCard
          href="/reportes/sin-movimiento"
          icon={BarChart3}
          accent={s.alerts.noMovement30d > 0 ? 'amber' : 'neutral'}
          title="Sin movimiento 30d"
          value={String(s.alerts.noMovement30d)}
          subLabel="productos sin actividad reciente"
        />
        <KpiCard
          href="/reportes/sin-movimiento"
          icon={PieChart}
          accent="neutral"
          title="Rotación de inventario"
          value={s.alerts.inventoryTurnover}
          subLabel={
            s.alerts.inventoryTurnoverIsApprox
              ? 'aprox. (COGS mes / inventario actual)'
              : 'COGS mes / inventario promedio'
          }
        />
      </Section>
    </div>
  );
}

// ---------- helpers visuales ----------

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

type Accent = 'neutral' | 'emerald' | 'blue' | 'violet' | 'amber' | 'destructive';

const ACCENT_CLS: Record<Accent, { ring: string; icon: string }> = {
  neutral: { ring: 'hover:border-foreground/40', icon: 'text-muted-foreground' },
  emerald: {
    ring: 'hover:border-emerald-500/60',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    ring: 'hover:border-blue-500/60',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  violet: {
    ring: 'hover:border-violet-500/60',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  amber: {
    ring: 'hover:border-amber-500/60',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  destructive: {
    ring: 'hover:border-destructive/60',
    icon: 'text-destructive',
  },
};

function KpiCard({
  href,
  icon: Icon,
  accent,
  title,
  value,
  subValue,
  subLabel,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: Accent;
  title: string;
  value: string;
  subValue?: React.ReactNode;
  subLabel?: string;
}) {
  const cls = ACCENT_CLS[accent];
  return (
    <Link
      href={href}
      className={cn(
        'group rounded-md border bg-card p-4 transition-colors',
        cls.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4 shrink-0', cls.icon)} />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </span>
        </div>
        <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      {subValue && (
        <div className="mt-1 text-sm tabular-nums text-foreground">
          {subValue}
        </div>
      )}
      {subLabel && (
        <div className="mt-1 text-xs text-muted-foreground">{subLabel}</div>
      )}
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-40" />
      {[0, 1, 2, 3].map((s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((c) => (
              <Skeleton key={c} className="h-28 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function chileToday(): string {
  return new Date().toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
