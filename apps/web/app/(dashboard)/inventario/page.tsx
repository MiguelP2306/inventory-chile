'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { apiAbsoluteUrl } from '@/lib/api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { listStockPaginated, setStockLocation } from '@/lib/inventory-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarehouses } from '@/lib/warehouses-api';
import type { StockStatus, StockSummary, WarehouseDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 50;

export default function InventarioPage() {
  const qc = useQueryClient();

  const filters = useUrlFilters({
    q: '',
    status: '',
    warehouse: '',
    page: '',
  });
  const { values, setFilters, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const status = values.status || ALL;
  const warehouseId = values.warehouse || '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  // Bodegas activas para el selector.
  const warehouses = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ active: 'true' }),
  });
  const activeWarehouses =
    (Array.isArray(warehouses.data)
      ? warehouses.data
      : warehouses.data?.items ?? []) as WarehouseDto[];

  // Si el filtro `warehouse` está vacío y ya tenemos bodegas, seteamos
  // automáticamente la primera. Esto preserva URL compartibles: si llega un
  // link con `?warehouse=<id>`, lo respetamos.
  useEffect(() => {
    if (!warehouseId && activeWarehouses.length > 0) {
      setFilter('warehouse', activeWarehouses[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, activeWarehouses.length]);

  const [adjustTarget, setAdjustTarget] = useState<StockSummary | null>(null);

  const stock = useQuery({
    queryKey: ['stock', { q: debouncedQ, status, warehouseId, page }],
    queryFn: () =>
      listStockPaginated({
        q: debouncedQ || undefined,
        status: status === ALL ? undefined : (status as StockStatus),
        warehouseId: warehouseId || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !!warehouseId,
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

  const currentWarehouse = useMemo(
    () => activeWarehouses.find((w) => w.id === warehouseId) ?? null,
    [activeWarehouses, warehouseId],
  );

  // Mutación para edición inline de locationCode.
  const locationMut = useMutation({
    mutationFn: (input: { productId: string; warehouseId: string; locationCode: string | null }) =>
      setStockLocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Ubicación actualizada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventario</h1>
          {currentWarehouse && (
            <p className="text-sm text-muted-foreground">
              Mostrando stock de <strong>{currentWarehouse.name}</strong>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="ok">{counts.ok} OK</Badge>
          <Badge variant="low">{counts.low} bajo stock</Badge>
          <Badge variant="out">{counts.out} sin stock</Badge>
          {/* Ronda 10 — exportar a Excel con los filtros activos
              (la paginación se ignora; exporta todos los resultados).
              Ronda 12 — apuntar al API backend con `apiAbsoluteUrl`. */}
          <Button asChild variant="outline" size="sm">
            <a
              href={apiAbsoluteUrl(
                `inventory/stock.xlsx${buildStockExportQuery({
                  q: debouncedQ,
                  status: status === ALL ? undefined : (status as StockStatus),
                  warehouseId: warehouseId || undefined,
                })}`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="h-4 w-4" />
              Exportar Excel
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Select
          value={warehouseId || ''}
          onValueChange={(v) => setFilters({ warehouse: v, page: null })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Bodega" />
          </SelectTrigger>
          <SelectContent>
            {activeWarehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por SKU, código de barras, nombre o ubicación"
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
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Ubicación</TableHead>
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
                    <TableCell colSpan={8}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!stock.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Sin productos.
                </TableCell>
              </TableRow>
            )}
            {items.map((row) => (
              <TableRow key={row.product.id}>
                {/* Ronda 7 — SKU y nombre llevan al detalle del producto.
                    Mantenemos el resto de las celdas no clickeables porque
                    tienen interacciones propias (ubicación inline, ajustar). */}
                <TableCell className="font-mono text-xs">
                  <Link
                    href={`/productos/${row.product.id}`}
                    className="hover:underline"
                  >
                    {row.product.sku}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/productos/${row.product.id}`}
                    className="hover:underline"
                  >
                    {row.product.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <LocationCell
                    initialValue={row.locationCode}
                    onSave={(value) =>
                      locationMut.mutate({
                        productId: row.product.id,
                        warehouseId: row.warehouseId,
                        locationCode: value,
                      })
                    }
                    pending={locationMut.isPending}
                  />
                </TableCell>
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

      {adjustTarget && currentWarehouse && (
        <AdjustStockDialog
          product={adjustTarget.product}
          currentQty={adjustTarget.quantity}
          warehouseId={adjustTarget.warehouseId}
          warehouseName={currentWarehouse.name}
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

/**
 * Celda editable inline para `locationCode`. Click → modo edición con input.
 * Enter/blur guarda. Escape cancela. Persiste en backend vía PATCH del padre.
 *
 * Si la fila no tenía valor todavía muestra "—" en gris, click muestra input
 * vacío.
 */
function LocationCell({
  initialValue,
  onSave,
  pending,
}: {
  initialValue: string | null;
  onSave: (value: string | null) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue ?? '');

  useEffect(() => {
    if (!editing) setDraft(initialValue ?? '');
  }, [initialValue, editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim() === '' ? null : draft.trim().slice(0, 30);
    const previous = initialValue ?? '';
    if (next === previous) return; // sin cambios
    if (next === '' && previous === '') return;
    onSave(next);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setEditing(false);
            setDraft(initialValue ?? '');
          }
        }}
        maxLength={30}
        placeholder="ej: A-12-3"
        className="h-7 text-xs font-mono"
        disabled={pending}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded px-1 py-0.5 font-mono text-xs hover:bg-accent"
      title="Click para editar"
    >
      {initialValue ?? <span className="text-muted-foreground">—</span>}
    </button>
  );
}

/**
 * Ronda 10 — arma la query string para el endpoint `/api/inventory/stock.xlsx`
 * a partir de los filtros activos. Omite undefined/vacíos.
 */
function buildStockExportQuery(
  params: Record<string, string | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
