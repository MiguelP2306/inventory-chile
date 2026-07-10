'use client';

/* ============================================================================
 *  InventarioPage (Stock) — REESTILIZADO con el sistema visual de
 *  "Operations.tsx" (vista stock). Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · useUrlFilters({ q, status, warehouse, page }) + useDebouncedUrlFilter.
 *   · El parámetro de URL `?warehouse=<id>` se respeta y persiste — al cambiar
 *     de bodega se reescribe el query param (URLs compartibles), igual que tu
 *     ?warehouse=e004bba7-... del ejemplo.
 *   · Auto-select de la primera bodega activa cuando no hay ?warehouse=.
 *   · listStockPaginated + setStockLocation (edición inline de ubicación).
 *   · AdjustStockDialog + export Excel vía apiAbsoluteUrl. Paginación real.
 *   · Resolución de coverUrl vía /products (map en memoria, cacheado).
 *
 *  CAMBIOS DE ESTILO (para igualar Operations.tsx):
 *   · Título font-black; subtítulo "Mostrando stock de {bodega} • {n}
 *     productos" con el conteo en azul #2F6BFF.
 *   · Selector "Bodega Activa" como caja rounded-2xl con chip Building
 *     (mantiene el Popover original con la lista de bodegas).
 *   · Exportar Excel: pill rounded-2xl con ícono emerald.
 *   · Pills de estado rounded-xl; activo = azul #2F6BFF texto blanco; resto
 *     blanco con punto de color + badge de conteo.
 *   · Search rounded-2xl. Tabla rounded-3xl con thumbnail rounded-2xl, chip de
 *     barcode, ubicación inline, celda Stock con barra vs mín, badge de estado
 *     (solo texto + punto, "Sin stock" con pulse) y botón "Ajustar" oscuro
 *     rounded-xl.
 *
 *  DEPENDENCIAS: idénticas. No agrega ninguna.
 * ========================================================================== */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Package,
  Pencil,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductThumbnail } from '@/components/product-thumbnail';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { apiAbsoluteUrl } from '@/lib/api';
import { pickDefaultWarehouse } from '@/lib/default-warehouse';
import { invalidateProductCaches } from '@/lib/invalidate-product-caches';
import { apiErrorMessage, publicImageUrl } from '@/lib/catalog-api';
import { listStockPaginated, setStockLocation } from '@/lib/inventory-api';
// ⚠️ NOTA: `adjustStock` es la función que tu antiguo <AdjustStockDialog>
// usaba internamente para registrar el movimiento de stock. Verificá el
// nombre/firma reales en tu '@/lib/inventory-api' y ajustá este import + la
// llamada en <AdjustStockModal> si difieren. Firma asumida:
//   adjustStock({ productId, warehouseId, delta, reason }) => Promise<...>
// donde `delta` es positivo (Entrada) o negativo (Salida).
import { adjustStock } from '@/lib/inventory-api';
import { cn } from '@/lib/utils';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarehouses } from '@/lib/warehouses-api';
import type { StockStatus, StockSummary, WarehouseDto } from '@inventory/shared';
import { AdjustStockDialog } from '@/components/adjust-stock-dialog';

const PAGE_SIZE = 50;
const ACCENT = '#2F6BFF';

