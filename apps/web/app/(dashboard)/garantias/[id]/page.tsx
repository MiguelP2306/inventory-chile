'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ExternalLink, ShieldX, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WarrantyStatusBadge } from '@/components/warranty-status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/catalog-api';
import {
  getWarrantyClaim,
  updateWarrantyClaimStatus,
} from '@/lib/warranties-api';
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

// Ronda 7 — labels en español de los estados (antes el dialog title y los
// mensajes de feedback mostraban los IDs internos como "IN_REVIEW → APPROVED",
// que el operador no entiende).
const STATUS_LABELS: Record<WarrantyStatusDto, string> = {
  OPEN: 'Abierto',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  RESOLVED: 'Resuelto',
};

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
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado')),
  });

  if (wq.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!wq.data) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Reclamo no encontrado.
      </div>
    );
  }

  const w = wq.data;
  const allowedTransitions = TRANSITIONS[w.status] ?? [];

  // RESOLVED y REJECTED requieren texto de resolución obligatorio.
  const requiresResolution =
    transitionTo === 'RESOLVED' || transitionTo === 'REJECTED';
  const transitionValid =
    !requiresResolution || resolution.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/garantias">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{w.number}</h1>
              <WarrantyStatusBadge status={w.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Abierto el{' '}
              {new Date(w.openedAt).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {w.user ? ` por ${w.user.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allowedTransitions.map((t) => (
            <Button
              key={t.to}
              variant={t.variant === 'destructive' ? 'outline' : 'default'}
              className={t.variant === 'destructive' ? 'text-destructive' : ''}
              onClick={() => setTransitionTo(t.to)}
            >
              {t.to === 'APPROVED' && <CheckCircle2 className="h-4 w-4" />}
              {t.to === 'REJECTED' && <XCircle className="h-4 w-4" />}
              {t.to === 'RESOLVED' && <ShieldX className="h-4 w-4" />}
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border bg-card p-4 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Producto</h2>
          <div className="font-medium">{w.product?.name ?? '—'}</div>
          <div className="font-mono text-xs text-muted-foreground">
            SKU {w.product?.sku ?? '—'}
          </div>
        </div>
        <div className="rounded-md border bg-card p-4 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Cliente</h2>
          <div className="font-medium">{w.customer?.name ?? '—'}</div>
          {w.customer && (
            <Button asChild variant="link" size="sm" className="px-0">
              <Link href={`/clientes/${w.customer.id}`}>
                Ver cliente
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
        <div className="rounded-md border bg-card p-4 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Venta origen</h2>
          {w.sale ? (
            <Button asChild variant="link" size="sm" className="px-0">
              <Link href={`/ventas/${w.sale.id}`}>
                {w.sale.number}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          ) : (
            '—'
          )}
          {w.linkedReturn && (
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">Devolución vinculada: </span>
              <Link
                href={`/devoluciones/${w.linkedReturn.id}`}
                className="font-mono hover:underline"
              >
                {w.linkedReturn.number}
              </Link>
            </div>
          )}
        </div>
      </div>

      {(w.notes || w.resolution) && (
        <div className="rounded-md border bg-card p-4 space-y-3 text-sm">
          {w.notes && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">Notas</h2>
              <p className="mt-1 whitespace-pre-wrap">{w.notes}</p>
            </div>
          )}
          {w.resolution && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">
                Resolución
              </h2>
              <p className="mt-1 whitespace-pre-wrap">{w.resolution}</p>
              {w.resolvedAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Cerrado el{' '}
                  {new Date(w.resolvedAt).toLocaleString('es-CL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {w.status === 'APPROVED' && !w.linkedReturn && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="font-medium">Reclamo aprobado</div>
          <p className="mt-1 text-xs">
            Si la resolución implica cambio de producto o reembolso, registrá una
            devolución desde el detalle de la venta. Las garantías no afectan
            stock automáticamente — esa decisión queda en manos del operador.
          </p>
          {w.sale && (
            <Button
              asChild
              variant="link"
              size="sm"
              className="mt-2 px-0 text-emerald-900 dark:text-emerald-200"
            >
              <Link href={`/ventas/${w.sale.id}`}>
                Ir a la venta para crear devolución
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={!!transitionTo}
        onOpenChange={(o) => !o && setTransitionTo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cambiar estado: {STATUS_LABELS[w.status]} →{' '}
              {transitionTo ? STATUS_LABELS[transitionTo] : ''}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (transitionValid) transitionMut.mutate();
            }}
            className="space-y-4"
          >
            {requiresResolution && (
              <div className="space-y-2">
                <Label htmlFor="resolution">
                  Resolución (obligatoria)
                </Label>
                <Textarea
                  id="resolution"
                  rows={4}
                  autoFocus
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder={
                    transitionTo === 'RESOLVED'
                      ? 'Ej: Cambio por producto nuevo. Devolución DEV-2026-00005 vinculada.'
                      : 'Ej: Garantía no aplica porque el daño fue por uso indebido (revisado por el técnico).'
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas adicionales (opcional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles que querés dejar registrados"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransitionTo(null)}
                disabled={transitionMut.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!transitionValid || transitionMut.isPending}
              >
                {transitionMut.isPending ? 'Guardando...' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
