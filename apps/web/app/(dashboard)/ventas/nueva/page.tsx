import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { serverFetch } from '@/lib/server-api';
import type { QuotationDto } from '@inventory/shared';

export default async function NuevaVentaPage({
  searchParams,
}: {
  searchParams: Promise<{ fromQuotation?: string }>;
}) {
  const sp = await searchParams;
  const fromId = sp.fromQuotation;

  if (!fromId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Ventas</h1>
        <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
          El módulo de Ventas estará disponible en Fase 7.
        </div>
        <Button asChild variant="outline">
          <Link href="/cotizaciones">
            <ArrowLeft className="h-4 w-4" />
            Ir a cotizaciones
          </Link>
        </Button>
      </div>
    );
  }

  const quotation = await serverFetch<QuotationDto>(`/quotations/${fromId}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nueva venta</h1>
        <Button asChild variant="outline">
          <Link href={`/cotizaciones/${fromId}`}>
            <ArrowLeft className="h-4 w-4" />
            Volver a la cotización
          </Link>
        </Button>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
        <p className="font-medium">Próximamente — Fase 7</p>
        <p>
          Esta funcionalidad estará disponible en la próxima fase. Por ahora, los
          datos de la cotización quedan listos para conversión.
        </p>
      </div>

      {quotation && (
        <div className="space-y-4">
          <div className="rounded-md border bg-card p-4 space-y-2">
            <h2 className="font-medium">Prefill desde cotización</h2>
            <div className="text-sm">
              <div>
                <span className="text-muted-foreground">Cotización: </span>
                <span className="font-mono">{quotation.number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cliente: </span>
                {quotation.customerView.name || '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Total bruto: </span>
                {formatCurrency(quotation.total)}
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-card">
            <div className="border-b p-4">
              <h3 className="font-medium">Items</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">P. Unit</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(quotation.items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs">
                      {it.product?.sku ?? '—'}
                    </TableCell>
                    <TableCell>{it.product?.name ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.qty}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(it.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(it.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
