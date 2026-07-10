'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SaleFormDialog } from '@/components/forms/sale-form-dialog';
import { SaleIncidentsBadges } from '@/components/sale-incidents-badges';
import { SaleStatusBadge } from '@/components/sale-status-badge';
import { apiAbsoluteUrl } from '@/lib/api';
import { Permission, useCan } from '@/lib/current-user-context';
import { formatCurrency } from '@/lib/format';
import { getSalesKpis, listSales } from '@/lib/sales-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type {
  PaymentMethodDto,
  SaleIncidentFilterDto,
  SaleStatusDto,
} from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: SaleStatusDto; label: string }[] = [
  { value: 'PAID', label: 'Pagada' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const METHOD_OPTIONS: { value: PaymentMethodDto; label: string }[] = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CARD_DEBIT', label: 'Débito' },
  { value: 'CARD_CREDIT', label: 'Crédito' },
  { value: 'PAYMENT_LINK', label: 'Link de pago' },
];

const INCIDENT_OPTIONS: { value: SaleIncidentFilterDto; label: string }[] = [
  { value: 'RETURN', label: 'Con devolución' },
  { value: 'EXCHANGE', label: 'Con cambio' },
  { value: 'WARRANTY', label: 'Con garantía' },
  { value: 'NONE', label: 'Sin incidencias' },
];

const FIELD =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white';
const SHEET =
  'overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const THEAD =
  'border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500';

/**
 * /ventas — Rediseño UI (look Compras / Movimientos / Cotizaciones).
 * SOLO UI/UX. Lógica idéntica: KPIs del mes, filtros URL + debounce,
 * listSales paginado, export Excel, modal Nueva venta (?new=1), y gating
 * por permiso SALE_VIEW_FINANCIAL_BREAKDOWN para método/desglose.
 */
export default function VentasPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const canSeeBreakdown = useCan(Permission.SALE_VIEW_FINANCIAL_BREAKDOWN);

  const filters = useUrlFilters({
    status: '',
    method: '',
    incident: '',
    q: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const status = values.status || ALL;
  const method = values.method || ALL;
  const incident = values.incident || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');

  const debouncedQ = (values.q ?? '').trim();
  const filtersActive =
    status !== ALL ||
    method !== ALL ||
    incident !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    search.value !== '';

  const kpis = useQuery({ queryKey: ['sales', 'kpis'], queryFn: () => getSalesKpis() });

  const list = useQuery({
    queryKey: [
      'sales',
      { status, method, incident, q: debouncedQ, dateFrom, dateTo, page },
    ],
    queryFn: () =>
      listSales({
        status: status === ALL ? undefined : (status as SaleStatusDto),
        paymentMethod: method === ALL ? undefined : (method as PaymentMethodDto),
        incident:
          incident === ALL ? undefined : (incident as SaleIncidentFilterDto),
        q: debouncedQ || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [dialogOpen, setDialogOpen] = useState(false);

  // ?new=1 abre el modal automáticamente y limpia el query param.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDialogOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('new');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Ventas
        </h1>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {filtersActive && (
            <button
              onClick={clear}
              className="cursor-pointer rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Limpiar filtros
            </button>
          )}
          <a
            href={apiAbsoluteUrl(
              `sales/export.xlsx${buildSalesExportQuery({
                status: status === ALL ? undefined : status,
                paymentMethod: method === ALL ? undefined : method,
                incident: incident === ALL ? undefined : incident,
                q: debouncedQ || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
              })}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Download className="h-4 w-4 text-slate-400" />
            <span>Exportar Excel</span>
          </a>
          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva venta</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Vendido este mes"
          value={kpis.data ? formatCurrency(kpis.data.totalAmount) : '—'}
          hint={kpis.data ? `${kpis.data.count} ${kpis.data.count === 1 ? 'venta' : 'ventas'}` : 'Cargando…'}
        />
        <KpiCard
          label="Promedio por venta"
          value={kpis.data ? formatCurrency(kpis.data.averageAmount) : '—'}
          hint="Mes actual"
        />
        <KpiCard
          label="Vendido hoy"
          value={kpis.data ? formatCurrency(kpis.data.todayAmount) : '—'}
          hint={kpis.data ? `${kpis.data.todayCount} venta(s) hoy` : 'Cargando…'}
        />
        <KpiCard
          label="Última venta"
          value={kpis.data?.lastSale ? formatCurrency(kpis.data.lastSale.total) : '—'}
          hint={
            kpis.data?.lastSale
              ? `${kpis.data.lastSale.customerName} · ${new Date(kpis.data.lastSale.date).toLocaleDateString('es-CL')}`
              : 'Sin ventas'
          }
          truncateHint
        />
      </div>

      {/* TOP productos / clientes */}
      {kpis.data &&
        (kpis.data.topProducts.length > 0 || kpis.data.topCustomers.length > 0) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={SHEET}>
              <div className="border-b border-slate-100 p-4 dark:border-slate-850">
                <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Top productos vendidos del mes
                </h2>
              </div>
              {kpis.data.topProducts.length === 0 ? (
                <div className="p-5 text-center text-xs font-semibold text-slate-400">
                  Sin ventas en el período.
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className={THEAD}>
                      <th className="py-3 pl-5">Producto</th>
                      <th className="py-3 text-right">Unidades</th>
                      <th className="py-3 pr-5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {kpis.data.topProducts.map((p) => (
                      <tr key={p.productId} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="py-3 pl-5">
                          <Link href={`/productos/${p.productId}`} className="hover:underline">
                            <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                            <div className="font-mono text-[11px] text-slate-400">{p.sku ?? '—'}</div>
                          </Link>
                        </td>
                        <td className="py-3 text-right font-mono font-semibold text-slate-600 dark:text-slate-400">
                          {p.qty}
                        </td>
                        <td className="py-3 pr-5 text-right font-mono font-black text-slate-900 dark:text-white">
                          {formatCurrency(p.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={SHEET}>
              <div className="border-b border-slate-100 p-4 dark:border-slate-850">
                <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Top clientes frecuentes del mes
                </h2>
              </div>
              {kpis.data.topCustomers.length === 0 ? (
                <div className="p-5 text-center text-xs font-semibold text-slate-400">
                  Sin ventas en el período.
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className={THEAD}>
                      <th className="py-3 pl-5">Cliente</th>
                      <th className="py-3 text-right">Ventas</th>
                      <th className="py-3 pr-5 text-right">Monto total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {kpis.data.topCustomers.map((c) => (
                      <tr key={c.customerId} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="py-3 pl-5">
                          <Link href={`/clientes/${c.customerId}`} className="hover:underline">
                            <div className="font-bold text-slate-900 dark:text-white">{c.customerName}</div>
                            <div className="font-mono text-[11px] text-slate-400">{c.customerTaxId ?? 'sin RUT'}</div>
                          </Link>
                        </td>
                        <td className="py-3 text-right font-mono font-semibold text-slate-600 dark:text-slate-400">
                          {c.salesCount}
                        </td>
                        <td className="py-3 pr-5 text-right font-mono font-black text-slate-900 dark:text-white">
                          {formatCurrency(c.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      {/* FILTROS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar nº, cliente, RUT…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-medium text-slate-700 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setFilter('status', e.target.value === ALL ? null : e.target.value);
            setFilter('page', null);
          }}
          className={FIELD}
        >
          <option value={ALL}>Todos los estados</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {canSeeBreakdown && (
          <select
            value={method}
            onChange={(e) => {
              setFilter('method', e.target.value === ALL ? null : e.target.value);
              setFilter('page', null);
            }}
            className={FIELD}
          >
            <option value={ALL}>Todos los métodos</option>
            {METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <select
          value={incident}
          onChange={(e) => {
            setFilter('incident', e.target.value === ALL ? null : e.target.value);
            setFilter('page', null);
          }}
          className={FIELD}
        >
          <option value={ALL}>Todas las incidencias</option>
          {INCIDENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setFilter('dateFrom', e.target.value || null);
            setFilter('page', null);
          }}
          className={FIELD}
        />
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

      {/* TABLA */}
      <div className={SHEET}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-left text-[12px]">
            <thead>
              <tr className={THEAD}>
                <th className="py-4 pl-6">Número</th>
                <th className="py-4">Fecha</th>
                <th className="py-4">Cliente</th>
                <th className="py-4 text-right">Items</th>
                <th className="py-4 text-right">Total</th>
                {canSeeBreakdown && <th className="py-4 pl-8">Método</th>}
                <th className="py-4 pl-8">Estado</th>
                <th className="py-4 pl-8">Incidencias</th>
                <th className="w-[60px] py-4 pr-6 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center font-bold text-slate-400">
                    Ninguna venta coincide con la búsqueda o filtros.
                  </td>
                </tr>
              )}

              {items.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => {
                    window.location.href = `/ventas/${s.id}`;
                  }}
                  className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                >
                  <td className="py-5 pl-6 font-mono font-bold text-slate-900 dark:text-white">
                    <Link href={`/ventas/${s.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {s.number}
                    </Link>
                  </td>
                  <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                    {new Date(s.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                  </td>
                  <td className="max-w-[240px] truncate py-5 font-bold text-slate-950 dark:text-white">
                    {s.customer?.name ?? <span className="font-medium text-slate-400">—</span>}
                  </td>
                  <td className="py-5 text-right font-mono font-semibold text-slate-600 dark:text-slate-400">
                    {s.items?.length ?? 0}
                  </td>
                  <td className="py-5 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                    {formatCurrency(s.total)}
                  </td>
                  {canSeeBreakdown && (
                    <td className="py-5 pl-8 font-medium text-slate-500 dark:text-slate-400">
                      {s.paymentMethod
                        ? METHOD_OPTIONS.find((o) => o.value === s.paymentMethod)?.label ?? s.paymentMethod
                        : '—'}
                    </td>
                  )}
                  <td className="py-5 pl-8">
                    <SaleStatusBadge status={s.status} />
                  </td>
                  <td className="py-5 pl-8">
                    <SaleIncidentsBadges incidents={s.incidents} />
                  </td>
                  <td className="py-5 pr-6 text-right">
                    <Link
                      href={`/ventas/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      title="Ver detalle"
                      className="inline-flex items-center justify-center p-2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-white"
                    >
                      <Eye className="h-[18px] w-[18px]" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINACIÓN */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-400 dark:text-slate-500">
        <div>
          {total} venta{total === 1 ? '' : 's'}
          {total > 0 ? ` · página ${page} de ${totalPages}` : ''}
        </div>
        {total > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Anterior
            </button>
            <button
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
              disabled={page >= totalPages}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      <SaleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['sales'] });
        }}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  truncateHint,
}: {
  label: string;
  value: string;
  hint?: string;
  truncateHint?: boolean;
}) {
  return (
    <div className="select-none space-y-1 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="block text-[20px] font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
        {value}
      </span>
      {hint && (
        <span className={`block text-[10.5px] font-bold text-slate-400 dark:text-slate-500 ${truncateHint ? 'truncate' : ''}`}>
          {hint}
        </span>
      )}
    </div>
  );
}

function buildSalesExportQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
