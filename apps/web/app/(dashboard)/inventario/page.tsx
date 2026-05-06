'use client';

import { useQuery } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { listStock } from '@/lib/inventory-api';
import type { StockStatus, StockSummary } from '@inventory/shared';

const ALL = '__all__';

export default function InventarioPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [adjustTarget, setAdjustTarget] = useState<StockSummary | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const stock = useQuery({
    queryKey: ['stock', { q: debouncedQ, status }],
    queryFn: () =>
      listStock({
        q: debouncedQ || undefined,
        status: status === ALL ? undefined : (status as StockStatus),
      }),
  });

  const counts = stock.data
    ? {
        ok: stock.data.filter((s) => s.status === 'ok').length,
        low: stock.data.filter((s) => s.status === 'low').length,
        out: stock.data.filter((s) => s.status === 'out').length,
      }
    : { ok: 0, low: 0, out: 0 };

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
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="md:col-span-2"
        />
        <Select value={status} onValueChange={setStatus}>
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
            {stock.data && stock.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin productos.
                </TableCell>
              </TableRow>
            )}
            {stock.data?.map((row) => (
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
