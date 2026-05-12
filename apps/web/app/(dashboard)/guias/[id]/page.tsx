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
import { DispatchStatusBadge } from '@/components/dispatch-status-badge';
import { VoidDispatchDialog } from '@/components/forms/void-dispatch-dialog';
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
import { getDispatchNote, getDispatchPdfUrl } from '@/lib/dispatch-api';

export default function GuiaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [voidOpen, setVoidOpen] = useState(false);

  const dq = useQuery({
    queryKey: ['dispatch-note', id],
    queryFn: () => getDispatchNote(id),
    enabled: !!id,
  });

  if (dq.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!dq.data) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Guía no encontrada.
      </div>
    );
  }

  const d = dq.data;
  const canVoid = d.status === 'ACTIVE';

  const addressLine = [d.addressStreet, d.addressNumber, d.commune?.name]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/guias">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{d.number}</h1>
              <DispatchStatusBadge status={d.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Despachada el{' '}
              {new Date(d.dispatchedAt).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {d.user ? ` por ${d.user.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canVoid && (
            <Button
              variant="outline"
              onClick={() => setVoidOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              <Ban className="h-4 w-4" />
              Anular guía
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
                  href={getDispatchPdfUrl(d.id, 'letter')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="h-4 w-4" />
                  Carta (A4)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={getDispatchPdfUrl(d.id, 'thermal80')}
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

      {d.status === 'VOIDED' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-medium text-destructive">Guía anulada</div>
          {d.voidedAt && (
            <div className="text-xs text-muted-foreground">
              {new Date(d.voidedAt).toLocaleString('es-CL', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              {d.voidedBy ? ` por ${d.voidedBy.name}` : ''}
            </div>
          )}
          {d.voidReason && (
            <div className="mt-2 whitespace-pre-wrap text-sm">
              <span className="text-muted-foreground">Motivo: </span>
              {d.voidReason}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border bg-card p-4 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Venta origen
          </h2>
          {d.sale ? (
            <Button asChild variant="link" size="sm" className="px-0">
              <Link href={`/ventas/${d.sale.id}`}>
                {d.sale.number}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          ) : (
            '—'
          )}
          {d.sale?.customer && (
            <div className="text-muted-foreground">
              {d.sale.customer.name} · RUT {d.sale.customer.taxId}
            </div>
          )}
        </div>
        <div className="rounded-md border bg-card p-4 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Dirección de entrega
          </h2>
          <div>{addressLine || <span className="text-muted-foreground">—</span>}</div>
          {d.commune?.region && (
            <div className="text-muted-foreground text-xs">
              Región {d.commune.region}
            </div>
          )}
          {d.addressNotes && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {d.addressNotes}
            </p>
          )}
        </div>
        <div className="rounded-md border bg-card p-4 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Transporte
          </h2>
          <div>
            <span className="text-muted-foreground">Transportista: </span>
            {d.carrier ?? <span className="text-muted-foreground">—</span>}
          </div>
          {d.trackingNumber && (
            <div>
              <span className="text-muted-foreground">N° seguimiento: </span>
              <span className="font-mono text-xs">{d.trackingNumber}</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Items despachados</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(d.sale?.items ?? []).map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">
                  {it.product?.sku ?? '—'}
                </TableCell>
                <TableCell>{it.product?.name ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {it.qty}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {d.notes && (
        <div className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Observaciones
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{d.notes}</p>
        </div>
      )}

      <VoidDispatchDialog
        note={d}
        open={voidOpen}
        onOpenChange={setVoidOpen}
      />
    </div>
  );
}