export default function InventarioPage() {
  const qc = useQueryClient();

  const filters = useUrlFilters({ q: '', status: '', warehouse: '', page: '' });
  const { values, setFilter, setFilters } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const statusFilter: 'ok' | 'low' | 'out' | '' =
    (values.status as 'ok' | 'low' | 'out' | '') || '';
  const warehouseId = values.warehouse || '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  // Bodegas activas para el picker.
  const warehouses = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ active: 'true' }),
  });
  const activeWarehouses = (
    Array.isArray(warehouses.data)
      ? warehouses.data
      : (warehouses.data?.items ?? [])
  ) as WarehouseDto[];

  // Auto-select de la bodega por defecto ("Tienda") si no hay ?warehouse= en
  // la URL.
  useEffect(() => {
    if (warehouseId) return;
    const preferred = pickDefaultWarehouse(activeWarehouses);
    if (preferred) setFilter('warehouse', preferred.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, activeWarehouses.length]);

  const [adjustTarget, setAdjustTarget] = useState<StockSummary | null>(null);

  const stock = useQuery({
    queryKey: [
      'stock',
      { q: debouncedQ, status: statusFilter, warehouseId, page },
    ],
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

  // Contadores por estado (página actual).
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

  // Edición inline de locationCode (intacta).
  const locationMut = useMutation({
    mutationFn: (input: {
      productId: string;
      warehouseId: string;
      locationCode: string | null;
    }) => setStockLocation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Ubicación actualizada');
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  function setStatus(next: 'ok' | 'low' | 'out' | '') {
    setFilters({ status: next || null, page: null });
  }

  return (
    <div className="flex flex-col gap-5 text-slate-800 dark:text-slate-200">
      {/* ============================================================
          PAGE HEAD — título + bodega activa + export
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Inventario
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {currentWarehouse && (
              <>
                <span>
                  Mostrando stock de{' '}
                  <strong className="font-extrabold text-slate-800 dark:text-white">
                    {currentWarehouse.name}
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
              </>
            )}
            <span
              style={{ color: ACCENT }}
              className="font-bold tabular-nums dark:brightness-125"
            >
              {total.toLocaleString('es-CL')}{' '}
              {total === 1 ? 'producto' : 'productos'}
            </span>
            {!stock.isLoading && totalPages > 1 && (
              <>
                <span className="text-slate-300">•</span>
                <span>
                  página {page} de {totalPages}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <WarehousePicker
            warehouses={activeWarehouses}
            value={warehouseId}
            currentName={currentWarehouse?.name}
            onChange={(id) => setFilters({ warehouse: id, page: null })}
          />
          {/* Exportar Excel — endpoint con filtros activos (conservado). */}
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
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-[18px] w-[18px] text-emerald-500" />
            Exportar Excel
          </a>
        </div>
      </div>

      {/* ============================================================
          STATUS PILLS — filtro clicable (mismo ?status= URL param)
          ============================================================ */}
      <div className="flex flex-wrap items-center gap-2.5">
        <StatusPill label="Todos" count={total} active={statusFilter === ''} onClick={() => setStatus('')} />
        <StatusPill dot="bg-emerald-500" label="Con stock" count={counts.ok} active={statusFilter === 'ok'} onClick={() => setStatus('ok')} />
        <StatusPill dot="bg-amber-500" label="Bajo stock" count={counts.low} active={statusFilter === 'low'} onClick={() => setStatus('low')} />
        <StatusPill dot="bg-rose-500" label="Sin stock" count={counts.out} active={statusFilter === 'out'} onClick={() => setStatus('out')} />
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="relative max-w-[480px]">
        <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          placeholder="Buscar por SKU, código de barras, nombre o ubicación…"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-11 text-[12px] text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/10 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-200"
        />
        {search.value && (
          <button
            type="button"
            onClick={() => search.setValue('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ============================================================
          TABLE
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-[#11151C]">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="w-[55px] px-4 py-4" />
                <th className="w-[120px] px-3 py-4">SKU</th>
                <th className="px-3 py-4">Producto</th>
                <th className="px-3 py-4">Ubicación</th>
                <th className="px-3 py-4">Categoría</th>
                <th className="w-[110px] px-3 py-4">Stock</th>
                <th className="px-3 py-4 text-center">Mín</th>
                <th className="px-3 py-4 text-center">Estado</th>
                <th className="px-3 py-4 pr-5 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {stock.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4">
                      <Skeleton className="my-2 h-10 w-full" />
                    </td>
                  </tr>
                ))}

              {!stock.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <Package className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        Sin productos en este filtro
                      </p>
                      <p className="max-w-[36ch] text-xs text-slate-400">
                        {debouncedQ || statusFilter ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFilters({ q: null, status: null, page: null })
                            }
                            className="font-medium underline underline-offset-2 hover:text-slate-700"
                          >
                            Limpiar filtros
                          </button>
                        ) : (
                          'Esta bodega no tiene productos registrados.'
                        )}
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!stock.isLoading &&
                items.map((row) => {
                  const product = row.product;
                  const cover = publicImageUrl(product.coverUrl ?? null);
                  const barcode = product.barcode;
                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        'group transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/10',
                        row.status === 'out' && 'bg-rose-500/[0.03]',
                      )}
                    >
                      <td className="py-3 pl-4 pr-1">
                        <Link href={`/productos/${product.id}`} className="inline-block">
                          <ProductThumbnail src={cover} size={42} />
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/productos/${product.id}`}
                          className="select-all font-mono text-[11.5px] font-bold text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-500"
                        >
                          {product.sku}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/productos/${product.id}`} className="block underline-offset-2 hover:underline">
                          <h4 className="text-[12px] font-extrabold tracking-tight leading-snug text-slate-800 dark:text-slate-200">
                            {product.name}
                          </h4>
                        </Link>
                        {barcode && (
                          <div className="mt-1">
                            <span className="inline-flex select-all items-center rounded border border-slate-150 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                              {barcode}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
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
                      </td>
                      <td className="px-3 py-3 text-[11.5px] font-bold text-slate-500 dark:text-slate-400">
                        {product.category?.name ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        <StockCell qty={row.quantity} min={product.minStock} status={row.status} />
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11.5px] font-bold text-slate-500 dark:text-slate-400">
                        {product.minStock}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-center">
                          <StatusBadge status={row.status} />
                        </div>
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => setAdjustTarget(row)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#2F6BFF] px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition-all hover:bg-[#2F6BFF]/90"
                          title="Ajustar stock"
                        >
                          <SlidersHorizontal className="h-3 w-3 text-slate-300" />
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!stock.isLoading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-50 bg-slate-50/30 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/10">
            <span className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
              Mostrando{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {items.length}
              </strong>{' '}
              de{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {total.toLocaleString('es-CL')}
              </strong>{' '}
              • página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
                disabled={page === 1}
                className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                ‹ Anterior
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilter('page', String(Math.min(totalPages, page + 1)))
                }
                disabled={page >= totalPages}
                className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                Siguiente ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ADJUST DIALOG (intacto) */}
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
   ADJUST STOCK MODAL — diseño de Operations.tsx
   ============================================================
   · Header con ícono Sliders + SKU·nombre + cerrar.
   · Caja de contexto: stock actual en la bodega + badge de estado.
   · Tipo de ajuste (Entrada/Salida) + Cantidad.
   · Motivo, Ubicación física y Código de barras.
   · Preview del resultado proyectado.
   · Guardado real: `adjustStock` (cantidad) + `setStockLocation` (ubicación).
     La actualización de barcode requiere un endpoint propio — ver NOTA.
*/
function AdjustStockModal({
  target,
  warehouseName,
  onClose,
}: {
  target: StockSummary;
  warehouseName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const product = target.product;
  const currentStock = target.quantity;
  const minStock = product.minStock;
  const currentStatus = target.status;

  const [adjustType, setAdjustType] = useState<'Entrada' | 'Salida'>('Entrada');
  const [adjustQty, setAdjustQty] = useState(1);
  const [reason, setReason] = useState('Inventario Semanal Audita');
  const [location, setLocation] = useState(target.locationCode ?? '');
  const [barcode, setBarcode] = useState(product.barcode ?? '');

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const delta = adjustType === 'Entrada' ? adjustQty : -adjustQty;
  const resultingStock = Math.max(0, currentStock + delta);

  const statusBadgeCls = {
    ok: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-400',
    low: 'bg-amber-50 text-amber-500 dark:bg-amber-950/30 dark:text-amber-400',
    out: 'bg-rose-50 text-rose-500 dark:bg-rose-950/30 dark:text-rose-400',
  }[currentStatus];
  const statusLabel = { ok: 'Con stock', low: 'Bajo stock', out: 'Sin stock' }[
    currentStatus
  ];

  const mut = useMutation({
    mutationFn: async () => {
      // 1) Ubicación (función conocida).
      const nextLoc = location.trim() === '' ? null : location.trim().slice(0, 30);
      if (nextLoc !== (target.locationCode ?? null)) {
        await setStockLocation({
          productId: product.id,
          warehouseId: target.warehouseId,
          locationCode: nextLoc,
        });
      }
      // 2) Ajuste de cantidad (registra movimiento en el Kardex). `delta` ya
      // viene con signo (+ entrada / − salida); la API lo recibe como `qty`.
      if (delta !== 0) {
        await adjustStock({
          productId: product.id,
          warehouseId: target.warehouseId,
          qty: delta,
          reason: reason.trim() || 'Ajuste manual',
        });
      }
      // 3) Código de barras: si tu API expone una mutación para actualizarlo
      //    (p. ej. updateProduct), llamala acá. Se deja fuera por defecto
      //    para no asumir un endpoint inexistente.
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      invalidateProductCaches(qc);
      toast.success(
        `${product.sku} ajustado · nuevo stock: ${resultingStock} un.`,
      );
      onClose();
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo ajustar el stock')),
  });

  const inputCls =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition-all focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900 dark:text-white';
  const labelCls =
    'text-[10px] font-bold uppercase tracking-wider text-slate-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              <SlidersHorizontal className="h-[18px] w-[18px] text-[#2F6BFF]" />
              <span>Ajustar Stock de Bodega</span>
            </h4>
            <p className="mt-0.5 font-mono text-[10.5px] font-bold text-slate-400">
              {product.sku} • {product.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (adjustType === 'Salida' && currentStock < adjustQty) {
              toast.error(
                `No hay suficiente stock. Máximo a retirar: ${currentStock} un.`,
              );
              return;
            }
            mut.mutate();
          }}
          className="space-y-4 p-5"
        >
          {/* Contexto */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 font-bold dark:border-slate-800/80 dark:bg-slate-900">
            <div>
              <span className="block font-mono text-[9.5px] uppercase tracking-widest text-slate-400">
                Stock actual en {warehouseName}
              </span>
              <span className="font-mono text-[15px] font-black text-slate-800 dark:text-white">
                {currentStock} unidades
              </span>
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-center text-[10px] font-extrabold tracking-tight',
                statusBadgeCls,
              )}
            >
              ● {statusLabel}
            </span>
          </div>

          {/* Tipo + Cantidad */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelCls}>Tipo de Ajuste</label>
              <select
                value={adjustType}
                onChange={(e) =>
                  setAdjustType(e.target.value as 'Entrada' | 'Salida')
                }
                className={cn(inputCls, 'cursor-pointer font-bold')}
              >
                <option value="Entrada">Entrada (Sumar +)</option>
                <option value="Salida">Salida (Restar -)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Cantidad</label>
              <input
                type="number"
                required
                min={1}
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
                className={cn(inputCls, 'font-mono font-bold')}
              />
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-1">
            <label className={labelCls}>Motivo / Causa de Ajuste</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ej: Auditoría Interna Semanal"
              className={inputCls}
            />
          </div>

          {/* Ubicación */}
          <div className="space-y-1">
            <label className={labelCls}>
              Ubicación Física (ej: Pasillo A - Estante 2)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={30}
              placeholder="Establecer coordenadas de ubicación"
              className={inputCls}
            />
          </div>

          {/* Código de barras */}
          <div className="space-y-1">
            <label className={labelCls}>
              Código de Barras Universal (EAN/GTIN)
            </label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="ej: 7891234567890"
              className={cn(inputCls, 'font-mono')}
            />
          </div>

          {/* Preview resultado */}
          <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            <span>Resultado final proyectado:</span>
            <div className="text-right">
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {currentStock} {adjustType === 'Entrada' ? '+' : '-'} {adjustQty}{' '}
                =
              </span>{' '}
              <span
                className={cn(
                  'font-mono text-[13.5px] font-black',
                  resultingStock < minStock
                    ? 'text-amber-500'
                    : 'text-emerald-500',
                )}
              >
                {resultingStock} unidades
              </span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={mut.isPending}
            className="w-full rounded-2xl bg-[#2F6BFF] py-3.5 text-center text-xs font-extrabold text-white shadow-md transition-all hover:bg-[#2F6BFF]/90 disabled:opacity-60"
          >
            {mut.isPending ? 'Guardando…' : 'Confirmar Ajuste y Loguear Kardex'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   WAREHOUSE PICKER — caja "Bodega Activa" rounded-2xl + Popover
   ============================================================ */
function WarehousePicker({
  warehouses,
  value,
  currentName,
  onChange,
}: {
  warehouses: WarehouseDto[];
  value: string;
  currentName?: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#11151C] dark:hover:bg-slate-800"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            <Building2 className="h-[18px] w-[18px]" />
          </span>
          <span className="select-none pr-6">
            <span className="block font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Bodega Activa
            </span>
            <span className="block max-w-[160px] truncate text-[12px] font-extrabold leading-tight text-slate-800 dark:text-white">
              {currentName ?? 'Elegir…'}
            </span>
          </span>
          <ChevronDown className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] rounded-2xl p-2">
        <p className="mb-1 border-b px-2 pb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
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
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[12.5px] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span
                className={cn(
                  'inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px]',
                  w.id === value
                    ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                    : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900',
                )}
              >
                {w.id === value && <Check className="h-2 w-2" strokeWidth={3} />}
              </span>
              <span className="flex-1 font-semibold">{w.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   STATUS PILL — filtro clicable
   ============================================================ */
function StatusPill({
  dot,
  label,
  count,
  active,
  onClick,
}: {
  dot?: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[11.5px] font-bold transition-all',
        active
          ? 'bg-[#2F6BFF] text-white shadow-md'
          : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {dot && <span className={cn('h-2 w-2 rounded-full', dot)} />}
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
          active
            ? 'bg-slate-800 text-white dark:bg-slate-300 dark:text-slate-900'
            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
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
  const ratio = Math.min(100, (qty / (min || 1)) * 105);
  const barColor = {
    ok: 'bg-emerald-500',
    low: 'bg-amber-500',
    out: 'bg-rose-500',
  }[status];
  const qtyColor = {
    ok: 'text-slate-900 dark:text-white',
    low: 'text-amber-500',
    out: 'text-rose-500',
  }[status];
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-0.5">
        <span className={cn('font-mono text-[13.5px] font-extrabold tabular-nums', qtyColor)}>
          {qty}
        </span>
        <span className="text-[10px] font-bold text-slate-400">/{min}</span>
      </div>
      <div className="mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span className={cn('block h-full rounded-full', barColor)} style={{ width: `${ratio || 4}%` }} />
      </div>
    </div>
  );
}

/* ============================================================
   STATUS BADGE — solo texto + punto (estilo Operations)
   ============================================================ */
function StatusBadge({ status }: { status: StockStatus }) {
  const map: Record<StockStatus, { label: string; cls: string; dot: string; pulse?: boolean }> = {
    ok: { label: 'OK', cls: 'text-emerald-500', dot: 'bg-emerald-500' },
    low: { label: 'Bajo stock', cls: 'text-amber-500', dot: 'bg-amber-500' },
    out: { label: 'Sin stock', cls: 'text-rose-500', dot: 'bg-rose-500', pulse: true },
  };
  const { label, cls, dot, pulse } = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-black', cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot, pulse && 'animate-pulse')} />
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
        className="h-7 w-full rounded-lg border border-slate-200 bg-white px-2 font-mono text-xs outline-none focus:border-[#2F6BFF] dark:border-slate-700 dark:bg-slate-900"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        'group/loc inline-flex items-center gap-1.5 text-left text-[11.5px] font-semibold transition-all hover:underline',
        initialValue
          ? 'text-slate-600 dark:text-slate-300'
          : 'italic font-medium text-slate-400',
      )}
      title="Click para editar ubicación"
    >
      {initialValue ?? 'definir'}
      <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/loc:opacity-100" />
    </button>
  );
}

/* ============================================================
   Query string del endpoint /inventory/stock.xlsx (idéntico)
   ============================================================ */
function buildStockExportQuery(
  params: Record<string, string | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
