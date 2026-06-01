'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/format';
import { listPurchases } from '@/lib/inventory-api';
import type { PurchaseEntryDto } from '@inventory/shared';

interface Props {
  onPick: (purchase: PurchaseEntryDto) => void;
}

const PAGE_SIZE = 4;

/**
 * Combobox de búsqueda de compras para "Nueva devolución a proveedor".
 *
 * Rediseño: siempre muestra una lista paginada (4 por página) para que el
 * operador vea compras sin tener que escribir. El buscador filtra por
 * proveedor (nombre/RUT) o notas (debounce 250ms) y resetea a la primera
 * página.
 */
export function PurchaseSearchCombobox({ onPick }: Props) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const results = useQuery({
    queryKey: ['purchases-search', { q: debouncedQ, page }],
    queryFn: () =>
      listPurchases({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = results.data?.items ?? [];
  const total = results.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por proveedor (nombre o RUT) o notas"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-xs font-semibold text-slate-800 transition-all placeholder:text-slate-400 placeholder:font-medium focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {/* Resultados */}
      <div className="space-y-2">
        {results.isLoading
          ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="h-[58px] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))
          : items.length === 0
            ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-6 text-center text-xs font-semibold text-slate-400 dark:border-slate-850 dark:bg-slate-900/20">
                  {debouncedQ ? 'Sin resultados para tu búsqueda.' : 'No hay compras registradas.'}
                </div>
              )
            : items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left transition-all hover:border-[#2F6BFF]/40 hover:bg-[#2F6BFF]/5 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-900/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {p.supplier?.name ?? '—'}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">
                      {p.supplier?.taxId ?? 'sin RUT'} ·{' '}
                      {new Date(p.date).toLocaleDateString('es-CL')}
                      {p.warehouse?.name ? ` · ${p.warehouse.name}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(p.total)}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {p.items?.length ?? 0} ítem{(p.items?.length ?? 0) === 1 ? '' : 's'}
                    </div>
                  </div>
                </button>
              ))}
      </div>

      {/* Paginación (Anterior / Siguiente) */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || results.isFetching}
            className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-1.5 text-[11px] font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || results.isFetching}
            className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-1.5 text-[11px] font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
