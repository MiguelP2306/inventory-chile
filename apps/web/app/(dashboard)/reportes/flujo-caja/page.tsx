'use client';

/* ============================================================================
 *  ReporteFlujoCajaPage — REESTILIZADO con el sistema visual del rediseño
 *  (Inventario / Caja / Gastos). Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · useUrlFilters({ dateFrom, dateTo }) → query params persistentes.
 *   · getCashFlowReport(params) + cashFlowReportCsvUrl(params) para el CSV.
 *   · SOURCE_LABEL / METHOD_LABEL idénticos.
 *   · Anuladas (isVoided): opacity + line-through y sufijo "(anulada)".
 *   · Signo + (ingreso) / − (egreso) y colores emerald / rose.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Wallet,
} from 'lucide-react';
import { TablePagination } from '@/components/table-pagination';
import { formatCurrency } from '@/lib/format';
import { cashFlowReportCsvUrl, getCashFlowReport } from '@/lib/reports-api';
import { cn } from '@/lib/utils';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 50;

const SOURCE_LABEL: Record<string, string> = {
  SALE: 'Venta',
  PURCHASE: 'Compra',
  MANUAL: 'Manual',
  SALE_RETURN: 'Devolución venta',
  PURCHASE_RETURN: 'Devolución compra',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

const FIELD =
  'w-44 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-850 dark:bg-[#11151C] dark:text-white';

export default function ReporteFlujoCajaPage() {
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
    queryKey: ['report', 'cash-flow', dateFrom, dateTo],
    queryFn: () => getCashFlowReport(params),
  });

  const data = report.data;
  const rows = data?.rows ?? [];
  const netN = data ? Number(data.net) : 0;

  // Paginación cliente — el reporte devuelve todos los movimientos del período.
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
            Flujo de caja
          </h1>
          <p className="mt-1 max-w-[70ch] text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            Ingresos vs. egresos del período. Incluye ventas (ingreso), compras
            (egreso), devoluciones y movimientos manuales.
          </p>
        </div>

        <a
          href={cashFlowReportCsvUrl(params)}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            label="Total ingresos"
            value={formatCurrency(data.totalIncome)}
            tone="positive"
          />
          <KpiCard
            icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
            label="Total egresos"
            value={formatCurrency(data.totalExpense)}
            tone="danger"
          />
          <KpiCard
            icon={<Wallet className="h-3.5 w-3.5" />}
            label={netN >= 0 ? 'Saldo neto' : 'Saldo neto (negativo)'}
            value={formatCurrency(data.net)}
            tone={netN >= 0 ? 'positive' : 'danger'}
          />
        </div>
      )}

      {/* TABLA */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Fecha</th>
                <th className="py-4">Tipo</th>
                <th className="py-4">Origen</th>
                <th className="py-4">Método</th>
                <th className="py-4">Descripción</th>
                <th className="py-4 pr-6 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {report.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!report.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <Wallet className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        No hay movimientos en el período
                      </p>
                      <p className="max-w-[40ch] text-xs font-medium text-slate-400">
                        Ajustá el rango de fechas para ver resultados.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {pagedRows.map((r) => {
                const voided = r.isVoided;
                const income = r.type === 'INCOME';
                const sign = income ? '+' : '−';
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      'transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10',
                      voided && 'opacity-55',
                    )}
                  >
                    <td className="py-4 pl-6 font-medium text-slate-500 dark:text-slate-400">
                      {new Date(r.date).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })}
                    </td>
                    <td className="py-4">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider',
                          income
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400',
                        )}
                      >
                        {income ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownLeft className="h-3 w-3" />
                        )}
                        {income ? 'Ingreso' : 'Egreso'}
                      </span>
                    </td>
                    <td className="py-4 font-semibold text-slate-600 dark:text-slate-300">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </td>
                    <td className="py-4 font-medium text-slate-500 dark:text-slate-400">
                      {METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}
                    </td>
                    <td
                      className={cn(
                        'max-w-[280px] truncate py-4 font-medium text-slate-600 dark:text-slate-300',
                        voided && 'line-through',
                      )}
                    >
                      {r.description}
                      {voided && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          (anulada)
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'py-4 pr-6 text-right font-mono text-[13px] font-black tabular-nums',
                        income
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-500 dark:text-rose-400',
                        voided && 'line-through',
                      )}
                    >
                      {sign}
                      {formatCurrency(r.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!report.isLoading && (
          <TablePagination
            page={currentPage}
            totalPages={totalPages}
            total={rows.length}
            shown={pagedRows.length}
            noun="movimientos"
            nounSingular="movimiento"
            onPageChange={(n) => setFilter('page', String(n))}
          />
        )}
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
