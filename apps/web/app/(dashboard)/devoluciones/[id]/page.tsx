'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, ExternalLink, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CancelReturnDialog } from '@/components/forms/cancel-return-dialog';
import {
  ReturnStatusBadge,
  ReturnTypeBadge,
} from '@/components/return-status-badge';
import { Badge } from '@/components/ui/badge';
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
import { formatCurrency } from '@/lib/format';
import { getReturn } from '@/lib/returns-api';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

export default function DevolucionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cancelOpen, setCancelOpen] = useState(false);

  const rq = useQuery({
    queryKey: ['return', id],
    queryFn: () => getReturn(id),
    enabled: !!id,
  });

  if (rq.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!rq.data) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Devolución no encontrada.
      </div>
    );
  }

  const r = rq.data;
  const canCancel = r.status !== 'CANCELLED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/devoluciones">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{r.number}</h1>
              <ReturnTypeBadge type={r.type} />
              <ReturnStatusBadge status={r.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Registrada el{' '}
              {new Date(r.date).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {r.user ? ` por ${r.user.name}` : ''}
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
            Cancelar devolución
          </Button>
        )}
      </div>

      {r.status === 'CANCELLED' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-medium text-destructive">Devolución cancelada</div>
          {r.cancelledAt && (
            <div className="text-xs text-muted-foreground">
              {new Date(r.cancelledAt).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {r.cancelledBy ? ` por ${r.cancelledBy.name}` : ''}
            </div>
          )}
          {r.cancelReason && (
            <div className="mt-2 whitespace-pre-wrap text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              {r.cancelReason}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-card p-4 space-y-2 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Origen</h2>
          {r.type === 'CUSTOMER' && r.sale ? (
            <Button asChild variant="link" size="sm" className="px-0">
              <Link href={`/ventas/${r.sale.id}`}>
                Venta {r.sale.number}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          ) : r.type === 'SUPPLIER' && r.purchaseEntry ? (
            <Button asChild variant="link" size="sm" className="px-0">
              <Link href={`/compras`}>
                Compra (ver listado)
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          ) : (
            '—'
          )}
        </div>
        <div className="rounded-md border bg-card p-4 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">Reembolso</h2>
          <div>
            <span className="text-muted-foreground">Monto: </span>
            <span className="font-medium tabular-nums">
              {formatCurrency(r.refundAmount)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Método: </span>
            {METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
          </div>
          {r.warehouse && (
            <div className="text-muted-foreground">
              Bodega: {r.warehouse.name}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card p-4 space-y-2 text-sm">
        <h2 className="text-sm font-semibold text-muted-foreground">Motivo</h2>
        <p className="whitespace-pre-wrap">{r.reason}</p>
        {r.notes && (
          <>
            <h3 className="mt-3 text-sm font-semibold text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-wrap">{r.notes}</p>
          </>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">P. Unit</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(r.items ?? []).map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">
                  {it.product?.sku ?? '—'}
                </TableCell>
                <TableCell>{it.product?.name ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                <TableCell>
                  {it.itemCondition === 'RESELLABLE' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent">
                      Vendible
                    </Badge>
                  ) : (
                    <Badge className="bg-stock-out/15 text-stock-out border-transparent">
                      Dañado
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(it.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(it.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CancelReturnDialog
        ret={r}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
