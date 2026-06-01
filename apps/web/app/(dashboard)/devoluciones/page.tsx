'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QuickOpFromSaleDialog } from '@/components/quick-op-from-sale-dialog';
import { ReturnStatusBadge, ReturnTypeBadge } from '@/components/return-status-badge';
import { formatCurrency } from '@/lib/format';
import { listReturns } from '@/lib/returns-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { ReturnStatusDto, ReturnTypeDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const FIELD =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white';

/**
 * /devoluciones — Rediseño UI (look de la web). SOLO UI/UX. Lógica idéntica:
 * filtros URL + debounce, listReturns paginado, QuickOpFromSaleDialog.
 */
export default function DevolucionesPage() {
  const filters = useUrlFilters({ type: '', status: '', q: '', dateFrom: '', dateTo: '', page: '' });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });

  const type = values.type || ALL;
  const status = values.status || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const filtersActive =
    type !== ALL || status !== ALL || dateFrom !== '' || dateTo !== '' || search.value !== '';

  const list = useQuery({
    queryKey: ['returns', { type, status, debouncedQ, dateFrom, dateTo, page }],
    queryFn: () =>
      listReturns({
        type: type === ALL ? undefined : (type as ReturnTypeDto),
        status: status === ALL ? undefined : (status as ReturnStatusDto),
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
            Devoluciones
          </h1>
          <p className="mt-1 max-w-2xl text-xs font-medium text-slate-500 dark:text-slate-400">
            Devoluciones de clientes (RETURN_IN al stock) y devoluciones a proveedores (RETURN_OUT).
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
            <span>Nueva devolución</span>
          </button>
        </div>
      </div>

      <QuickOpFromSaleDialog action="return" open={quickOpen} onOpenChange={setQuickOpen} />

      {/* FILTROS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar nº, motivo…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-medium text-slate-700 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
          />
        </div>
        <select
          value={type}
          onChange={(e) => {
            setFilter('type', e.target.value === ALL ? null : e.target.value);
            setFilter('page', null);
          }}
          className={FIELD}
        >
          <option value={ALL}>Todos los tipos</option>
          <option value="CUSTOMER">De cliente</option>
          <option value="SUPPLIER">A proveedor</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setFilter('status', e.target.value === ALL ? null : e.target.value);
            setFilter('page', null);
          }}
          className={FIELD}
        >
          <option value={ALL}>Todos los estados</option>
          <option value="COMPLETED">Completada</option>
          <option value="CANCELLED">Cancelada</option>
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
          <table className="w-full min-w-[760px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Número</th>
                <th className="py-4">Fecha</th>
                <th className="py-4">Tipo</th>
                <th className="py-4">Origen</th>
                <th className="py-4 text-right">Reembolso</th>
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
                    Ninguna devolución coincide con la búsqueda o filtros.
                  </td>
                </tr>
              )}

              {items.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    window.location.href = `/devoluciones/${r.id}`;
                  }}
                  className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                >
                  <td className="py-5 pl-6 font-mono font-bold text-slate-900 dark:text-white">
                    <Link href={`/devoluciones/${r.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                    {new Date(r.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                  </td>
                  <td className="py-5">
                    <ReturnTypeBadge type={r.type} />
                  </td>
                  <td className="py-5 font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
                    {r.type === 'CUSTOMER' ? r.sale?.number ?? '—' : '—'}
                  </td>
                  <td className="py-5 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                    {formatCurrency(r.refundAmount)}
                  </td>
                  <td className="py-5 pl-8">
                    <ReturnStatusBadge status={r.status} />
                  </td>
                  <td className="py-5 pr-6 text-right">
                    <Link
                      href={`/devoluciones/${r.id}`}
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
          {total} devoluci{total === 1 ? 'ón' : 'ones'}
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
