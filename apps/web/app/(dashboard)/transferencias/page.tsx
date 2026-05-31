'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { listTransfers } from '@/lib/transfers-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarehouses } from '@/lib/warehouses-api';
import type { TransferStatusDto, WarehouseDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: TransferStatusDto; label: string }[] = [
  { value: 'COMPLETED', label: 'Completada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

/**
 * /transferencias — Rediseño UI (look de TransferList).
 *
 * SOLO UI/UX. La lógica es idéntica a la versión previa:
 *  · useUrlFilters (status, from, to, q, dateFrom, dateTo, page).
 *  · useDebouncedUrlFilter para el search.
 *  · listWarehouses('all') para poblar Origen/Destino (incluye inactivas).
 *  · listTransfers con todos los filtros + paginación server-side.
 *
 * Cambios visuales: Tailwind puro, grid de filtros redondeados, tabla en
 * "sheet" rounded-3xl con filas clickeables, badges de estado y footer de
 * paginación. El badge de estado se pinta inline (emerald/rose) para calzar
 * con el mock — si preferís reusar <TransferStatusBadge>, avisame.
 */
export default function TransferenciasPage() {
  const filters = useUrlFilters({
    status: '',
    from: '',
    to: '',
    q: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });

  const status = values.status || ALL;
  const fromW = values.from || ALL;
  const toW = values.to || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const filtersActive =
    status !== ALL ||
    fromW !== ALL ||
    toW !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    search.value !== '';

  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses(),
  });
  const warehouseList = (Array.isArray(warehouses.data)
    ? warehouses.data
    : warehouses.data?.items ?? []) as WarehouseDto[];

  const list = useQuery({
    queryKey: ['transfers', { status, fromW, toW, debouncedQ, dateFrom, dateTo, page }],
    queryFn: () =>
      listTransfers({
        status: status === ALL ? undefined : (status as TransferStatusDto),
        fromWarehouseId: fromW === ALL ? undefined : fromW,
        toWarehouseId: toW === ALL ? undefined : toW,
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

  const fieldCls =
    'w-full text-xs font-semibold px-3 py-3 bg-white dark:bg-[#11151C] text-slate-700 dark:text-white border border-slate-200 dark:border-slate-850 rounded-2xl focus:outline-none focus:border-[#2F6BFF] transition-all';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Transferencias entre bodegas
        </h1>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {filtersActive && (
            <button
              onClick={clear}
              className="cursor-pointer rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Limpiar filtros
            </button>
          )}
          <Link
            href="/transferencias/nueva"
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva transferencia</span>
          </Link>
        </div>
      </div>

      {/* ============================================================
          FILTROS
          ============================================================ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <input
          type="text"
          placeholder="Buscar (número o bodega)"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-medium text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
        />
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
        <select
          value={fromW}
          onChange={(e) => {
            setFilter('from', e.target.value === ALL ? null : e.target.value);
            setFilter('page', null);
          }}
          className={fieldCls}
        >
          <option value={ALL}>Todos los orígenes</option>
          {warehouseList.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {!w.isActive ? ' (inactiva)' : ''}
            </option>
          ))}
        </select>
        <select
          value={toW}
          onChange={(e) => {
            setFilter('to', e.target.value === ALL ? null : e.target.value);
            setFilter('page', null);
          }}
          className={fieldCls}
        >
          <option value={ALL}>Todos los destinos</option>
          {warehouseList.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {!w.isActive ? ' (inactiva)' : ''}
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
          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setFilter('dateTo', e.target.value || null);
            setFilter('page', null);
          }}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
        />
      </div>

      {/* ============================================================
          TABLA
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Número</th>
                <th className="py-4">Fecha</th>
                <th className="py-4">Origen → Destino</th>
                <th className="py-4">Items</th>
                <th className="py-4 text-left">Estado</th>
                <th className="w-[60px] py-4 pr-6 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center font-bold text-slate-400">
                    Ninguna transferencia coincide con los criterios de búsqueda o filtros.
                  </td>
                </tr>
              )}

              {items.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => {
                    window.location.href = `/transferencias/${t.id}`;
                  }}
                  className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                >
                  <td className="py-5 pl-6 font-mono font-medium text-slate-900 dark:text-white">
                    <Link
                      href={`/transferencias/${t.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {t.number}
                    </Link>
                  </td>
                  <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                    {new Date(t.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                  </td>
                  <td className="py-5">
                    <span className="font-bold text-slate-950 dark:text-slate-100">
                      {t.fromWarehouse?.name ?? '—'}
                    </span>{' '}
                    <span className="mx-1 font-mono font-medium text-slate-400">→</span>{' '}
                    <span className="font-bold text-slate-950 dark:text-slate-100">
                      {t.toWarehouse?.name ?? '—'}
                    </span>
                  </td>
                  <td className="py-5 pl-1 font-mono font-semibold text-slate-600 dark:text-slate-400">
                    {t.items?.length ?? 0}
                  </td>
                  <td className="py-5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-5 pr-6 text-right">
                    <Link
                      href={`/transferencias/${t.id}`}
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

      {/* ============================================================
          PAGINACIÓN
          ============================================================ */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-400 dark:text-slate-500">
        <div>
          {total} transferencia{total === 1 ? '' : 's'}
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

/* Badge de estado inline (emerald = Completada, rose = Cancelada). */
function StatusBadge({ status }: { status: TransferStatusDto }) {
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
        Cancelada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
      Completada
    </span>
  );
}
