'use client';

import { useQuery } from '@tanstack/react-query';
import { Paperclip, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { publicDocumentUrl } from '@/lib/cashbox-api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { listPurchases, listSuppliers } from '@/lib/inventory-api';
import { useUrlFilters } from '@/lib/use-url-filters';

const ALL = '__all__';
const PAGE_SIZE = 20;

export default function ComprasPage() {
  const { values, setFilter, clear } = useUrlFilters({
    supplier: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const supplierId = values.supplier || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');

  const filtersActive = supplierId !== ALL || dateFrom !== '' || dateTo !== '';

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });

  const list = useQuery({
    queryKey: ['purchases', { supplierId, dateFrom, dateTo, page }],
    queryFn: () =>
      listPurchases({
        supplierId: supplierId === ALL ? undefined : supplierId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compras</h1>
        <Button asChild>
          <Link href="/compras/nuevo">
            <Plus className="h-4 w-4" />
            Nueva entrada
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Select
          value={supplierId}
          onValueChange={(v) => {
            setFilter('supplier', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los proveedores</SelectItem>
            {suppliers.data?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setFilter('dateFrom', e.target.value || null);
            setFilter('page', null);
          }}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setFilter('dateTo', e.target.value || null);
            setFilter('page', null);
          }}
        />
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-[80px] text-center">Factura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin compras registradas todavía.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => {
              const invoice = publicDocumentUrl(p.invoiceUrl);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    {new Date(p.date).toLocaleDateString('es-CL', { dateStyle: 'medium' })}
                  </TableCell>
                  <TableCell className="font-medium">{p.supplier?.name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {p.notes ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(p.subtotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(p.taxAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(p.total)}
                  </TableCell>
                  <TableCell className="text-center">
                    {invoice ? (
                      <a
                        href={invoice}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver factura"
                        className="inline-flex text-muted-foreground hover:text-foreground"
                      >
                        <Paperclip className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
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
