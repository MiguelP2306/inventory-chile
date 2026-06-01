'use client';

/* ============================================================================
 *  ProyecciónPage (Proyección de stock) — REESTILIZADO con el sistema visual
 *  del rediseño (Inventario / Caja / Gastos). Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · useQuery(settings) + draft/applied lead time (se aplica al click "Aplicar").
 *   · showAll → toggle "Solo críticos" / "Mostrar todos".
 *   · getProjection({ leadTimeDays, all }) + projectionCsvUrl(...) para el CSV.
 *   · rows / effectiveLeadTime / windowDays derivados igual que antes.
 *
 *  CAMBIOS DE ESTILO: título font-black, subtítulo con conteo en azul #2F6BFF,
 *  caja de filtros rounded-2xl, KPIs rounded-2xl, banner informativo, tabla
 *  rounded-3xl con thead uppercase, badges de estado con punto.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Gauge,
  Info,
  PackageSearch,
  TrendingDown,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { TablePagination } from '@/components/table-pagination';
import { getCompanySettings } from '@/lib/cashbox-api';
import { formatCurrency } from '@/lib/format';
import { getProjection, projectionCsvUrl } from '@/lib/reports-api';
import { cn } from '@/lib/utils';
import { useUrlFilters } from '@/lib/use-url-filters';

const ACCENT = '#2F6BFF';
const PAGE_SIZE = 50;

export default function ProyeccionPage() {
  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000,
  });

  // Si el usuario edita el input lo aplicamos solo al hacer click en "Aplicar"
  // — evita re-querys en cada keystroke. El query usa `appliedLeadTime`.
  const [draftLeadTime, setDraftLeadTime] = useState<string>('');
  const [appliedLeadTime, setAppliedLeadTime] = useState<number | undefined>(
    undefined,
  );
  const [showAll, setShowAll] = useState(false);

  // Paginación (cliente) — el endpoint devuelve todas las filas; `page` vive en
  // la URL para ser compartible, igual que el resto de las tablas.
  const { values, setFilter } = useUrlFilters({ page: '' });
  const page = Number(values.page || '1');

  // Cuando llegan los settings inicializamos el draft con el valor del backend.
  useEffect(() => {
    if (settings.data && draftLeadTime === '') {
      setDraftLeadTime(String(settings.data.defaultLeadTimeDays));
    }
  }, [settings.data, draftLeadTime]);

  const projection = useQuery({
    queryKey: ['projection', { leadTimeDays: appliedLeadTime, all: showAll }],
    queryFn: () =>
      getProjection({ leadTimeDays: appliedLeadTime, all: showAll }),
  });

  const rows = projection.data?.rows ?? [];
  const effectiveLeadTime =
    projection.data?.leadTimeDays ?? settings.data?.defaultLeadTimeDays ?? 75;
  const windowDays = projection.data?.windowDays ?? 90;

  const criticalCount = rows.filter((r) => r.isCritical).length;
  const suggestedTotal = rows.reduce(
    (acc, r) => acc + r.suggestedOrder * Number(r.cost ?? 0),
    0,
  );

  function applyLeadTime() {
    const parsed = Number(draftLeadTime);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 365) {
      setAppliedLeadTime(parsed);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-slate-800 dark:text-slate-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Proyección de stock
          </h1>
          <p className="mt-1 max-w-[70ch] text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            Consumo promedio calculado sobre los últimos{' '}
            <strong className="font-extrabold text-slate-700 dark:text-slate-200">
              {windowDays} días
            </strong>
            . Productos críticos = cobertura ≤ lead time. Stock = suma de todas
            las bodegas activas.
          </p>
        </div>

        <a
          href={projectionCsvUrl({ leadTimeDays: appliedLeadTime, all: showAll })}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90"
        >
          <Download className="h-4 w-4" />
          Descargar lista de críticos
        </a>
      </div>

      {/* ============================================================
          KPIs
          ============================================================ */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Productos críticos"
          value={criticalCount.toLocaleString('es-CL')}
          loading={projection.isLoading}
          tone={criticalCount > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          icon={<PackageSearch className="h-3.5 w-3.5" />}
          label={showAll ? 'Productos activos' : 'En la lista'}
          value={rows.length.toLocaleString('es-CL')}
          loading={projection.isLoading}
        />
        <KpiCard
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label="Lead time"
          value={`${effectiveLeadTime} días`}
          loading={projection.isLoading}
          accent
        />
        <KpiCard
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          label="Inversión sugerida"
          value={formatCurrency(suggestedTotal.toFixed(2))}
          loading={projection.isLoading}
        />
      </div>

      {/* ============================================================
          CONTROLES — lead time + toggle
          ============================================================ */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="leadTime"
              className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400"
            >
              Lead time (días)
            </label>
            <input
              id="leadTime"
              type="number"
              min={1}
              max={365}
              value={draftLeadTime}
              onChange={(e) => setDraftLeadTime(e.target.value)}
              className="w-32 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs font-bold text-slate-800 outline-none transition-all focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-850 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={applyLeadTime}
            className="cursor-pointer rounded-2xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#2F6BFF]/90"
          >
            Aplicar
          </button>
        </div>

        <div className="flex items-center gap-2">
          <TogglePill active={!showAll} onClick={() => setShowAll(false)}>
            Solo críticos
          </TogglePill>
          <TogglePill active={showAll} onClick={() => setShowAll(true)}>
            Mostrar todos
          </TogglePill>
        </div>
      </div>

      {/* ============================================================
          BANNER INFORMATIVO
          ============================================================ */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#2F6BFF]/20 bg-[#2F6BFF]/[0.04] p-4 text-xs dark:border-[#2F6BFF]/25 dark:bg-[#2F6BFF]/[0.06]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2F6BFF]" />
        <div className="space-y-0.5">
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            Lead time actual:{' '}
            <strong className="font-extrabold text-[#2F6BFF]">
              {effectiveLeadTime} días
            </strong>
            . La sugerencia de pedido cubre el lead time + 30 días de buffer
            post-llegada.
          </p>
          {projection.data && (
            <p className="font-medium text-slate-500 dark:text-slate-400">
              Mostrando{' '}
              <strong className="font-extrabold text-slate-700 dark:text-slate-200">
                {rows.length}
              </strong>{' '}
              {showAll
                ? rows.length === 1
                  ? 'producto'
                  : 'productos'
                : rows.length === 1
                  ? 'producto crítico'
                  : 'productos críticos'}
              .
            </p>
          )}
        </div>
      </div>

      {/* ============================================================
          TABLA
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">SKU</th>
                <th className="py-4">Producto</th>
                <th className="py-4 text-right">Stock</th>
                <th className="py-4 text-right">Consumo/día</th>
                <th className="py-4 text-right">Cobertura</th>
                <th className="py-4">Quiebre estimado</th>
                <th className="py-4 text-right">Sugerencia pedido</th>
                <th className="py-4 pr-6 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {projection.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!projection.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <Gauge className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {showAll
                          ? 'No hay productos activos'
                          : 'Sin productos críticos'}
                      </p>
                      <p className="max-w-[44ch] text-xs font-medium text-slate-400">
                        {showAll
                          ? 'No se encontraron productos activos para proyectar.'
                          : 'La cobertura de todos los productos supera el lead time configurado.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!projection.isLoading &&
                rows.map((r) => (
                  <tr
                    key={r.productId}
                    className={cn(
                      'transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10',
                      r.isCritical && 'bg-rose-500/[0.03]',
                    )}
                  >
                    <td className="select-all py-4 pl-6 font-mono text-[11.5px] font-bold text-slate-400 dark:text-slate-500">
                      {r.sku}
                    </td>
                    <td className="max-w-[280px] truncate py-4 font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
                      {r.name}
                    </td>
                    <td className="py-4 text-right font-mono text-[12.5px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                      {r.totalStock}
                    </td>
                    <td className="py-4 text-right font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                      {r.dailyConsumption.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        'py-4 text-right font-mono text-[12.5px] font-bold tabular-nums',
                        r.isCritical
                          ? 'text-rose-500'
                          : 'text-slate-700 dark:text-slate-200',
                      )}
                    >
                      {r.coverageDays != null
                        ? `${r.coverageDays.toFixed(1)} d`
                        : '∞'}
                    </td>
                    <td className="py-4 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                      {r.stockoutDate ? (
                        new Date(r.stockoutDate).toLocaleDateString('es-CL', {
                          dateStyle: 'medium',
                        })
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-4 text-right tabular-nums">
                      {r.suggestedOrder > 0 ? (
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="font-mono text-[13px] font-black text-slate-900 dark:text-white">
                            {r.suggestedOrder}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            ≈{' '}
                            {formatCurrency(
                              (r.suggestedOrder * Number(r.cost ?? 0)).toFixed(2),
                            )}
                          </span>
                        </span>
                      ) : (
                        <span className="font-mono text-slate-300 dark:text-slate-600">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-6">
                      <div className="flex justify-center">
                        {r.isCritical ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            Crítico
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            OK
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   KPI CARD
   ============================================================ */
function KpiCard({
  icon,
  label,
  value,
  loading,
  accent,
  tone = 'default',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
  accent?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="select-none space-y-1.5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      {loading ? (
        <div className="h-7 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div
          className={cn(
            'text-[22px] font-black tracking-tight tabular-nums',
            tone === 'danger'
              ? 'text-rose-500'
              : accent
                ? 'text-[#2F6BFF]'
                : 'text-slate-900 dark:text-white',
          )}
          style={accent && tone !== 'danger' ? { color: ACCENT } : undefined}
        >
          {value}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TOGGLE PILL
   ============================================================ */
function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl px-4 py-2 text-[11.5px] font-bold transition-all',
        active
          ? 'bg-[#2F6BFF] text-white shadow-md'
          : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-850 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {children}
    </button>
  );
}
