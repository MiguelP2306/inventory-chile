'use client';

import { useQuery } from '@tanstack/react-query';
import { Box, Loader2, Minus, Package, Plus, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductImageLightbox } from '@/components/product-image-lightbox';
import {
  SoftModal,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import {
  getProduct,
  getProductStock,
  listProductImages,
  publicImageUrl,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { listWarehouses } from '@/lib/warehouses-api';
import { useProductBag } from '@/lib/use-product-bag';
import { cn } from '@/lib/utils';

interface Props {
  productId: string | null;
  onClose: () => void;
}

/**
 * Diálogo que se abre cuando el operador elige un producto desde el
 * buscador global. Muestra código, descripción, precio, stock por bodega,
 * cantidad y fotos. Al confirmar, agrega el producto al bolso (localStorage).
 *
 * Carga datos lazy: solo dispara las queries cuando `productId` deja de
 * ser null. Esto evita prefetcheos cuando el dialog está cerrado.
 */
export function AddToBagDialog({ productId, onClose }: Props) {
  const open = productId != null;
  const [qty, setQty] = useState(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Bodega seleccionada en el modal. Visual: cambia el stock/ubicación que se
  // muestra, no afecta a la venta (la venta elige su bodega aparte).
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const { add } = useProductBag();

  useEffect(() => {
    // Resetear el visor de imágenes en cada apertura/cierre del diálogo: si no,
    // al cerrar y volver a buscar otro producto el lightbox quedaba "abierto"
    // con el índice anterior y se mostraba solo, sin que el usuario lo pidiera.
    setLightboxIndex(null);
    if (open) {
      setQty(1);
      setSelectedWarehouseId('');
    }
  }, [open]);

  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId as string),
    enabled: open,
    staleTime: 30 * 1000,
  });

  // Bodegas para mostrar el NOMBRE en vez del UUID en el desglose de stock.
  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
    select: (rows) => (Array.isArray(rows) ? rows : rows.items),
  });
  const warehouseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warehouses.data ?? []) map.set(w.id, w.name);
    return map;
  }, [warehouses.data]);

  const images = useQuery({
    queryKey: ['product-images', productId],
    queryFn: () => listProductImages(productId as string),
    enabled: open,
    staleTime: 30 * 1000,
  });

  // Desglose de stock en TODAS las bodegas (no solo la activa). Endpoint
  // dedicado para que el modal no dependa de la bodega activa del inventario.
  const stock = useQuery({
    queryKey: ['product-stock-breakdown', productId],
    queryFn: () => getProductStock(productId as string),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const imageUrls = useMemo(
    () =>
      (images.data ?? [])
        .map((i) => publicImageUrl(i.url) ?? '')
        .filter(Boolean),
    [images.data],
  );

  const totalStock = useMemo(
    () => (stock.data ?? []).reduce((acc, s) => acc + s.quantity, 0),
    [stock.data],
  );

  const stockRows = stock.data ?? [];

  // Filas de bodega para el selector: TODAS las bodegas activas (con 0 si el
  // producto no tiene stock ahí) + cualquier bodega que tenga stock aunque esté
  // inactiva. Así el operador ve siempre todas las bodegas, no solo donde hay
  // existencias.
  const warehouseRows = useMemo(() => {
    const stockByWh = new Map(stockRows.map((s) => [s.warehouseId, s]));
    const active = (warehouses.data ?? []).filter((w) => w.isActive);
    const rows = active.map((w) => {
      const s = stockByWh.get(w.id);
      return {
        warehouseId: w.id,
        name: w.name,
        address: w.address ?? null,
        quantity: s?.quantity ?? 0,
        locationCode: s?.locationCode ?? null,
      };
    });
    // Bodegas con stock que no estén en la lista de activas (ej. inactivas).
    const seen = new Set(rows.map((r) => r.warehouseId));
    for (const s of stockRows) {
      if (seen.has(s.warehouseId)) continue;
      rows.push({
        warehouseId: s.warehouseId,
        name: warehouseNameById.get(s.warehouseId) ?? 'Bodega',
        address: null,
        quantity: s.quantity,
        locationCode: s.locationCode,
      });
    }
    return rows;
  }, [warehouses.data, stockRows, warehouseNameById]);

  // Default de la bodega seleccionada: la que tenga más stock (la más útil para
  // despachar). Se setea cuando llegan las bodegas y aún no hay selección.
  useEffect(() => {
    if (selectedWarehouseId || warehouseRows.length === 0) return;
    const top = [...warehouseRows].sort((a, b) => b.quantity - a.quantity)[0];
    if (top) setSelectedWarehouseId(top.warehouseId);
  }, [warehouseRows, selectedWarehouseId]);

  const selectedStock = useMemo(
    () =>
      warehouseRows.find((s) => s.warehouseId === selectedWarehouseId) ?? null,
    [warehouseRows, selectedWarehouseId],
  );

  function handleAdd() {
    if (!product.data) return;
    add({
      productId: product.data.id,
      sku: product.data.sku,
      name: product.data.name,
      partNumber: product.data.partNumber,
      unitPrice: product.data.price,
      qty,
      coverUrl: publicImageUrl(product.data.coverUrl ?? null),
      // Bodega elegida en el selector (la usa el bolso y, al crear venta, para
      // predefinir la bodega).
      warehouseId: selectedStock?.warehouseId ?? null,
      warehouseName: selectedStock?.name ?? null,
      warehouseAddress: selectedStock?.address ?? null,
      locationCode: selectedStock?.locationCode ?? null,
      warehouseQty: selectedStock?.quantity ?? null,
    });
    toast.success(`Agregado al bolso (${qty} un.)`);
    onClose();
  }

  return (
    <>
      <SoftModal
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title="Agregar al bolso"
        subtitle="Revisá precio, stock y cantidad antes de agregar"
        icon={<Box className="h-5 w-5" />}
        size="xl"
      >
          {product.isLoading ? (
            <div className="flex items-center justify-center px-6 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !product.data ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Producto no encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-0 md:grid-cols-[260px_1fr]">
              {/* Imagen */}
              <button
                type="button"
                onClick={() => imageUrls.length > 0 && setLightboxIndex(0)}
                aria-label={
                  imageUrls.length > 0 ? 'Ver imagen ampliada' : undefined
                }
                disabled={imageUrls.length === 0}
                className={cn(
                  'relative aspect-square w-full overflow-hidden bg-muted md:aspect-auto md:border-r',
                  imageUrls.length > 0 && 'cursor-zoom-in',
                )}
              >
                {product.data.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={publicImageUrl(product.data.coverUrl) ?? ''}
                    alt={product.data.name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <Package className="h-14 w-14" />
                  </div>
                )}
                {imageUrls.length > 1 && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold text-white">
                    +{imageUrls.length - 1} foto{imageUrls.length > 2 ? 's' : ''}
                  </span>
                )}
              </button>

              {/* Detalles */}
              <div className="flex flex-col gap-3 p-5">
                <div>
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {product.data.sku ?? '—'}
                  </p>
                  <h3 className="mt-0.5 text-lg font-bold tracking-tight">
                    {product.data.name}
                  </h3>
                  {product.data.partNumber && (
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                      N° de parte:{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {product.data.partNumber}
                      </span>
                    </p>
                  )}
                  {product.data.description && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {product.data.description}
                    </p>
                  )}
                </div>

                <div className="flex items-baseline justify-between border-y py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Precio
                  </span>
                  <span className="font-mono text-2xl font-bold tabular-nums">
                    {formatCurrency(product.data.price)}
                  </span>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Stock disponible
                  </p>
                  {stock.isLoading ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cargando…
                    </p>
                  ) : stockRows.length === 0 ? (
                    <p className="mt-1 font-mono text-sm font-bold text-rose-500">
                      Sin stock registrado
                    </p>
                  ) : (
                    <>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">
                        {totalStock} un.
                        <span className="ml-2 align-middle text-[11px] font-normal text-muted-foreground">
                          en total
                        </span>
                      </p>

                      {/* Selector de bodega (visual): cambia el stock y la
                          ubicación que se muestran abajo. */}
                      <div className="mt-2 flex flex-col gap-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Bodega
                        </label>
                        <select
                          value={selectedWarehouseId}
                          onChange={(e) =>
                            setSelectedWarehouseId(e.target.value)
                          }
                          className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-primary"
                        >
                          {warehouseRows.map((w) => (
                            <option key={w.warehouseId} value={w.warehouseId}>
                              {w.name} ({w.quantity} un.)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Detalle dinámico de la bodega seleccionada. */}
                      {selectedStock && (
                        <div className="mt-2 space-y-2 rounded-lg border bg-muted/30 p-2.5 text-[11px]">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="block text-muted-foreground">
                                Stock en bodega
                              </span>
                              <span className="font-mono text-sm font-bold tabular-nums">
                                {selectedStock.quantity} un.
                              </span>
                            </div>
                            <div>
                              <span className="block text-muted-foreground">
                                Ubicación física
                              </span>
                              <span className="font-mono text-sm font-bold">
                                {selectedStock.locationCode ?? '—'}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="block text-muted-foreground">
                              Dirección de la bodega
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              {selectedStock.address ?? '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cantidad
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      aria-label="Restar uno"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= 1) {
                          setQty(Math.floor(n));
                        }
                      }}
                      className="h-9 w-20 rounded-md border bg-background px-2 text-center font-mono text-sm font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setQty(qty + 1)}
                      aria-label="Sumar uno"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                      ={' '}
                      {formatCurrency(
                        String(Number(product.data.price) * qty),
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/10">
            <button
              type="button"
              onClick={onClose}
              className={softSecondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!product.data}
              className={`${softPrimaryButtonClass} inline-flex w-auto items-center gap-2 px-4 py-2.5`}
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Agregar al bolso
            </button>
          </div>
      </SoftModal>

      <ProductImageLightbox
        open={lightboxIndex != null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
        images={imageUrls}
        initialIndex={lightboxIndex ?? 0}
      />
    </>
  );
}
