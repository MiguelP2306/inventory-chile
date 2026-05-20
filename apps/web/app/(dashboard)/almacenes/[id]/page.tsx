'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { formatCurrency } from '@/lib/format';
import { listMovements, listStock } from '@/lib/inventory-api';
import { listTransfers } from '@/lib/transfers-api';
import { getWarehouse } from '@/lib/warehouses-api';

/**
 * Ronda 9 — Detalle de bodega. 4 tabs:
 *  - **Datos**: nombre, dirección, estado + KPIs (productos con stock, valor
 *    de inventario, productos en crítico).
 *  - **Stock**: tabla de productos en esta bodega (qty + status + locationCode).
 *  - **Movimientos**: movimientos del inventario filtrados a esta bodega.
 *  - **Transferencias**: transferencias donde la bodega es origen o destino.
 */
export default function AlmacenDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const warehouseQ = useQuery({
    queryKey: ['warehouse', id],
    queryFn: () => getWarehouse(id),
    enabled: !!id,
  });
  const warehouse = warehouseQ.data;

  const stockQ = useQuery({
    queryKey: ['stock', { warehouseId: id }],
    queryFn: () => listStock({ warehouseId: id }),
    enabled: !!id,
  });
  const stock = useMemo(() => stockQ.data ?? [], [stockQ.data]);

  // KPIs derivados del stock de la bodega.
  const kpis = useMemo(() => {
    const withStock = stock.filter((s) => s.quantity > 0);
    const out = stock.filter((s) => s.status === 'out').length;
    const low = stock.filter((s) => s.status === 'low').length;
    const valueCost = withStock.reduce(
      (acc, s) => acc + s.quantity * parseFloat(s.product.cost ?? '0'),
      0,
    );
    const valuePrice = withStock.reduce(
      (acc, s) => acc + s.quantity * parseFloat(s.product.price ?? '0'),
      0,
    );
    return {
      productCount: withStock.length,
      outOfStock: out,
      lowStock: low,
      valueCost,
      valuePrice,
    };
  }, [stock]);

  // Movimientos de la bodega (paginados — el endpoint trae los más recientes).
  const movementsQ = useQuery({
    queryKey: ['movements', { warehouseId: id, page: 1 }],
    queryFn: () => listMovements({ warehouseId: id, page: 1, pageSize: 20 }),
    enabled: !!id,
  });
  const movements = movementsQ.data?.items ?? [];

  // Transferencias donde esta bodega es origen o destino.
  // Hacemos 2 queries y mergeamos (el endpoint no soporta OR).
  const transfersFromQ = useQuery({
    queryKey: ['transfers', { fromWarehouseId: id }],
    queryFn: () => listTransfers({ fromWarehouseId: id, page: 1, pageSize: 20 }),
    enabled: !!id,
  });
  const transfersToQ = useQuery({
    queryKey: ['transfers', { toWarehouseId: id }],
    queryFn: () => listTransfers({ toWarehouseId: id, page: 1, pageSize: 20 }),
    enabled: !!id,
  });
  const transfers = useMemo(() => {
    const merged = [
      ...(transfersFromQ.data?.items ?? []),
      ...(transfersToQ.data?.items ?? []),
    ];
    const dedup = new Map(merged.map((t) => [t.id, t]));
    return Array.from(dedup.values()).sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
  }, [transfersFromQ.data, transfersToQ.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/almacenes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">
            {warehouseQ.isLoading
              ? 'Cargando…'
              : (warehouse?.name ?? 'Bodega no encontrada')}
          </h1>
          {warehouse && !warehouse.isActive && (
            <Badge variant="secondary" className="mt-1">
              Inactiva
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="stock">Stock ({stock.length})</TabsTrigger>
          <TabsTrigger value="movimientos">
            Movimientos ({movements.length})
          </TabsTrigger>
          <TabsTrigger value="transferencias">
            Transferencias ({transfers.length})
          </TabsTrigger>
        </TabsList>

        {/* DATOS */}
        <TabsContent value="datos" className="space-y-4">
          {warehouseQ.isLoading && <Skeleton className="h-32 w-full" />}
          {warehouse && (
            <>
              <div className="rounded-md border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Nombre:</span>
                  <span className="font-medium">{warehouse.name}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Dirección: </span>
                  {warehouse.address ?? '—'}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Estado: </span>
                  {warehouse.isActive ? 'Activa' : 'Inactiva'}
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Productos con stock"
                  value={String(kpis.productCount)}
                  hint={`de ${stock.length} listados`}
                />
                <KpiCard
                  label="Stock crítico"
                  value={String(kpis.outOfStock)}
                  hint="En 0 unidades"
                  variant={kpis.outOfStock > 0 ? 'danger' : 'default'}
                />
                <KpiCard
                  label="Bajo stock"
                  value={String(kpis.lowStock)}
                  hint="Bajo el mínimo"
                  variant={kpis.lowStock > 0 ? 'warning' : 'default'}
                />
                <KpiCard
                  label="Valor inventario (costo)"
                  value={formatCurrency(kpis.valueCost.toFixed(2))}
                  hint={`A precio: ${formatCurrency(kpis.valuePrice.toFixed(2))}`}
                />
              </div>
            </>
          )}
        </TabsContent>

        {/* STOCK */}
        <TabsContent value="stock">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockQ.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                )}
                {!stockQ.isLoading && stock.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      Sin productos en esta bodega.
                    </TableCell>
                  </TableRow>
                )}
                {stock.map((s) => (
                  <TableRow key={s.product.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/productos/${s.product.id}`}
                        className="hover:underline"
                      >
                        {s.product.sku ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell>{s.product.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.locationCode ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* MOVIMIENTOS */}
        <TabsContent value="movimientos">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Referencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsQ.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                )}
                {!movementsQ.isLoading && movements.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      Sin movimientos en esta bodega.
                    </TableCell>
                  </TableRow>
                )}
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">
                      {new Date(m.createdAt).toLocaleString('es-CL')}
                    </TableCell>
                    <TableCell className="font-medium">{m.type}</TableCell>
                    <TableCell>{m.product?.name ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.qty}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.reference ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {movements.length > 0 && (
              <div className="p-3 text-right text-xs text-muted-foreground">
                <Link
                  href={`/inventario/movimientos?warehouseId=${id}`}
                  className="hover:underline"
                >
                  Ver todos los movimientos →
                </Link>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TRANSFERENCIAS */}
        <TabsContent value="transferencias">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen → Destino</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(transfersFromQ.isLoading || transfersToQ.isLoading) && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                )}
                {!transfersFromQ.isLoading &&
                  !transfersToQ.isLoading &&
                  transfers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground"
                      >
                        Sin transferencias.
                      </TableCell>
                    </TableRow>
                  )}
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/transferencias/${t.id}`}
                        className="hover:underline"
                      >
                        {t.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(t.date).toLocaleDateString('es-CL')}
                    </TableCell>
                    <TableCell>
                      {t.fromWarehouse?.name} → {t.toWarehouse?.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  variant = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  variant?: 'default' | 'warning' | 'danger';
}) {
  const cls =
    variant === 'danger'
      ? 'border-destructive/30 bg-destructive/5'
      : variant === 'warning'
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'bg-card';
  return (
    <div className={`rounded-md border p-4 ${cls}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Package className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'ok' | 'low' | 'out' }) {
  const map: Record<typeof status, { label: string; cls: string }> = {
    ok: { label: 'OK', cls: 'bg-stock-ok/15 text-stock-ok' },
    low: { label: 'Bajo', cls: 'bg-stock-low/15 text-stock-low' },
    out: { label: 'Crítico', cls: 'bg-stock-out/15 text-stock-out' },
  };
  const { label, cls } = map[status];
  return (
    <Badge className={`border-transparent ${cls}`} variant="default">
      {label}
    </Badge>
  );
}
