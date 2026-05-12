'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Ban } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CancelTransferDialog } from '@/components/forms/cancel-transfer-dialog';
import { TransferStatusBadge } from '@/components/transfer-status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getTransfer } from '@/lib/transfers-api';

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
    return <Skeleton className="h-40 w-full" />;
  }
  if (!tq.data) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Transferencia no encontrada.
      </div>
    );
  }

  const t = tq.data;
  const canCancel = t.status !== 'CANCELLED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/transferencias">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{t.number}</h1>
              <TransferStatusBadge status={t.status} />
            </div>
            <p className="text-sm text-muted-foreground">
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
          <Button
            variant="outline"
            onClick={() => setCancelOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Ban className="h-4 w-4" />
            Cancelar transferencia
          </Button>
        )}
      </div>

      {t.status === 'CANCELLED' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-medium text-destructive">Transferencia cancelada</div>
          {t.cancelledAt && (
            <div className="text-xs text-muted-foreground">
              {new Date(t.cancelledAt).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {t.cancelledBy ? ` por ${t.cancelledBy.name}` : ''}
            </div>
          )}
          {t.cancelReason && (
            <div className="mt-2 whitespace-pre-wrap text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              {t.cancelReason}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Origen</div>
            <div className="text-base font-semibold">{t.fromWarehouse?.name ?? '—'}</div>
          </div>
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Destino</div>
            <div className="text-base font-semibold">{t.toWarehouse?.name ?? '—'}</div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(t.items ?? []).map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">
                  {it.product?.sku ?? '—'}
                </TableCell>
                <TableCell className="max-w-[300px]">
                  {it.product?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {it.qty}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {t.notes && (
        <div className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Notas</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{t.notes}</p>
        </div>
      )}

      <CancelTransferDialog
        transfer={t}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
