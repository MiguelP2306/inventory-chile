'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileClock, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { deleteSaleDraft, listSaleDrafts } from '@/lib/sales-api';

/**
 * Ventas parkeadas pendientes de retomar.
 *
 * Se muestra arriba del listado de ventas y sólo cuando hay borradores: si no
 * hay ninguno, no ocupa espacio ni distrae.
 *
 * Los borradores son del negocio, no del vendedor — cualquiera puede retomar o
 * descartar uno. Por eso el panel muestra quién lo dejó y cuándo.
 */
export function SaleDraftsPanel() {
  const qc = useQueryClient();
  const drafts = useQuery({
    queryKey: ['sale-drafts'],
    queryFn: listSaleDrafts,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteSaleDraft(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sale-drafts'] });
      toast.success('Borrador descartado');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'No se pudo descartar')),
  });

  const items = drafts.data ?? [];
  if (items.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <FileClock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Ventas sin terminar ({items.length})
        </h2>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#11151C]"
          >
            <Link
              href={`/ventas/nueva?draft=${d.id}`}
              className="min-w-0 flex-1"
            >
              <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                {d.label || d.customer?.name || 'Venta sin cliente'}
              </p>
              <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {formatCurrency(d.total)}
                {' · '}
                {new Date(d.updatedAt).toLocaleString('es-CL', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {d.updatedBy ? ` · ${d.updatedBy.name}` : ''}
              </p>
            </Link>
            <button
              type="button"
              title="Descartar borrador"
              aria-label={`Descartar borrador ${d.label ?? ''}`}
              disabled={removeMut.isPending}
              onClick={() => {
                if (
                  !confirm(
                    '¿Descartar este borrador? No se puede deshacer. No afecta stock ni caja.',
                  )
                ) {
                  return;
                }
                removeMut.mutate(d.id);
              }}
              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-rose-950/40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
