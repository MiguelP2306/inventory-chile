'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QuickOpFromSaleDialog } from '@/components/quick-op-from-sale-dialog';
import { WarrantyStatusBadge } from '@/components/warranty-status-badge';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarrantyClaims } from '@/lib/warranties-api';
import type { WarrantyStatusDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: WarrantyStatusDto; label: string }[] = [
  { value: 'OPEN', label: 'Abierto' },
  { value: 'IN_REVIEW', label: 'En revisión' },
  { value: 'APPROVED', label: 'Aprobado' },
  { value: 'REJECTED', label: 'Rechazado' },
  { value: 'RESOLVED', label: 'Resuelto' },
];

const FIELD =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white';

/**
 * /garantias — Rediseño UI (look de la web). SOLO UI/UX. Lógica idéntica:
 * filtros URL + debounce, listWarrantyClaims paginado, QuickOpFromSaleDialog.
 */
export default function GarantiasPage() {
  const filters = useUrlFilters({ status: '', q: '', dateFrom: '', dateTo: '', page: '' });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });

  const status = values.status || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const filtersActive = status !== ALL || dateFrom !== '' || dateTo !== '' || search.value !== '';

  const list = useQuery({
    queryKey: ['warranty-claims', { status, debouncedQ, dateFrom, dateTo, page }],
    queryFn: () =>
      listWarrantyClaims({
        status: status === ALL ? undefined : (status as WarrantyStatusDto),
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

  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Reclamos de garantía
          </h1>
          <p className="mt-1 max-w-2xl text-xs font-medium text-slate-500 dark:text-slate-400">
            Seguimiento de reclamos sobre productos vendidos. No afectan stock — si la resolución
            implica cambio o reembolso, se hace una devolución aparte.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {filtersActive && (
            <button
              onClick={clear}
              className="cursor-pointer rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Limpiar filtros
            </button>
          )}
          <button
            onClick={() => setQuickOpen(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva garantía</span>
          </button>
        </div>
      </div>

      <QuickOpFromSaleDialog action="warranty" open={quickOpen} onOpenChange={setQuickOpen} />

      {/* FILTROS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar nº, producto, cliente…"
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
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Número</th>
                <th className="py-4">Abierto</th>
                <th className="py-4">Producto</th>
                <th className="py-4">Cliente</th>
                <th className="py-4">Venta</th>
                <th className="py-4 pl-8">Estado</th>
                <th className="w-[60px] py-4 pr-6 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center font-bold text-slate-400">
                    Ningún reclamo coincide con la búsqueda o filtros.
                  </td>
                </tr>
              )}

              {items.map((w) => (
                <tr
                  key={w.id}
                  onClick={() => {
                    window.location.href = `/garantias/${w.id}`;
                  }}
                  className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                >
                  <td className="py-5 pl-6 font-mono font-bold text-slate-900 dark:text-white">
                    <Link href={`/garantias/${w.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {w.number}
                    </Link>
                  </td>
                  <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                    {new Date(w.openedAt).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                  </td>
                  <td className="max-w-[240px] truncate py-5 font-bold text-slate-950 dark:text-white">
                    {w.product?.name ?? '—'}
                  </td>
                  <td className="max-w-[180px] truncate py-5 font-medium text-slate-600 dark:text-slate-400">
                    {w.customer?.name ?? '—'}
                  </td>
                  <td className="py-5 font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                    {w.sale?.number ?? '—'}
                  </td>
                  <td className="py-5 pl-8">
                    <WarrantyStatusBadge status={w.status} />
                  </td>
                  <td className="py-5 pr-6 text-right">
                    <Link
                      href={`/garantias/${w.id}`}
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
          {total} reclamo{total === 1 ? '' : 's'}
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
    </div>
  );
}
