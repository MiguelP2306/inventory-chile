'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Pencil, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { QuotationFormDialog } from '@/components/forms/quotation-form-dialog';
import { QuotationStatusBadge } from '@/components/quotation-status-badge';
import { apiAbsoluteUrl } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { listQuotations } from '@/lib/quotations-api';
import {
  bagLineKey,
  clearProductBagItems,
  useProductBag,
} from '@/lib/use-product-bag';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { QuotationStatusDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: QuotationStatusDto; label: string }[] = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SENT', label: 'Enviada' },
  { value: 'APPROVED', label: 'Aprobada' },
  { value: 'REJECTED', label: 'Rechazada' },
  { value: 'CONVERTED', label: 'Convertida' },
  { value: 'EXPIRED', label: 'Vencida' },
];

/**
 * /cotizaciones — Rediseño UI (look Movimientos / Stock / Transferencias).
 *
 * SOLO UI/UX. La lógica es idéntica:
 *  · useUrlFilters (status, q, dateFrom, dateTo, page) + debounce del search.
 *  · listQuotations con filtros + paginación server-side.
 *  · Export Excel respetando filtros.
 *  · ?new=1 / ?fromBag=1 abren el modal con prefill del bolso.
 *
 * Cambios visuales: header font-black, search acotado con ícono, filtros
 * redondeados, tabla en "sheet" rounded-3xl con filas clickeables, badges de
 * estado y footer de paginación. Acento azul #2F6BFF.
 */
