'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Package,
  Pencil,
  Search,
  SlidersHorizontal,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AdjustStockDialog } from '@/components/adjust-stock-dialog';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { apiAbsoluteUrl } from '@/lib/api';
import {
  apiErrorMessage,
  listProducts,
  publicImageUrl,
} from '@/lib/catalog-api';
import { listStockPaginated, setStockLocation } from '@/lib/inventory-api';
import { cn } from '@/lib/utils';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarehouses } from '@/lib/warehouses-api';
import type { StockStatus, StockSummary, WarehouseDto } from '@inventory/shared';

const PAGE_SIZE = 50;

/**
 * Inventario — diseño I1 Clean Refined.
 *
 * Preserva 1:1 la lógica original:
 *  · `useUrlFilters({ q, status, warehouse, page })` + `useDebouncedUrlFilter`.
 *  · Auto-select de la primera bodega activa cuando no hay `?warehouse=…`.
 *  · `listStockPaginated` + `setStockLocation` (edición inline de ubicación).
 *  · `AdjustStockDialog` + export Excel via `apiAbsoluteUrl`.
 *
 * UI nueva:
 *  · Header con title + sub + WarehousePicker pill + Exportar Excel.
 *  · 4 chips de estado clicables (Todos / Con stock / Bajo / Sin) que
 *    reemplazan el dropdown de estado (mismo `?status=…` URL param).
 *  · Tabla con thumbnail de producto, barcode chip, ubicación inline,
 *    celda Stock con barra visual vs mínimo, badge de estado.
 */
