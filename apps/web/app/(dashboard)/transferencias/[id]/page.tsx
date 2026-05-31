'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CancelTransferDialog } from '@/components/forms/cancel-transfer-dialog';
import { getTransfer } from '@/lib/transfers-api';
import type { TransferStatusDto } from '@inventory/shared';

/**
 * /transferencias/[id] — Rediseño UI (look de TransferDetail).
 *
 * SOLO UI/UX. La lógica es idéntica a la versión previa:
 *  · getTransfer(id) vía useQuery.
 *  · canCancel = status !== 'CANCELLED'.
 *  · El botón "Anular" abre el <CancelTransferDialog> real (sin cambios).
 *
 * Cambios visuales: header con back redondeado + título + badge, banner de
 * cancelación, card Origen→Destino, tabla de ítems en "sheet" rounded-3xl y
 * card de notas. Badge de estado inline (emerald/rose).
 */
export default function TransferenciaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cancelOpen, setCancelOpen] = useState(false);

  const tq = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => getTransfer(id),
    enabled: !!id,
  });

  if (tq.isLoading) {
    return (
      <div className="h-40 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
    );
  }
  if (!tq.data) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 text-sm font-semibold text-slate-400 dark:border-slate-850 dark:bg-[#11151C]">
        Transferencia no encontrada.
      </div>
    );
  }

  const t = tq.data;
  const canCancel = t.status !== 'CANCELLED';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <Link
            href="/transferencias"
            title="Volver"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {t.number}
              </h1>
              <StatusBadge status={t.status} />
            </div>
            <p className="text-xs text-slate-500">
              Registrada el{' '}
              {new Date(t.date).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {t.user ? ` por ${t.user.name}` : ''}
            </p>
          </div>
        </div>

        {canCancel && (
          <button
            onClick={() => setCancelOpen(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-500 transition-colors hover:text-rose-600 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400 sm:self-auto"
          >
            <Trash2 className="h-4 w-4" />
            <span>Anular transferencia</span>
          </button>
        )}
      </div>

      {/* ============================================================
          BANNER DE CANCELACIÓN
          ============================================================ */}
      {t.status === 'CANCELLED' && (
        <div className="space-y-2 rounded-3xl border border-rose-100 bg-rose-50/50 p-5 dark:border-rose-950/20 dark:bg-rose-950/5">
          <h4 className="text-sm font-black text-rose-500">Transferencia cancelada</h4>
          {t.cancelledAt && (
            <p className="text-xs font-medium text-slate-500">
              {new Date(t.cancelledAt).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {t.cancelledBy ? ` por ${t.cancelledBy.name}` : ''}
            </p>
          )}
          {t.cancelReason && (
            <p className="mt-1 whitespace-pre-wrap text-xs font-bold text-slate-800 dark:text-slate-200">
              Motivo:{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                {t.cancelReason}
              </span>
            </p>
          )}
        </div>
      )}

      {/* ============================================================
          ORIGEN → DESTINO
          ============================================================ */}
      <div className="flex items-center justify-center rounded-3xl border border-slate-100 bg-white p-6 py-8 dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex w-full max-w-lg select-none flex-col items-center justify-between gap-1.5 text-center sm:flex-row sm:gap-6">
          <div className="flex-1 space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Origen
            </span>
            <span className="block truncate text-base font-black text-slate-900 dark:text-white">
              {t.fromWarehouse?.name ?? '—'}
            </span>
          </div>
          <div className="flex shrink-0 items-center justify-center py-2 sm:py-0">
            <span className="font-mono text-xl font-bold text-slate-300 dark:text-slate-600 sm:text-2xl">
              →
            </span>
          </div>
          <div className="flex-1 space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Destino
            </span>
            <span className="block truncate text-base font-black text-slate-900 dark:text-white">
              {t.toWarehouse?.name ?? '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================
          ÍTEMS
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="w-[20%] py-4 pl-6">SKU</th>
                <th className="py-4">Producto</th>
                <th className="w-[15%] py-4 pr-6 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {(t.items ?? []).map((it) => (
                <tr
                  key={it.id}
                  className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                >
                  <td className="py-5 pl-6 font-mono font-bold text-slate-600 dark:text-slate-400">
                    {it.product?.sku ?? '—'}
                  </td>
                  <td className="max-w-[300px] py-5 font-bold text-slate-900 dark:text-white">
                    {it.product?.name ?? '—'}
                  </td>
                  <td className="py-5 pr-6 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                    {it.qty}
                  </td>
                </tr>
              ))}
              {(t.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-10 text-center font-bold text-slate-400">
                    Sin ítems.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          NOTAS
          ============================================================ */}
      {t.notes && (
        <div className="space-y-2 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Notas adicionales
          </h4>
          <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            {t.notes}
          </p>
        </div>
      )}

      {/* Diálogo real de cancelación — sin cambios de lógica */}
      <CancelTransferDialog transfer={t} open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}

/* Badge de estado inline (emerald = Completada, rose = Cancelada). */
function StatusBadge({ status }: { status: TransferStatusDto }) {
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
        Cancelada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
      Completada
    </span>
  );
}