export default function CotizacionesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const filters = useUrlFilters({
    status: '',
    q: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const status = values.status || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');

  const debouncedQ = (values.q ?? '').trim();

  const filtersActive =
    status !== ALL || dateFrom !== '' || dateTo !== '' || search.value !== '';

  const list = useQuery({
    queryKey: ['quotations', { status, q: debouncedQ, dateFrom, dateTo, page }],
    queryFn: () =>
      listQuotations({
        status: status === ALL ? undefined : (status as QuotationStatusDto),
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
  // Si llegamos con ?fromBag=1, el modal se abre con los items del bolso ya
  // cargados. Limpiamos el bolso solo cuando la cotización se guarda exitosamente.
  const [bagPrefillActive, setBagPrefillActive] = useState(false);
  // IDs seleccionados en el bolso (null = todos, por compatibilidad). Se captura
  // en el montaje porque enseguida limpiamos los query params de la URL.
  const [bagIds, setBagIds] = useState<string[] | null>(null);
  const bag = useProductBag();

  // ?new=1 abre el modal automáticamente y limpia el query param.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDialogOpen(true);
      if (searchParams.get('fromBag') === '1' && bag.items.length > 0) {
        setBagPrefillActive(true);
        const idsParam = searchParams.get('bagIds');
        setBagIds(
          idsParam ? idsParam.split(',').map(decodeURIComponent) : null,
        );
      }
      const next = new URLSearchParams(searchParams.toString());
      next.delete('new');
      next.delete('fromBag');
      next.delete('bagIds');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Productos del bolso a precargar, acotados a la selección si la hubo.
  const bagPrefillItems = bagPrefillActive
    ? bagIds
      ? bag.items.filter((it) => bagIds.includes(bagLineKey(it)))
      : bag.items
    : [];

  const fieldCls =
    'w-full text-xs font-semibold px-3 py-3 bg-white dark:bg-[#11151C] text-slate-700 dark:text-white border border-slate-200 dark:border-slate-850 rounded-2xl focus:outline-none focus:border-[#2F6BFF] transition-all';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Cotizaciones
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
              `quotations/export.xlsx${buildQuotationsExportQuery({
                status: status === ALL ? undefined : status,
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
            <span>Nueva cotización</span>
          </button>
        </div>
      </div>

      {/* ============================================================
          FILTROS
          ============================================================ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
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
          className={fieldCls}
        >
          <option value={ALL}>Todos los estados</option>
          {STATUS_OPTIONS.map((o) => (
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
          className={fieldCls}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setFilter('dateTo', e.target.value || null);
            setFilter('page', null);
          }}
          className={fieldCls}
        />
      </div>

      {/* ============================================================
          TABLA
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Número</th>
                <th className="py-4">Fecha</th>
                <th className="py-4">Cliente</th>
                <th className="py-4 text-right">Items</th>
                <th className="py-4 text-right">Total</th>
                <th className="py-4 pl-8">Estado</th>
                <th className="py-4">Vence</th>
                <th className="w-[90px] py-4 pr-6 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center font-bold text-slate-400">
                    Ninguna cotización coincide con la búsqueda o filtros.
                  </td>
                </tr>
              )}

              {items.map((q) => {
                const editable = q.status !== 'CONVERTED' && q.status !== 'EXPIRED';
                const hasCustomer = !!q.customerView.name?.trim();
                const customerLabel = q.customerView.name?.trim() || 'Sin cliente';
                return (
                  <tr
                    key={q.id}
                    onClick={() => {
                      window.location.href = `/cotizaciones/${q.id}`;
                    }}
                    className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                  >
                    <td className="py-5 pl-6 font-mono font-bold text-slate-900 dark:text-white">
                      <Link
                        href={`/cotizaciones/${q.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {q.number}
                      </Link>
                    </td>
                    <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                      {new Date(q.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                    </td>
                    <td className="max-w-[240px] truncate py-5">
                      <span
                        className={
                          hasCustomer
                            ? 'font-bold text-slate-950 dark:text-white'
                            : 'font-medium italic text-slate-400'
                        }
                      >
                        {customerLabel}
                      </span>
                    </td>
                    <td className="py-5 text-right font-mono font-semibold text-slate-600 dark:text-slate-400">
                      {q.items?.length ?? 0}
                    </td>
                    <td className="py-5 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                      {formatCurrency(q.total)}
                    </td>
                    <td className="py-5 pl-8">
                      <QuotationStatusBadge status={q.status} />
                    </td>
                    <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                      {q.validUntil
                        ? new Date(q.validUntil).toLocaleDateString('es-CL', { dateStyle: 'short' })
                        : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="py-5 pr-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/cotizaciones/${q.id}`}
                          onClick={(e) => e.stopPropagation()}
                          title="Ver detalle"
                          className="inline-flex items-center justify-center p-2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-white"
                        >
                          <Eye className="h-[18px] w-[18px]" />
                        </Link>
                        {editable && (
                          <Link
                            href={`/cotizaciones/${q.id}?edit=1`}
                            onClick={(e) => e.stopPropagation()}
                            title="Editar"
                            className="inline-flex items-center justify-center p-2 text-slate-400 transition-colors hover:text-[#2F6BFF]"
                          >
                            <Pencil className="h-[17px] w-[17px]" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          PAGINACIÓN
          ============================================================ */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-400 dark:text-slate-500">
        <div>
          {total} cotización{total === 1 ? '' : 'es'}
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

      <QuotationFormDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          // Si el operador cierra el modal sin guardar, el bolso queda
          // intacto y el prefill se descarta.
          if (!o) setBagPrefillActive(false);
        }}
        mode="create"
        initialBagItems={
          bagPrefillItems.length > 0
            ? bagPrefillItems.map((it) => ({
                productId: it.productId,
                sku: it.sku,
                name: it.name,
                qty: it.qty,
                unitPrice: it.unitPrice,
              }))
            : undefined
        }
        onSaved={(saved) => {
          qc.invalidateQueries({ queryKey: ['quotations'] });
          if (bagPrefillActive) {
            // Quitamos del bolso SOLO las líneas (producto+bodega) cuyo producto
            // quedó en la cotización (los temporales no tienen productId).
            const savedProductIds = new Set(
              (saved.items ?? [])
                .map((it) => it.productId)
                .filter((id): id is string => !!id),
            );
            const keys = bagPrefillItems
              .filter((it) => savedProductIds.has(it.productId))
              .map(bagLineKey);
            if (keys.length > 0) clearProductBagItems(keys);
            setBagPrefillActive(false);
            setBagIds(null);
          }
        }}
      />
    </div>
  );
}

/**
 * Arma la querystring para `GET /quotations/export.xlsx` con los filtros
 * activos. Omite valores vacíos / undefined.
 */
function buildQuotationsExportQuery(
  params: Record<string, string | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