export default function InventarioPage() {
  const qc = useQueryClient();

  const filters = useUrlFilters({
    q: '',
    status: '',
    warehouse: '',
    page: '',
  });
  const { values, setFilter, setFilters } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const statusFilter: 'ok' | 'low' | 'out' | '' = (values.status as
    | 'ok'
    | 'low'
    | 'out'
    | '') || '';
  const warehouseId = values.warehouse || '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  // Bodegas activas para el picker.
  const warehouses = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ active: 'true' }),
  });
  const activeWarehouses =
    (Array.isArray(warehouses.data)
      ? warehouses.data
      : warehouses.data?.items ?? []) as WarehouseDto[];

  // Si el filtro `warehouse` está vacío y ya tenemos bodegas, seteamos
  // automáticamente la primera. Esto preserva URL compartibles.
  useEffect(() => {
    if (!warehouseId && activeWarehouses.length > 0) {
      setFilter('warehouse', activeWarehouses[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, activeWarehouses.length]);

  const [adjustTarget, setAdjustTarget] = useState<StockSummary | null>(null);

  const stock = useQuery({
    queryKey: ['stock', { q: debouncedQ, status: statusFilter, warehouseId, page }],
    queryFn: () =>
      listStockPaginated({
        q: debouncedQ || undefined,
        status: statusFilter || undefined,
        warehouseId: warehouseId || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !!warehouseId,
  });

  const items = stock.data?.items ?? [];
  const total = stock.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // El endpoint `/inventory/stock` no devuelve `coverUrl` en el producto.
  // Lo resolvemos fetcheando `/products` (que sí lo expone vía product_images)
  // y armando un map en memoria. Cacheado por react-query — una sola request
  // por sesión, compartida entre páginas del paginador y cambios de bodega.
  const productsForCovers = useQuery({
    queryKey: ['products', 'covers'],
    queryFn: () => listProducts({ pageSize: 1000 }),
    staleTime: 5 * 60 * 1000,
  });
  const coverByProductId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const p of productsForCovers.data?.items ?? []) {
      map.set(p.id, p.coverUrl ?? null);
    }
    return map;
  }, [productsForCovers.data]);

  // Contadores por estado dentro de la página actual.
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

  // Mutación para edición inline de locationCode (intacta).
  const locationMut = useMutation({
    mutationFn: (input: { productId: string; warehouseId: string; locationCode: string | null }) =>
      setStockLocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Ubicación actualizada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  function setStatus(next: 'ok' | 'low' | 'out' | '') {
    setFilters({ status: next || null, page: null });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ============================================================
          PAGE HEAD
          ============================================================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {currentWarehouse && (
              <>
                <span>
                  Mostrando stock de{' '}
                  <strong className="font-medium text-foreground">
                    {currentWarehouse.name}
                  </strong>
                </span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              </>
            )}
            <span>
              <strong className="font-medium tabular-nums text-foreground">
                {total}
              </strong>{' '}
              {total === 1 ? 'producto' : 'productos'}
            </span>
            {!stock.isLoading && totalPages > 1 && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>página {page} de {totalPages}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WarehousePicker
            warehouses={activeWarehouses}
            value={warehouseId}
            onChange={(id) => setFilters({ warehouse: id, page: null })}
          />
          {/* Ronda 10 — exportar a Excel con los filtros activos
              (la paginación se ignora; exporta todos los resultados).
              Ronda 12 — apuntar al API backend con `apiAbsoluteUrl`. */}
          <Button asChild variant="outline" size="sm">
            <a
              href={apiAbsoluteUrl(
                `inventory/stock.xlsx${buildStockExportQuery({
                  q: debouncedQ,
                  status: statusFilter || undefined,
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

      {/* ============================================================
          STATUS CHIPS — clicables como filtro (reemplaza el dropdown)
          ============================================================ */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip
          color="ink"
          label="Todos"
          count={total}
          active={statusFilter === ''}
          onClick={() => setStatus('')}
        />
        <StatusChip
          color="emerald"
          label="Con stock"
          count={counts.ok}
          active={statusFilter === 'ok'}
          onClick={() => setStatus('ok')}
        />
        <StatusChip
          color="amber"
          label="Bajo stock"
          count={counts.low}
          active={statusFilter === 'low'}
          onClick={() => setStatus('low')}
        />
        <StatusChip
          color="rose"
          label="Sin stock"
          count={counts.out}
          active={statusFilter === 'out'}
          onClick={() => setStatus('out')}
        />
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="relative flex h-10 max-w-[480px] flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-3 transition-shadow focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          placeholder="Buscar por SKU, código de barras, nombre o ubicación…"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {search.value && (
          <button
            type="button"
            onClick={() => search.setValue('')}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ============================================================
          TABLE
          ============================================================ */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-[56px_120px_minmax(220px,1.5fr)_110px_140px_110px_80px_140px_60px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span />
          <span>SKU</span>
          <span>Producto</span>
          <span>Ubicación</span>
          <span>Categoría</span>
          <span className="justify-self-end">Stock</span>
          <span className="justify-self-end">Mín</span>
          <span>Estado</span>
          <span />
        </div>

        {stock.isLoading && (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border-b px-4 py-4 last:border-b-0">
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        )}

        {!stock.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Package className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Sin productos en este filtro</p>
            <p className="max-w-[36ch] text-xs text-muted-foreground">
              {debouncedQ || statusFilter ? (
                <button
                  type="button"
                  onClick={() => setFilters({ q: null, status: null, page: null })}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Limpiar filtros
                </button>
              ) : (
                'Esta bodega no tiene productos registrados.'
              )}
            </p>
          </div>
        )}

        {!stock.isLoading &&
          items.map((row) => {
            const product = row.product;
            const cover = publicImageUrl(coverByProductId.get(product.id) ?? null);
            const barcode = product.barcode;
            return (
              <div
                key={product.id}
                className={cn(
                  'group grid grid-cols-[56px_120px_minmax(220px,1.5fr)_110px_140px_110px_80px_140px_60px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 hover:bg-accent/30',
                  row.status === 'out' && 'bg-rose-500/[0.03] hover:bg-rose-500/[0.06]',
                )}
              >
                <Link href={`/productos/${product.id}`} className="inline-block">
                  <ProductThumbnail src={cover} size={44} />
                </Link>
                <Link
                  href={`/productos/${product.id}`}
                  className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {product.sku}
                </Link>
                <div className="min-w-0">
                  <Link
                    href={`/productos/${product.id}`}
                    className="block truncate text-[13.5px] font-medium tracking-tight underline-offset-2 hover:underline"
                  >
                    {product.name}
                  </Link>
                  {barcode && (
                    <span className="mt-0.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {barcode}
                    </span>
                  )}
                </div>
                <LocationCell
                  initialValue={row.locationCode}
                  onSave={(value) =>
                    locationMut.mutate({
                      productId: product.id,
                      warehouseId: row.warehouseId,
                      locationCode: value,
                    })
                  }
                  pending={locationMut.isPending}
                />
                <span className="truncate text-sm text-muted-foreground">
                  {product.category?.name ?? '—'}
                </span>
                <StockCell qty={row.quantity} min={product.minStock} status={row.status} />
                <span className="justify-self-end font-mono text-xs text-muted-foreground tabular-nums">
                  {product.minStock}
                </span>
                <StatusBadge status={row.status} />
                <button
                  type="button"
                  onClick={() => setAdjustTarget(row)}
                  className="justify-self-end inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[11.5px] font-medium text-background transition-opacity hover:opacity-90"
                  title="Ajustar stock"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Ajustar
                </button>
              </div>
            );
          })}

        {!stock.isLoading && total > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Mostrando{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {items.length}
              </strong>{' '}
              de{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {total}
              </strong>{' '}
              · página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFilter('page', String(Math.min(totalPages, page + 1)))
                }
                disabled={page >= totalPages}
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          ADJUST DIALOG (intacto)
          ============================================================ */}
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

/* ============================================================
   WAREHOUSE PICKER — pill con popover (reemplaza el Select)
   ============================================================ */
function WarehousePicker({
  warehouses,
  value,
  onChange,
}: {
  warehouses: WarehouseDto[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = warehouses.find((w) => w.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-xs shadow-sm transition-colors hover:bg-accent"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <WarehouseIcon className="h-3 w-3" />
          </span>
          <span className="flex flex-col leading-tight text-left">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bodega activa
            </span>
            <span className="text-[12.5px] font-semibold text-foreground">
              {current?.name ?? 'Elegir…'}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-2">
        <p className="mb-1 border-b px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Cambiar bodega
        </p>
        <div className="space-y-0.5">
          {warehouses.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                onChange(w.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[12.5px] hover:bg-accent"
            >
              <span
                className={cn(
                  'inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px]',
                  w.id === value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card',
                )}
              >
                {w.id === value && <Check className="h-2 w-2" strokeWidth={3} />}
              </span>
              <span className="flex-1 font-medium">{w.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   STATUS CHIP — clicable como filtro
   ============================================================ */
function StatusChip({
  color,
  label,
  count,
  active,
  onClick,
}: {
  color: 'ink' | 'emerald' | 'amber' | 'rose';
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const ledClass = {
    ink: 'bg-foreground',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
  }[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3.5 text-xs shadow-sm transition-colors',
        'hover:bg-accent hover:text-foreground',
        active &&
          'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background',
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', ledClass)} />
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
          active
            ? 'bg-white/20 text-background dark:bg-black/20'
            : 'bg-muted text-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

/* ============================================================
   STOCK CELL — qty + barra visual vs min
   ============================================================ */
function StockCell({
  qty,
  min,
  status,
}: {
  qty: number;
  min: number;
  status: StockStatus;
}) {
  // qty=min → 50%, qty=2*min → 100%.
  const ratio = min > 0 ? Math.min(2, qty / min) : qty > 0 ? 2 : 0;
  const w = Math.min(100, ratio * 50);
  const barColor = {
    ok: 'bg-emerald-500',
    low: 'bg-amber-500',
    out: 'bg-rose-500',
  }[status];
  const qtyColor = {
    ok: 'text-foreground',
    low: 'text-amber-700 dark:text-amber-400',
    out: 'text-rose-600 dark:text-rose-400',
  }[status];
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={cn('font-mono text-sm font-semibold tabular-nums leading-none', qtyColor)}>
        {qty}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="h-1 w-9 overflow-hidden rounded-full bg-muted">
          <span className={cn('block h-full rounded-full', barColor)} style={{ width: `${w}%` }} />
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">/{min}</span>
      </div>
    </div>
  );
}

/* ============================================================
   STATUS BADGE
   ============================================================ */
function StatusBadge({ status }: { status: StockStatus }) {
  const map: Record<StockStatus, { label: string; cls: string }> = {
    ok: {
      label: 'OK',
      cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    },
    low: {
      label: 'Bajo stock',
      cls: 'bg-amber-500/14 text-amber-700 dark:text-amber-400',
    },
    out: {
      label: 'Sin stock',
      cls: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        cls,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/* ============================================================
   LOCATION CELL — edición inline (PRESERVADA de la lógica original)
   ============================================================ */
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
    if (next === previous) return;
    if (next === '' && previous === '') return;
    onSave(next);
  }

  if (editing) {
    return (
      <input
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
        disabled={pending}
        className="h-7 w-full rounded border bg-card px-2 font-mono text-xs outline-none focus:border-foreground"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'group/loc inline-flex items-center gap-1.5 rounded border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-accent',
        initialValue
          ? 'font-mono text-[11.5px] text-foreground/85'
          : 'text-[11.5px] italic text-muted-foreground',
      )}
      title="Click para editar"
    >
      {initialValue ?? 'definir'}
      <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/loc:opacity-100" />
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
