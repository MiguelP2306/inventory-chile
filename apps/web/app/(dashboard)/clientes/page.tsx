'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Eye, FileSpreadsheet, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { apiAbsoluteUrl } from '@/lib/api';
import { listCustomersPaginated } from '@/lib/customers-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatPhonePretty } from '@/lib/validators/phone';
import { formatRutPretty } from '@/lib/validators/rut';

const PAGE_SIZE = 20;

/**
 * /clientes — Rediseño UI (look de TransferList / Stock).
 *
 * SOLO UI/UX. La lógica es idéntica a la versión previa:
 *  · useUrlFilters (q, page) + useDebouncedUrlFilter para el search.
 *  · listCustomersPaginated con q + paginación server-side.
 *  · Export Excel respetando el search (apiAbsoluteUrl).
 *
 * Cambios visuales: header font-black, search redondeado con ícono, tabla en
 * "sheet" rounded-3xl con filas clickeables, badge de lifecycle y footer de
 * paginación. Acento azul #2F6BFF.
 */
export default function ClientesPage() {
  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const list = useQuery({
    queryKey: ['customers', { q: debouncedQ, page }],
    queryFn: () =>
      listCustomersPaginated({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Clientes
        </h1>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <a
            href={apiAbsoluteUrl(
              `customers/export.xlsx${
                debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ''
              }`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Download className="h-4 w-4 text-slate-400" />
            <span>Exportar Excel</span>
          </a>
          <Link
            href="/clientes/importar"
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
            <span>Importar Excel</span>
          </Link>
          <Link
            href="/clientes/nuevo"
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo cliente</span>
          </Link>
        </div>
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="relative max-w-[480px]">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          placeholder="Buscar por nombre, RUT, email o teléfono…"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-medium text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
        />
      </div>

      {/* ============================================================
          TABLA
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Nombre</th>
                <th className="py-4">RUT</th>
                <th className="py-4">Email</th>
                <th className="py-4">Teléfono</th>
                <th className="py-4">Comuna</th>
                <th className="py-4">Estado</th>
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
                    Ningún cliente coincide con la búsqueda.
                  </td>
                </tr>
              )}

              {items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => {
                    window.location.href = `/clientes/${c.id}`;
                  }}
                  className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                >
                  <td className="py-5 pl-6 font-bold text-slate-950 transition-colors group-hover:text-[#2F6BFF] dark:text-white">
                    <Link
                      href={`/clientes/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-5 font-mono text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
                    {c.taxId ? formatRutPretty(c.taxId) : '—'}
                  </td>
                  <td className="py-5 font-medium text-slate-600 dark:text-slate-400">
                    {c.email ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="py-5 font-medium text-slate-600 dark:text-slate-400">
                    {c.phone ? formatPhonePretty(c.phone) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="py-5 font-medium text-slate-600 dark:text-slate-400">
                    {c.commune?.name ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="py-5">
                    <LifecycleBadge status={c.lifecycleStatus} />
                  </td>
                  <td className="py-5 pr-6 text-right">
                    <Link
                      href={`/clientes/${c.id}`}
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
          {total} cliente{total === 1 ? '' : 's'}
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
