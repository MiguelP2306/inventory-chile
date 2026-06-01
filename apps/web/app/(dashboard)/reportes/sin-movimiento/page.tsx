'use client';

/* ============================================================================
 *  SinMovimientoReportPage — REESTILIZADO con el sistema visual del rediseño
 *  (Inventario / Caja / Gastos). Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · useUrlFilters({ days }) — default 30, persistente en la URL.
 *   · getNoMovementReport(days) + getNoMovementCsvUrl(days) para el CSV.
 *   · rows / totalProducts / totalInventoryValue derivados igual.
 *   · Filas con Link a /productos/{id}; "nunca" / "∞" cuando no hay movimiento.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import { Download, PackageX } from 'lucide-react';
import Link from 'next/link';
import { TablePagination } from '@/components/table-pagination';
import { getNoMovementCsvUrl, getNoMovementReport } from '@/lib/dashboard-api';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUrlFilters } from '@/lib/use-url-filters';

const DAYS_OPTIONS = [30, 60, 90, 180];
const PAGE_SIZE = 50;

/**
 * Fase 9 — Reporte de productos sin movimiento. Lista los productos
 * activos que no tuvieron ningún `inventory_movement` en los últimos N
 * días (default 30). Útil para detectar stock estancado.
 */
export default function SinMovimientoReportPage() {
  const { values, setFilter } = useUrlFilters({ days: '', page: '' });
  const days = Number(values.days || '30');
  const page = Number(values.page || '1');

  const q = useQuery({
    queryKey: ['no-movement-report', days],
    queryFn: () => getNoMovementReport(days),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.totalProducts ?? 0;
  const inventoryValue = q.data?.totalInventoryValue ?? '0';

  // Paginación cliente — el reporte devuelve todas las filas a la vez.
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-slate-800 dark:text-slate-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Productos sin movimiento
          </h1>
          <p className="mt-1 max-w-[70ch] text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            Productos activos que no tuvieron ningún movimiento de inventario
            (compra, venta, ajuste, devolución, transferencia) en el período.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start">
          <div className="relative">
            <select
              value={String(days)}
              onChange={(e) => {
                setFilter('days', e.target.value === '30' ? null : e.target.value);
                setFilter('page', null);
              }}
              className="cursor-pointer appearance-none rounded-2xl border border-slate-200 bg-white py-3 pl-4 pr-9 text-xs font-bold text-slate-700 shadow-sm outline-none transition-colors hover:bg-slate-50 focus:border-[#2F6BFF] dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
            >
              {DAYS_OPTIONS.map((d) => (
                <option key={d} value={String(d)}>
                  Últimos {d} días
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <a
            href={getNoMovementCsvUrl(days)}
            download
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Exportar CSV
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="select-none space-y-1.5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <PackageX className="h-3.5 w-3.5" />
            Productos sin movimiento
          </div>
          {q.isLoading ? (
            <div className="h-7 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : (
            <div className="text-[22px] font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              {total.toLocaleString('es-CL')}
            </div>
          )}
        </div>
        <div className="select-none space-y-1.5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Valor inmovilizado
          </div>
          {q.isLoading ? (
            <div className="h-7 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : (
            <>
              <div className="text-[22px] font-black tracking-tight tabular-nums text-[#2F6BFF]">
                {formatCurrency(inventoryValue)}
              </div>
              <div className="text-[10px] font-medium text-slate-400">
                Suma de stock × costo unitario
              </div>
            </>
          )}
        </div>
      </div>

      {/* TABLA */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">SKU</th>
                <th className="py-4">Producto</th>
                <th className="py-4">Categoría</th>
                <th className="py-4">Marca</th>
                <th className="py-4 text-right">Stock total</th>
                <th className="py-4 text-right">Valor</th>
                <th className="py-4">Último movimiento</th>
                <th className="py-4 pr-6 text-right">Días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {q.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!q.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20">
                        <PackageX className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        Sin stock estancado
                      </p>
                      <p className="max-w-[44ch] text-xs font-medium text-slate-400">
                        Todos los productos tuvieron movimiento en los últimos{' '}
                        {days} días.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {pagedRows.map((r) => (
                <tr
                  key={r.productId}
                  className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                >
                  <td className="py-4 pl-6">
                    <Link
                      href={`/productos/${r.productId}`}
                      className="select-all font-mono text-[11.5px] font-bold text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-500"
                    >
                      {r.sku}
                    </Link>
                  </td>
                  <td className="max-w-[240px] truncate py-4">
                    <Link
                      href={`/productos/${r.productId}`}
                      className="font-extrabold tracking-tight text-slate-800 underline-offset-2 hover:underline dark:text-slate-100"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-4 font-medium text-slate-500 dark:text-slate-400">
                    {r.categoryName ?? '—'}
                  </td>
                  <td className="py-4 font-medium text-slate-500 dark:text-slate-400">
                    {r.brandName ?? '—'}
                  </td>
                  <td className="py-4 text-right font-mono text-[12.5px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {r.totalStock}
                  </td>
                  <td className="py-4 text-right font-mono text-[12.5px] font-black tabular-nums text-slate-900 dark:text-white">
                    {formatCurrency(r.inventoryValue)}
                  </td>
                  <td className="py-4 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                    {r.lastMovementAt ? (
                      new Date(r.lastMovementAt).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })
                    ) : (
                      <span className="italic text-slate-300 dark:text-slate-600">
                        nunca
                      </span>
                    )}
                  </td>
                  <td className="py-4 pr-6 text-right">
                    <DaysBadge value={r.daysSinceLastMovement} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!q.isLoading && (
          <TablePagination
            page={currentPage}
            totalPages={totalPages}
            total={rows.length}
            shown={pagedRows.length}
            noun="productos"
            nounSingular="producto"
            onPageChange={(n) => setFilter('page', String(n))}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   DAYS BADGE — colorea según antigüedad
   ============================================================ */
function DaysBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 font-mono text-[11px] font-extrabold text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
        ∞
      </span>
    );
  }
  const tone =
    value >= 90
      ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400'
      : value >= 60
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2.5 py-1 font-mono text-[11px] font-extrabold tabular-nums',
        tone,
      )}
    >
      {value} d
    </span>
  );
}
