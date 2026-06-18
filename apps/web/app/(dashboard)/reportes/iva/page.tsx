'use client';

/* ============================================================================
 *  ReporteIvaPage — REESTILIZADO con el sistema visual del rediseño
 *  (Inventario / Caja / Gastos). Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · useUrlFilters({ dateFrom, dateTo }) → query params persistentes.
 *   · getIvaReport(params) + ivaReportCsvUrl(params) para el CSV.
 *   · balance > 0 → "A pagar"; < 0 → "A favor".
 *   · Tabs Ventas / Compras (ahora pills locales con useState).
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Receipt, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { TablePagination } from '@/components/table-pagination';
import { formatCurrency } from '@/lib/format';
import { getIvaReport, ivaReportCsvUrl } from '@/lib/reports-api';
import { cn } from '@/lib/utils';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 50;

const FIELD =
  'w-44 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-850 dark:bg-[#11151C] dark:text-white';

export default function ReporteIvaPage() {
  const { values, setFilter } = useUrlFilters({
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');

  const params = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const report = useQuery({
    queryKey: ['report', 'iva', dateFrom, dateTo],
    queryFn: () => getIvaReport(params),
  });

  const data = report.data;
  // Balance > 0 → a pagar (débito > crédito). < 0 → a favor del contribuyente.
  const balanceN = data ? Number(data.balance) : 0;

  const [tab, setTab] = useState<'ventas' | 'compras'>('ventas');

  // Cambiar de pestaña reinicia a la primera página.
  function changeTab(next: 'ventas' | 'compras') {
    setTab(next);
    setFilter('page', null);
  }

  // Paginación cliente sobre la pestaña activa (el reporte trae todo).
  const salesRows = data?.salesRows ?? [];
  const purchaseRows = data?.purchaseRows ?? [];
  const activeRows = tab === 'ventas' ? salesRows : purchaseRows;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedSales =
    tab === 'ventas' ? salesRows.slice(start, start + PAGE_SIZE) : [];
  const pagedPurchases =
    tab === 'compras' ? purchaseRows.slice(start, start + PAGE_SIZE) : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-slate-800 dark:text-slate-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Reporte de IVA
          </h1>
          <p className="mt-1 max-w-[70ch] text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            IVA débito (ventas) vs. IVA crédito (compras). Las ventas canceladas
            no se contabilizan.
          </p>
        </div>

        <a
          href={ivaReportCsvUrl(params)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90"
        >
          <Download className="h-4 w-4" />
          Descargar CSV
        </a>
      </div>

      {/* FILTROS */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:gap-4 dark:border-slate-850 dark:bg-[#11151C]">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Desde
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setFilter('dateFrom', e.target.value || null);
              setFilter('page', null);
            }}
            className={FIELD}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Hasta
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setFilter('dateTo', e.target.value || null);
              setFilter('page', null);
            }}
            className={FIELD}
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setFilter('dateFrom', null);
              setFilter('dateTo', null);
              setFilter('page', null);
            }}
            className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:ml-auto"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            icon={<Receipt className="h-3.5 w-3.5" />}
            label="IVA débito (ventas)"
            value={formatCurrency(data.debit)}
          />
          <KpiCard
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            label="IVA crédito (compras)"
            value={formatCurrency(data.credit)}
          />
          <KpiCard
            label={balanceN >= 0 ? 'A pagar' : 'A favor'}
            value={formatCurrency(Math.abs(balanceN).toFixed(2))}
            tone={balanceN >= 0 ? 'danger' : 'positive'}
          />
          <KpiCard
            icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
            label="Documentos"
            value={`${data.salesRows.length} v / ${data.purchaseRows.length} c`}
          />
        </div>
      )}

      {/* TABS */}
      <div className="flex items-center gap-2">
        <TabPill
          active={tab === 'ventas'}
          onClick={() => changeTab('ventas')}
          count={data?.salesRows.length ?? 0}
        >
          Ventas
        </TabPill>
        <TabPill
          active={tab === 'compras'}
          onClick={() => changeTab('compras')}
          count={data?.purchaseRows.length ?? 0}
        >
          Compras
        </TabPill>
      </div>

      {/* TABLA */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          {tab === 'ventas' ? (
            <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                  <th className="py-4 pl-6">N° venta</th>
                  <th className="py-4">Fecha</th>
                  <th className="py-4">Cliente</th>
                  <th className="py-4">RUT</th>
                  <th className="py-4 text-right">Subtotal</th>
                  <th className="py-4 text-right">IVA</th>
                  <th className="py-4 pr-6 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {report.isLoading && <SkeletonRows cols={7} />}
                {!report.isLoading && (data?.salesRows.length ?? 0) === 0 && (
                  <EmptyRow cols={7} label="No hay ventas en el período." />
                )}
                {pagedSales.map((r) => (
                  <tr
                    key={r.id}
                    className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10 ${
                      r.isReturn ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''
                    }`}
                  >
                    <td className="py-4 pl-6 font-mono text-[11.5px] font-bold text-slate-900 dark:text-white">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {r.number}
                        {r.isReturn && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                            Nota de crédito
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-4 font-medium text-slate-500 dark:text-slate-400">
                      {new Date(r.date).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })}
                    </td>
                    <td className="max-w-[200px] truncate py-4 font-bold text-slate-800 dark:text-slate-100">
                      {r.customerName}
                    </td>
                    <td className="py-4 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      {r.customerTaxId ?? '—'}
                    </td>
                    <td className="py-4 text-right font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                      {formatCurrency(r.subtotal)}
                    </td>
                    <td className="py-4 text-right font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                      {formatCurrency(r.taxAmount)}
                    </td>
                    <td className="py-4 pr-6 text-right font-mono text-[13px] font-black tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                  <th className="py-4 pl-6">Fecha</th>
                  <th className="py-4">Proveedor</th>
                  <th className="py-4">RUT</th>
                  <th className="py-4 text-right">Subtotal</th>
                  <th className="py-4 text-right">IVA</th>
                  <th className="py-4 pr-6 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {report.isLoading && <SkeletonRows cols={6} />}
                {!report.isLoading &&
                  (data?.purchaseRows.length ?? 0) === 0 && (
                    <EmptyRow cols={6} label="No hay compras en el período." />
                  )}
                {pagedPurchases.map((r) => (
                  <tr
                    key={r.id}
                    className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10 ${
                      r.isReturn ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''
                    }`}
                  >
                    <td className="py-4 pl-6 font-medium text-slate-500 dark:text-slate-400">
                      {new Date(r.date).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })}
                    </td>
                    <td className="max-w-[220px] truncate py-4 font-bold text-slate-800 dark:text-slate-100">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {r.supplierName}
                        {r.isReturn && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                            Nota de crédito
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-4 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      {r.supplierTaxId ?? '—'}
                    </td>
                    <td className="py-4 text-right font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                      {formatCurrency(r.subtotal)}
                    </td>
                    <td className="py-4 text-right font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                      {formatCurrency(r.taxAmount)}
                    </td>
                    <td className="py-4 pr-6 text-right font-mono text-[13px] font-black tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!report.isLoading && (
          <TablePagination
            page={currentPage}
            totalPages={totalPages}
            total={activeRows.length}
            shown={tab === 'ventas' ? pagedSales.length : pagedPurchases.length}
            noun={tab === 'ventas' ? 'ventas' : 'compras'}
            nounSingular={tab === 'ventas' ? 'venta' : 'compra'}
            onPageChange={(n) => setFilter('page', String(n))}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   HELPERS DE TABLA
   ============================================================ */
function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={cols} className="px-6 py-5">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </td>
        </tr>
      ))}
    </>
  );
}

function EmptyRow({ cols, label }: { cols: number; label: string }) {
  return (
    <tr>
      <td colSpan={cols}>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Receipt className="h-5 w-5" />
          </div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {label}
          </p>
        </div>
      </td>
    </tr>
  );
}

/* ============================================================
   KPI CARD
   ============================================================ */
function KpiCard({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'positive';
}) {
  return (
    <div className="select-none space-y-1.5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'text-[22px] font-black tracking-tight tabular-nums',
          tone === 'danger'
            ? 'text-rose-500'
            : tone === 'positive'
              ? 'text-emerald-500'
              : 'text-slate-900 dark:text-white',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   TAB PILL
   ============================================================ */
function TabPill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-[11.5px] font-bold transition-all',
        active
          ? 'bg-[#2F6BFF] text-white shadow-md'
          : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-850 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {children}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
          active
            ? 'bg-slate-800 text-white dark:bg-slate-300 dark:text-slate-900'
            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
        )}
      >
        {count}
      </span>
    </button>
  );
}
