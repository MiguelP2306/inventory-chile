'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CancelReturnDialog } from '@/components/forms/cancel-return-dialog';
import { ReturnStatusBadge, ReturnTypeBadge } from '@/components/return-status-badge';
import { formatCurrency } from '@/lib/format';
import { getReturn } from '@/lib/returns-api';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

const CARD =
  'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';

export default function DevolucionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cancelOpen, setCancelOpen] = useState(false);

  const rq = useQuery({
    queryKey: ['return', id],
    queryFn: () => getReturn(id),
    enabled: !!id,
  });

  if (rq.isLoading) return <div className="h-40 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  if (!rq.data) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 text-sm font-semibold text-slate-400 dark:border-slate-850 dark:bg-[#11151C]">
        Devolución no encontrada.
      </div>
    );
  }

  const r = rq.data;
  const canCancel = r.status !== 'CANCELLED';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <Link
            href="/devoluciones"
            title="Volver"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {r.number}
              </h1>
              <ReturnTypeBadge type={r.type} />
              <ReturnStatusBadge status={r.status} />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Registrada el{' '}
              {new Date(r.date).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
              {r.user ? ` por ${r.user.name}` : ''}
            </p>
          </div>
        </div>
        {canCancel && (
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-2.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-50 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400 sm:self-auto"
          >
            <Ban className="h-4 w-4" />
            Cancelar devolución
          </button>
        )}
      </div>

      {/* BANNER cancelada */}
      {r.status === 'CANCELLED' && (
        <div className="space-y-2 rounded-3xl border border-rose-100 bg-rose-50/50 p-5 dark:border-rose-950/20 dark:bg-rose-950/5">
          <h4 className="text-sm font-black text-rose-500">Devolución cancelada</h4>
          {r.cancelledAt && (
            <p className="text-xs font-medium text-slate-500">
              {new Date(r.cancelledAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
              {r.cancelledBy ? ` por ${r.cancelledBy.name}` : ''}
            </p>
          )}
          {r.cancelReason && (
            <p className="whitespace-pre-wrap text-xs font-bold text-slate-800 dark:text-slate-200">
              Motivo:{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-400">{r.cancelReason}</span>
            </p>
          )}
        </div>
      )}

      {/* ORIGEN + REEMBOLSO */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={`space-y-2 ${CARD}`}>
          <h2 className={LABEL}>Origen</h2>
          {r.type === 'CUSTOMER' && r.sale ? (
            <Link
              href={`/ventas/${r.sale.id}`}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#2F6BFF] hover:underline"
            >
              Venta {r.sale.number} <ExternalLink className="h-3 w-3" />
            </Link>
          ) : r.type === 'SUPPLIER' && r.purchaseEntry ? (
            <Link
              href="/compras"
              className="inline-flex items-center gap-1 text-xs font-bold text-[#2F6BFF] hover:underline"
            >
              Compra (ver listado) <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
        <div className={`space-y-1.5 ${CARD}`}>
          <h2 className={LABEL}>Reembolso</h2>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Monto:{' '}
            <span className="font-mono font-black tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(r.refundAmount)}
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Método:{' '}
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
            </span>
          </div>
          {r.warehouse && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Bodega:{' '}
              <span className="font-bold text-slate-700 dark:text-slate-200">{r.warehouse.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* MOTIVO */}
      <div className={`space-y-2 ${CARD}`}>
        <h2 className={LABEL}>Motivo</h2>
        <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
          {r.reason}
        </p>
        {r.notes && (
          <>
            <h3 className={`mt-3 ${LABEL}`}>Notas</h3>
            <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
              {r.notes}
            </p>
          </>
        )}
      </div>

      {/* ITEMS */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="w-[16%] py-4 pl-6">SKU</th>
                <th className="py-4">Producto</th>
                <th className="py-4 text-right">Cant.</th>
                <th className="py-4 pl-8">Estado</th>
                <th className="py-4 text-right">P. Unit</th>
                <th className="py-4 pr-6 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800/80">
              {(r.items ?? []).map((it) => (
                <tr key={it.id} className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                  <td className="py-4 pl-6 font-mono text-slate-500 dark:text-slate-400">
                    {it.product?.sku ?? '—'}
                  </td>
                  <td className="max-w-[280px] truncate py-4 font-bold text-slate-950 dark:text-white">
                    {it.product?.name ?? '—'}
                  </td>
                  <td className="py-4 text-right font-mono text-slate-700 dark:text-slate-300">{it.qty}</td>
                  <td className="py-4 pl-8">
                    {it.itemCondition === 'RESELLABLE' ? (
                      <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
                        Vendible
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
                        Dañado
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-right font-mono text-slate-500 dark:text-slate-400">
                    {formatCurrency(it.unitPrice)}
                  </td>
                  <td className="py-4 pr-6 text-right font-mono font-black text-slate-900 dark:text-white">
                    {formatCurrency(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CancelReturnDialog ret={r} open={cancelOpen} onOpenChange={setCancelOpen} />
    </div>
  );
}
