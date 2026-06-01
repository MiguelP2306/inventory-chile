'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ExternalLink, ShieldX, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WarrantyStatusBadge } from '@/components/warranty-status-badge';
import { SoftModal } from '@/components/ui/soft-modal';
import { apiErrorMessage } from '@/lib/catalog-api';
import { getWarrantyClaim, updateWarrantyClaimStatus } from '@/lib/warranties-api';
import type { WarrantyStatusDto } from '@inventory/shared';

const TRANSITIONS: Record<
  WarrantyStatusDto,
  Array<{ to: WarrantyStatusDto; label: string; variant?: 'destructive' | 'default' }>
> = {
  OPEN: [
    { to: 'IN_REVIEW', label: 'Pasar a revisión' },
    { to: 'REJECTED', label: 'Rechazar', variant: 'destructive' },
  ],
  IN_REVIEW: [
    { to: 'APPROVED', label: 'Aprobar' },
    { to: 'REJECTED', label: 'Rechazar', variant: 'destructive' },
  ],
  APPROVED: [{ to: 'RESOLVED', label: 'Marcar como resuelto' }],
  REJECTED: [],
  RESOLVED: [],
};

const STATUS_LABELS: Record<WarrantyStatusDto, string> = {
  OPEN: 'Abierto',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  RESOLVED: 'Resuelto',
};

const CARD =
  'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';
const TEXTAREA =
  'w-full rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white';
const FIELD_LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';
const BTN_OUTLINE =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900';

export default function GarantiaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const wq = useQuery({
    queryKey: ['warranty-claim', id],
    queryFn: () => getWarrantyClaim(id),
    enabled: !!id,
  });

  const [transitionTo, setTransitionTo] = useState<WarrantyStatusDto | null>(null);
  const [resolution, setResolution] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!transitionTo) {
      setResolution('');
      setNotes('');
    }
  }, [transitionTo]);

  const transitionMut = useMutation({
    mutationFn: () =>
      updateWarrantyClaimStatus(id, {
        status: transitionTo!,
        resolution: resolution.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warranty-claims'] });
      qc.invalidateQueries({ queryKey: ['warranty-claim', id] });
      toast.success('Estado actualizado');
      setTransitionTo(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado')),
  });

  if (wq.isLoading) return <div className="h-40 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  if (!wq.data) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 text-sm font-semibold text-slate-400 dark:border-slate-850 dark:bg-[#11151C]">
        Reclamo no encontrado.
      </div>
    );
  }

  const w = wq.data;
  const allowedTransitions = TRANSITIONS[w.status] ?? [];

  // RESOLVED y REJECTED requieren texto de resolución obligatorio.
  const requiresResolution = transitionTo === 'RESOLVED' || transitionTo === 'REJECTED';
  const transitionValid = !requiresResolution || resolution.trim().length > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <Link
            href="/garantias"
            title="Volver"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {w.number}
              </h1>
              <WarrantyStatusBadge status={w.status} />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Abierto el{' '}
              {new Date(w.openedAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
              {w.user ? ` por ${w.user.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allowedTransitions.map((t) =>
            t.variant === 'destructive' ? (
              <button
                key={t.to}
                type="button"
                onClick={() => setTransitionTo(t.to)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-2.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-50 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400"
              >
                <XCircle className="h-4 w-4" />
                {t.label}
              </button>
            ) : (
              <button
                key={t.to}
                type="button"
                onClick={() => setTransitionTo(t.to)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90"
              >
                {t.to === 'APPROVED' && <CheckCircle2 className="h-4 w-4" />}
                {t.to === 'RESOLVED' && <ShieldX className="h-4 w-4" />}
                {t.label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* PRODUCTO / CLIENTE / VENTA */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`space-y-1 ${CARD}`}>
          <h2 className={LABEL}>Producto</h2>
          <div className="text-sm font-black text-slate-900 dark:text-white">{w.product?.name ?? '—'}</div>
          <div className="font-mono text-[11px] text-slate-400">SKU {w.product?.sku ?? '—'}</div>
        </div>
        <div className={`space-y-1 ${CARD}`}>
          <h2 className={LABEL}>Cliente</h2>
          <div className="text-sm font-black text-slate-900 dark:text-white">{w.customer?.name ?? '—'}</div>
          {w.customer && (
            <Link
              href={`/clientes/${w.customer.id}`}
              className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-bold text-[#2F6BFF] hover:underline"
            >
              Ver cliente <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className={`space-y-1 ${CARD}`}>
          <h2 className={LABEL}>Venta origen</h2>
          {w.sale ? (
            <Link
              href={`/ventas/${w.sale.id}`}
              className="inline-flex items-center gap-1 font-mono text-sm font-bold text-[#2F6BFF] hover:underline"
            >
              {w.sale.number} <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
          {w.linkedReturn && (
            <div className="pt-1 text-[11px] text-slate-400">
              Devolución vinculada:{' '}
              <Link href={`/devoluciones/${w.linkedReturn.id}`} className="font-mono font-bold text-slate-600 hover:underline dark:text-slate-300">
                {w.linkedReturn.number}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* NOTAS / RESOLUCIÓN */}
      {(w.notes || w.resolution) && (
        <div className={`space-y-3 ${CARD}`}>
          {w.notes && (
            <div>
              <h2 className={LABEL}>Notas</h2>
              <p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                {w.notes}
              </p>
            </div>
          )}
          {w.resolution && (
            <div>
              <h2 className={LABEL}>Resolución</h2>
              <p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                {w.resolution}
              </p>
              {w.resolvedAt && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Cerrado el{' '}
                  {new Date(w.resolvedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* BANNER aprobado */}
      {w.status === 'APPROVED' && !w.linkedReturn && (
        <div className="space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 dark:border-emerald-950/30 dark:bg-emerald-950/10">
          <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">Reclamo aprobado</div>
          <p className="text-xs font-medium leading-relaxed text-emerald-700/80 dark:text-emerald-400/70">
            Si la resolución implica cambio de producto o reembolso, registrá una devolución desde el
            detalle de la venta. Las garantías no afectan stock automáticamente.
          </p>
          {w.sale && (
            <Link
              href={`/ventas/${w.sale.id}`}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Ir a la venta para crear devolución <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      {/* DIÁLOGO transición */}
      <SoftModal
        open={!!transitionTo}
        onOpenChange={(o) => !o && setTransitionTo(null)}
        title="Cambiar estado del reclamo"
        subtitle={transitionTo ? `${STATUS_LABELS[w.status]} → ${STATUS_LABELS[transitionTo]}` : ''}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (transitionValid) transitionMut.mutate();
          }}
          className="space-y-4 p-5"
        >
          {requiresResolution && (
            <div className="space-y-1.5">
              <span className={FIELD_LABEL}>Resolución (obligatoria)</span>
              <textarea
                rows={4}
                autoFocus
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder={
                  transitionTo === 'RESOLVED'
                    ? 'Ej: Cambio por producto nuevo. Devolución DEV-2026-00005 vinculada.'
                    : 'Ej: Garantía no aplica porque el daño fue por uso indebido.'
                }
                className={TEXTAREA}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <span className={FIELD_LABEL}>Notas adicionales (opcional)</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles que querés dejar registrados"
              className={TEXTAREA}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setTransitionTo(null)}
              disabled={transitionMut.isPending}
              className={BTN_OUTLINE}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!transitionValid || transitionMut.isPending}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {transitionMut.isPending ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </SoftModal>
    </div>
  );
}
