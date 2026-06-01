'use client';

/* ============================================================================
 *  ReporteVentasPage — REESTILIZADO con el sistema visual del rediseño
 *  (Inventario / Caja / Gastos). Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · useUrlFilters({ dateFrom, dateTo }) → query params persistentes.
 *   · getSalesReport(params) + salesReportCsvUrl(params) para el CSV.
 *   · METHOD_LABEL / STATUS_LABEL idénticos.
 *   · Canceladas: opacity + line-through y NO suman a los totales (fila final).
 *
 *  CAMBIOS DE ESTILO: título font-black, caja de filtros rounded-2xl, KPIs
 *  rounded-2xl, tabla rounded-3xl con thead uppercase, badges con punto, fila
 *  de totales destacada.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import { Calendar, Download, FileText, Receipt, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { getSalesReport, salesReportCsvUrl } from '@/lib/reports-api';
import { cn } from '@/lib/utils';
import { useUrlFilters } from '@/lib/use-url-filters';

// Ronda 9 — CARD se desdobló en débito/crédito/link de pago.
const METHOD_LABEL: Record<
  'CASH' | 'TRANSFER' | 'CARD_DEBIT' | 'CARD_CREDIT' | 'PAYMENT_LINK',
  string
> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

const STATUS_LABEL: Record<'PENDING' | 'PAID' | 'CANCELLED', string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

const FIELD =
  'w-44 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-850 dark:bg-[#11151C] dark:text-white';

export default function ReporteVentasPage() {
  const { values, setFilter } = useUrlFilters({ dateFrom: '', dateTo: '' });
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';

  const params = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const report = useQuery({
    queryKey: ['report', 'sales', dateFrom, dateTo],
    queryFn: () => getSalesReport(params),
  });

  const rows = report.data?.rows ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-slate-800 dark:text-slate-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Reporte de ventas
          </h1>
          <p className="mt-1 max-w-[70ch] text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            Detalle de cada venta del período. Las canceladas se muestran
            tachadas y no suman al total.
          </p>
        </div>

        <a
          href={salesReportCsvUrl(params)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90"
        >
          <Download className="h-4 w-4" />
          Descargar CSV
        </a>
      </div>

      {/* ============================================================
          FILTROS — rango de fechas
          ============================================================ */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:gap-4 dark:border-slate-850 dark:bg-[#11151C]">
        <div className="space-y-1.5">
          <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Desde
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setFilter('dateFrom', e.target.value || null)}
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
            onChange={(e) => setFilter('dateTo', e.target.value || null)}
            className={FIELD}
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setFilter('dateFrom', null);
              setFilter('dateTo', null);
            }}
            className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 sm:ml-auto"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* ============================================================
          KPIs
          ============================================================ */}
      {report.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            icon={<Receipt className="h-3.5 w-3.5" />}
            label="Ventas activas"
            value={report.data.countActive.toLocaleString('es-CL')}
          />
          <KpiCard
            icon={<XCircle className="h-3.5 w-3.5" />}
            label="Canceladas"
            value={report.data.countCancelled.toLocaleString('es-CL')}
            tone={report.data.countCancelled > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            icon={<FileText className="h-3.5 w-3.5" />}
            label="IVA débito"
            value={formatCurrency(report.data.totalTax)}
          />
          <KpiCard
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Total facturado"
            value={formatCurrency(report.data.totalAmount)}
            accent
          />
        </div>
      )}

      {/* ============================================================
          TABLA
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">N° venta</th>
                <th className="py-4">Fecha</th>
                <th className="py-4">Cliente</th>
                <th className="py-4">RUT</th>
                <th className="py-4">Pago</th>
                <th className="py-4 text-center">Estado</th>
                <th className="py-4 text-right">Subtotal</th>
                <th className="py-4 text-right">IVA</th>
                <th className="py-4 pr-6 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {report.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!report.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        No hay ventas en el período
                      </p>
                      <p className="max-w-[40ch] text-xs font-medium text-slate-400">
                        Ajustá el rango de fechas para ver resultados.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!report.isLoading &&
                rows.map((r) => {
                  const cancelled = r.status === 'CANCELLED';
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10',
                        cancelled && 'opacity-55',
                      )}
                    >
                      <td
                        className={cn(
                          'py-4 pl-6 font-mono text-[11.5px] font-bold text-slate-900 dark:text-white',
                          cancelled && 'line-through',
                        )}
                      >
                        {r.number}
                      </td>
                      <td className="py-4 font-medium text-slate-500 dark:text-slate-400">
                        {new Date(r.date).toLocaleDateString('es-CL', {
                          dateStyle: 'medium',
                        })}
                      </td>
                      <td
                        className={cn(
                          'max-w-[200px] truncate py-4 font-bold text-slate-800 dark:text-slate-100',
                          cancelled && 'line-through',
                        )}
                      >
                        {r.customerName}
                      </td>
                      <td className="py-4 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {r.customerTaxId ?? '—'}
                      </td>
                      <td className="py-4 font-medium text-slate-500 dark:text-slate-400">
                        {METHOD_LABEL[r.paymentMethod]}
                      </td>
                      <td className="py-4 text-center">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-4 text-right font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                        {formatCurrency(r.subtotal)}
                      </td>
                      <td className="py-4 text-right font-mono text-[12px] tabular-nums text-slate-500 dark:text-slate-400">
                        {formatCurrency(r.taxAmount)}
                      </td>
                      <td
                        className={cn(
                          'py-4 pr-6 text-right font-mono text-[13px] font-black tabular-nums text-slate-900 dark:text-white',
                          cancelled && 'line-through',
                        )}
                      >
                        {formatCurrency(r.total)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>

            {report.data && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/20">
                  <td
                    colSpan={6}
                    className="py-4 pl-6 text-right text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
                  >
                    Totales (solo activas)
                  </td>
                  <td className="py-4 text-right font-mono text-[12px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                    {formatCurrency(report.data.totalSubtotal)}
                  </td>
                  <td className="py-4 text-right font-mono text-[12px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                    {formatCurrency(report.data.totalTax)}
                  </td>
                  <td className="py-4 pr-6 text-right font-mono text-[14px] font-black tabular-nums text-[#2F6BFF]">
                    {formatCurrency(report.data.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            )}
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
  accent,
  tone = 'default',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
  tone?: 'default' | 'danger';
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
            : accent
              ? 'text-[#2F6BFF]'
              : 'text-slate-900 dark:text-white',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   STATUS BADGE
   ============================================================ */
function StatusBadge({
  status,
}: {
  status: 'PENDING' | 'PAID' | 'CANCELLED';
}) {
  const map: Record<
    'PENDING' | 'PAID' | 'CANCELLED',
    { cls: string; dot: string }
  > = {
    PAID: {
      cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400',
      dot: 'bg-emerald-500',
    },
    PENDING: {
      cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400',
      dot: 'bg-amber-500',
    },
    CANCELLED: {
      cls: 'bg-rose-50 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400',
      dot: 'bg-rose-500',
    },
  };
  const { cls, dot } = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider',
        cls,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}
