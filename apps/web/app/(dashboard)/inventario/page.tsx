'use client';

import { useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { AdjustStockDialog } from '@/components/adjust-stock-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { listStockPaginated } from '@/lib/inventory-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { StockStatus, StockSummary } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 50;

export default function InventarioPage() {
  const filters = useUrlFilters({
    q: '',
    status: '',
    page: '',
  });
  const { values, setFilters, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const status = values.status || ALL;
  const page = Number(values.page || '1');

  const debouncedQ = (values.q ?? '').trim();

  const [adjustTarget, setAdjustTarget] = useState<StockSummary | null>(null);

  const stock = useQuery({
    queryKey: ['stock', { q: debouncedQ, status, page }],
    queryFn: () =>
      listStockPaginated({
        q: debouncedQ || undefined,
        status: status === ALL ? undefined : (status as StockStatus),
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = stock.data?.items ?? [];
  const total = stock.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const counts = items.reduce(
    (acc, s) => {
      acc[s.status] += 1;
      return acc;
    },
    { ok: 0, low: 0, out: 0 } as Record<StockStatus, number>,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventario</h1>
        <div className="flex gap-2 text-sm">
          <Badge variant="ok">{counts.ok} OK</Badge>
          <Badge variant="low">{counts.low} bajo stock</Badge>
          <Badge variant="out">{counts.out} sin stock</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          placeholder="Buscar por SKU, número de parte, código de barras o nombre"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          className="md:col-span-2"
        />
        <Select
          value={status}
          onValueChange={(v) => setFilters({ status: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            <SelectItem value="ok">Solo OK</SelectItem>
            <SelectItem value="low">Solo bajo stock</SelectItem>
            <SelectItem value="out">Solo sin stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Mín</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {stock.isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!stock.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin productos.
                </TableCell>
              </TableRow>
            )}
            {items.map((row) => (
              <TableRow key={row.product.id}>
                <TableCell className="font-mono text-xs">{row.product.sku}</TableCell>
                <TableCell>{row.product.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.product.category?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {row.quantity}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {row.product.minStock}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAdjustTarget(row)}
                    title="Ajustar"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} producto{total === 1 ? '' : 's'} · página {page} de {totalPages}
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

      {adjustTarget && (
        <AdjustStockDialog
          product={adjustTarget.product}
          currentQty={adjustTarget.quantity}
          open={!!adjustTarget}
          onOpenChange={(o) => !o && setAdjustTarget(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  if (status === 'ok') return <Badge variant="ok">OK</Badge>;
  if (status === 'low') return <Badge variant="low">Bajo stock</Badge>;
  return <Badge variant="out">Sin stock</Badge>;
}
