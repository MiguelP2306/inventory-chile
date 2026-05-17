'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { publicDocumentUrl } from '@/lib/cashbox-api';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listSupplierPurchases } from '@/lib/customers-api';
import { formatCurrency } from '@/lib/format';
import type { SupplierDto } from '@inventory/shared';

const PAGE_SIZE = 20;

interface Props {
  supplier: SupplierDto;
}

export function SupplierDetail({ supplier }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/proveedores">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">
            {supplier.taxId ?? 'Sin RUT'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="space-y-4 rounded-md border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nombre / Razón social" value={supplier.name} />
            <Field label="RUT / NIT" value={supplier.taxId} mono />
            <Field label="Email" value={supplier.email} />
            <Field label="Teléfono" value={supplier.phone} />
            <Field label="Dirección" value={supplier.address} className="md:col-span-2" />
            <Field
              label="Notas"
              value={supplier.notes}
              className="md:col-span-2 whitespace-pre-line"
            />
          </div>
        </TabsContent>

        <TabsContent value="compras">
          <SupplierPurchases supplierId={supplier.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  value,
  className,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>
        {value && value.trim() !== '' ? value : <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function SupplierPurchases({ supplierId }: { supplierId: string }) {
  const [page, setPage] = useState(1);
  const purchases = useQuery({
    queryKey: ['supplier-purchases', supplierId, page],
    queryFn: () =>
      listSupplierPurchases(supplierId, { page, pageSize: PAGE_SIZE }),
  });

  const items = purchases.data?.items ?? [];
  const total = purchases.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-[110px] text-center">Facturas</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!purchases.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin compras registradas a este proveedor.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => {
              // Ronda 7 — `invoices` viene como array desde el backend.
              // Mostramos un link para cada uno (o "—" si no hay).
              const invoices = p.invoices ?? [];
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    {new Date(p.date).toLocaleDateString('es-CL', { dateStyle: 'medium' })}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.notes ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(p.total)}
                  </TableCell>
                  <TableCell className="text-center">
                    {invoices.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        {invoices.slice(0, 3).map((inv) => (
                          <a
                            key={inv.id}
                            href={publicDocumentUrl(inv.url) ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={inv.originalName}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Paperclip className="h-4 w-4" />
                          </a>
                        ))}
                        {invoices.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{invoices.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon" title="Ver detalle">
                      <Link href={`/compras/${p.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} compra{total === 1 ? '' : 's'} · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
