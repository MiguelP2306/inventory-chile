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
import { listWarehouses } from '@/lib/warehouses-api';
import type { WarehouseDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

export default function ComprasPage() {
  // Ronda 7 — filtros agregados: bodega, rango de total. Antes solo
  // proveedor + rango de fecha. Estos dos nuevos viven en URL como el resto
  // para compartir links/refrescar sin perder el filtro.
  const { values, setFilter, clear } = useUrlFilters({
    supplier: '',
    warehouse: '',
    dateFrom: '',
    dateTo: '',
    totalMin: '',
    totalMax: '',
    page: '',
  });
  const supplierId = values.supplier || ALL;
  const warehouseId = values.warehouse || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const totalMin = values.totalMin ?? '';
  const totalMax = values.totalMax ?? '';
  const page = Number(values.page || '1');

  const filtersActive =
    supplierId !== ALL ||
    warehouseId !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    totalMin !== '' ||
    totalMax !== '';

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });
  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses(),
  });
  const warehouseList = (
    Array.isArray(warehouses.data)
      ? warehouses.data
      : warehouses.data?.items ?? []
  ) as WarehouseDto[];

  const list = useQuery({
    queryKey: [
      'purchases',
      { supplierId, warehouseId, dateFrom, dateTo, totalMin, totalMax, page },
    ],
    queryFn: () =>
      listPurchases({
        supplierId: supplierId === ALL ? undefined : supplierId,
        warehouseId: warehouseId === ALL ? undefined : warehouseId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        totalMin: totalMin || undefined,
        totalMax: totalMax || undefined,
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <Select
          value={warehouseId}
          onValueChange={(v) => {
            setFilter('warehouse', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Bodega destino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las bodegas</SelectItem>
            {warehouseList.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
                {!w.isActive ? ' (inactiva)' : ''}
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
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Total mínimo (CLP)"
          value={totalMin}
          onChange={(e) => {
            setFilter('totalMin', e.target.value || null);
            setFilter('page', null);
          }}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Total máximo (CLP)"
          value={totalMax}
          onChange={(e) => {
            setFilter('totalMax', e.target.value || null);
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
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-[80px] text-center">Facturas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Sin compras registradas todavía.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => {
              // Ronda 7 — invoices viene como array. Mostramos el conteo +
              // el link del primero (los demás se ven en el detalle).
              const invoiceCount = p.invoices?.length ?? 0;
              const firstInvoice = invoiceCount > 0 ? p.invoices![0] : null;
              const firstUrl = firstInvoice
                ? publicDocumentUrl(firstInvoice.url)
                : null;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/compras/${p.id}`}
                      className="hover:underline"
                    >
                      {new Date(p.date).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{p.supplier?.name ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {p.warehouse?.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
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
                    {invoiceCount > 0 && firstUrl ? (
                      <a
                        href={firstUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={
                          invoiceCount === 1
                            ? 'Ver factura'
                            : `${invoiceCount} archivos — abrir primero`
                        }
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Paperclip className="h-4 w-4" />
                        {invoiceCount > 1 && (
                          <span className="text-xs">×{invoiceCount}</span>
                        )}
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
