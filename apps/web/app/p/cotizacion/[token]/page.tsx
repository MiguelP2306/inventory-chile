import { FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { getPublicPdfUrl } from '@/lib/quotations-api';
import type { PublicQuotationDto } from '@inventory/shared';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

interface FetchResult {
  ok: boolean;
  status: number;
  data?: PublicQuotationDto;
}

async function fetchPublic(token: string): Promise<FetchResult> {
  const res = await fetch(`${API_BASE}/public/quotations/${token}`, {
    cache: 'no-store',
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as PublicQuotationDto;
  return { ok: true, status: res.status, data };
}

export default async function PublicQuotationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchPublic(token);

  if (!result.ok) {
    if (result.status === 410) {
      return (
        <ErrorBlock
          title="Cotización vencida"
          message="Esta cotización ya no está disponible. Contactá a la empresa para solicitar una nueva."
        />
      );
    }
    return (
      <ErrorBlock
        title="Cotización no encontrada"
        message="El link puede ser incorrecto o haber sido revocado. Verificá con la empresa."
      />
    );
  }

  const q = result.data!;
  const expired =
    q.status === 'EXPIRED' ||
    (q.validUntil ? new Date(q.validUntil) < new Date() : false);

  return (
    <div className="space-y-6">
      <header className="flex flex-col items-start gap-4 rounded-md border bg-background p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {q.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={q.company.logoUrl}
              alt={q.company.name}
              className="h-12 w-auto"
            />
          ) : null}
          <div>
            <div className="text-lg font-semibold">{q.company.name}</div>
            {q.company.taxId && (
              <div className="text-xs text-muted-foreground">
                RUT {q.company.taxId}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Cotización</div>
          <div className="font-mono text-lg font-semibold">{q.number}</div>
          {expired && (
            <Badge className="mt-1 bg-amber-500/15 text-amber-700 border-transparent">
              Cotización vencida
            </Badge>
          )}
        </div>
      </header>

      {expired && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900">
          Esta cotización ya venció. Contactá a la empresa para revalidar los precios.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-background p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Cliente
          </h2>
          <div className="mt-2 text-sm space-y-1">
            <div className="font-medium">{q.customer.name}</div>
            {q.customer.taxId && (
              <div className="text-muted-foreground">
                RUT {q.customer.taxId}
              </div>
            )}
            {q.customer.email && (
              <div className="text-muted-foreground">{q.customer.email}</div>
            )}
            {q.customer.phone && (
              <div className="text-muted-foreground">{q.customer.phone}</div>
            )}
          </div>
        </div>
        <div className="rounded-md border bg-background p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Detalle
          </h2>
          <div className="mt-2 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Fecha: </span>
              {new Date(q.date).toLocaleDateString('es-CL', {
                dateStyle: 'long',
              })}
            </div>
            {q.validUntil && (
              <div>
                <span className="text-muted-foreground">Válida hasta: </span>
                {new Date(q.validUntil).toLocaleDateString('es-CL', {
                  dateStyle: 'long',
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">P. Unit</TableHead>
              <TableHead className="text-right">Desc.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.items.map((it, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-mono text-xs">
                  {it.code || '—'}
                </TableCell>
                <TableCell className="max-w-[280px]">{it.description}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {it.qty}
                </TableCell>
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

      <div className="ml-auto max-w-sm rounded-md border bg-background p-4 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal neto</span>
          <span className="tabular-nums">{formatCurrency(q.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">IVA</span>
          <span className="tabular-nums">{formatCurrency(q.taxAmount)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(q.total)}</span>
        </div>
      </div>

      <div className="flex justify-center">
        <Button asChild size="lg">
          <a
            href={getPublicPdfUrl(token, 'letter')}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileDown className="h-4 w-4" />
            Descargar PDF
          </a>
        </Button>
      </div>

      <footer className="rounded-md border bg-background p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-medium text-foreground">{q.company.name}</div>
        {q.company.address && <div>{q.company.address}</div>}
        {q.company.phone && <div>Tel: {q.company.phone}</div>}
        {q.company.email && <div>Email: {q.company.email}</div>}
        {q.company.quotationFooter && (
          <div className="whitespace-pre-wrap pt-2 border-t">
            {q.company.quotationFooter}
          </div>
        )}
      </footer>
    </div>
  );
}

function ErrorBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-md border bg-background p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
