'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ExternalLink,
  FileText,
  Printer,
  RotateCcw,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CancelSaleDialog } from '@/components/forms/cancel-sale-dialog';
import { CustomerReturnDialog } from '@/components/forms/customer-return-dialog';
import { GenerateDispatchDialog } from '@/components/forms/generate-dispatch-dialog';
import { MultiWarrantyDialog } from '@/components/forms/multi-warranty-dialog';
import { OpenWarrantyDialog } from '@/components/forms/open-warranty-dialog';
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
import { Permission, useCan } from '@/lib/current-user-context';
import { getActiveDispatchBySale } from '@/lib/dispatch-api';
import { formatCurrency } from '@/lib/format';
import { getSale, getSalePdfUrl } from '@/lib/sales-api';
import { cn } from '@/lib/utils';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

export default function VentaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  // Ronda 9 — dialog multi-item para garantías.
  const [multiWarrantyOpen, setMultiWarrantyOpen] = useState(false);
  const canSeeBreakdown = useCan(Permission.SALE_VIEW_FINANCIAL_BREAKDOWN);

  // Ronda 9 — query params para ops rápidas. Cuando la pantalla se abre
  // con `?return=1` / `?warranty=1` / `?dispatch=1`, dispara el dialog
  // correspondiente automáticamente (lo usan los botones "Nueva ..." de
  // los listados de /devoluciones, /garantias, /guias).
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('return') === '1') setReturnOpen(true);
    if (searchParams.get('warranty') === '1') setMultiWarrantyOpen(true);
    if (searchParams.get('dispatch') === '1') setDispatchOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [warrantyTargetItemId, setWarrantyTargetItemId] = useState<string | null>(
    null,
  );

  // Si la venta ya tiene guía activa, mostramos "Ver guía DESP-XXX" en lugar
  // de "Generar guía". El backend rechaza generar otra mientras haya activa.
  const activeDispatch = useQuery({
    queryKey: ['active-dispatch-by-sale', id],
    queryFn: () => getActiveDispatchBySale(id),
    enabled: !!id,
  });

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
            <>
              {activeDispatch.data ? (
                <Button asChild variant="outline">
                  <Link href={`/guias/${activeDispatch.data.id}`}>
                    <Truck className="h-4 w-4" />
                    Ver guía {activeDispatch.data.number}
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setDispatchOpen(true)}>
                  <Truck className="h-4 w-4" />
                  Generar guía de despacho
                </Button>
              )}
              <Button variant="outline" onClick={() => setReturnOpen(true)}>
                <RotateCcw className="h-4 w-4" />
                Crear devolución
              </Button>
              {/* Ronda 9 — botón visible para garantías (antes era ícono
                  pequeño en cada fila). Abre dialog multi-item. */}
              <Button
                variant="outline"
                onClick={() => setMultiWarrantyOpen(true)}
              >
                <ShieldAlert className="h-4 w-4" />
                Crear garantía
              </Button>
              <Button
                variant="outline"
                onClick={() => setCancelOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Ban className="h-4 w-4" />
                Venta a nota crédito
              </Button>
            </>
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
          <h2 className="text-sm font-semibold text-muted-foreground">
            {canSeeBreakdown ? 'Pago' : 'Detalles'}
          </h2>
          <div className="text-sm space-y-1 pt-2">
            {canSeeBreakdown && s.paymentMethod && (
              <div>
                <span className="text-muted-foreground">Método: </span>
                <span className="font-medium">
                  {METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
                </span>
              </div>
            )}
            {canSeeBreakdown && Number(s.commissionAmount ?? 0) > 0 && (
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
          {canSeeBreakdown && s.subtotal != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal neto</span>
              <span className="tabular-nums">{formatCurrency(s.subtotal)}</span>
            </div>
          )}
          {canSeeBreakdown && s.taxAmount != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="tabular-nums">{formatCurrency(s.taxAmount)}</span>
            </div>
          )}
          <div
            className={cn(
              'flex justify-between font-semibold',
              canSeeBreakdown && 'border-t pt-2',
            )}
          >
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

      <CustomerReturnDialog
        sale={s}
        open={returnOpen}
        onOpenChange={setReturnOpen}
      />

      <GenerateDispatchDialog
        sale={s}
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
      />

      {/* Ronda 9 — dialog primario para abrir garantías. */}
      <MultiWarrantyDialog
        sale={s}
        open={multiWarrantyOpen}
        onOpenChange={setMultiWarrantyOpen}
      />

      {warrantyTargetItemId &&
        (() => {
          const item = (s.items ?? []).find(
            (i) => i.id === warrantyTargetItemId,
          );
          if (!item) return null;
          return (
            <OpenWarrantyDialog
              saleItem={item}
              open={!!warrantyTargetItemId}
              onOpenChange={(o) => !o && setWarrantyTargetItemId(null)}
            />
          );
        })()}
    </div>
  );
}
