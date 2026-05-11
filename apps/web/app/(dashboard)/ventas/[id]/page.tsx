'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ExternalLink,
  FileText,
  Printer,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CancelSaleDialog } from '@/components/forms/cancel-sale-dialog';
import { SaleStatusBadge } from '@/components/sale-status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { getSale, getSalePdfUrl } from '@/lib/sales-api';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
};

export default function VentaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cancelOpen, setCancelOpen] = useState(false);

  const sale = useQuery({
    queryKey: ['sale', id],
    queryFn: () => getSale(id),
    enabled: !!id,
  });

  if (sale.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (!sale.data) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Venta no encontrada.
      </div>
    );
  }

  const s = sale.data;
  const canCancel = s.status !== 'CANCELLED';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/ventas">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{s.number}</h1>
              <SaleStatusBadge status={s.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Registrada el{' '}
              {new Date(s.date).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {s.user ? ` por ${s.user.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCancel && (
            <Button
              variant="outline"
              onClick={() => setCancelOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Ban className="h-4 w-4" />
              Cancelar venta
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Printer className="h-4 w-4" />
                Imprimir
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a
                  href={getSalePdfUrl(s.id, 'letter')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="h-4 w-4" />
                  Carta (A4)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={getSalePdfUrl(s.id, 'thermal80')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="h-4 w-4" />
                  Térmica 80mm
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {s.status === 'CANCELLED' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-medium text-destructive">Venta cancelada</div>
          {s.cancelledAt && (
            <div className="text-xs text-muted-foreground">
              {new Date(s.cancelledAt).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {s.cancelledBy ? ` por ${s.cancelledBy.name}` : ''}
            </div>
          )}
          {s.cancelReason && (
            <div className="mt-2 whitespace-pre-wrap text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              {s.cancelReason}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-card p-4 space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground">Cliente</h2>
          <div className="text-sm space-y-1 pt-2">
            <div className="font-medium">{s.customer?.name ?? '—'}</div>
            {s.customer?.taxId && (
              <div className="text-muted-foreground">RUT {s.customer.taxId}</div>
            )}
            {s.customer?.email && (
              <div className="text-muted-foreground">{s.customer.email}</div>
            )}
            {s.customer?.phone && (
              <div className="text-muted-foreground">{s.customer.phone}</div>
            )}
            {s.customer && (
              <Button asChild variant="link" size="sm" className="px-0">
                <Link href={`/clientes/${s.customer.id}`}>
                  Ver cliente
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-md border bg-card p-4 space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground">Pago</h2>
          <div className="text-sm space-y-1 pt-2">
            <div>
              <span className="text-muted-foreground">Método: </span>
              <span className="font-medium">
                {METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
              </span>
            </div>
            {Number(s.commissionAmount) > 0 && (
              <div className="text-muted-foreground">
                Comisión tarjeta:{' '}
                <span className="tabular-nums">
                  {formatCurrency(s.commissionAmount)}
                </span>
              </div>
            )}
            {s.warehouse && (
              <div className="text-muted-foreground">
                Bodega: {s.warehouse.name}
              </div>
            )}
            {s.quotation && (
              <div className="pt-1">
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link href={`/cotizaciones/${s.quotation.id}`}>
                    Desde cotización {s.quotation.number}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">P. Unit (bruto)</TableHead>
              <TableHead className="text-right">Desc.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(s.items ?? []).map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">
                  {it.product?.sku ?? '—'}
                </TableCell>
                <TableCell className="max-w-[300px]">
                  {it.product?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(it.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {it.discountPercent
                    ? `${Number(it.discountPercent).toFixed(0)}%`
                    : Number(it.discount) > 0
                      ? formatCurrency(it.discount)
                      : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(it.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {s.notes && (
          <div className="flex-1 min-w-[300px] rounded-md border bg-card p-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Notas</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{s.notes}</p>
          </div>
        )}
        <div className="ml-auto min-w-[280px] rounded-md border bg-card p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal neto</span>
            <span className="tabular-nums">{formatCurrency(s.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA</span>
            <span className="tabular-nums">{formatCurrency(s.taxAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(s.total)}</span>
          </div>
        </div>
      </div>

      <CancelSaleDialog
        sale={s}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
