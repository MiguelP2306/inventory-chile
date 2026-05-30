'use client';

import { useQuery } from '@tanstack/react-query';
import { Box, Loader2, Minus, Package, Plus, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductImageLightbox } from '@/components/product-image-lightbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getProduct,
  listProductImages,
  publicImageUrl,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { listStock } from '@/lib/inventory-api';
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
  const { add } = useProductBag();

  useEffect(() => {
    // Resetear el visor de imágenes en cada apertura/cierre del diálogo: si no,
    // al cerrar y volver a buscar otro producto el lightbox quedaba "abierto"
    // con el índice anterior y se mostraba solo, sin que el usuario lo pidiera.
    setLightboxIndex(null);
    if (open) setQty(1);
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

  const stock = useQuery({
    queryKey: ['product-stock', productId],
    queryFn: () => listStock({ q: undefined }),
    enabled: open,
    staleTime: 30 * 1000,
    select: (rows) =>
      Array.isArray(rows)
        ? rows.filter((r) => r.product.id === productId)
        : [],
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

  function handleAdd() {
    if (!product.data) return;
    add({
      productId: product.data.id,
      sku: product.data.sku,
      name: product.data.name,
      unitPrice: product.data.price,
      qty,
      coverUrl: publicImageUrl(product.data.coverUrl ?? null),
    });
    toast.success(`Agregado al bolso (${qty} un.)`);
    onClose();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-3.5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Box className="h-4 w-4 text-[#2F6BFF]" />
              Agregar al bolso
            </DialogTitle>
          </DialogHeader>

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
                  ) : (stock.data ?? []).length === 0 ? (
                    <p className="mt-1 font-mono text-sm font-bold text-rose-500">
                      Sin stock registrado
                    </p>
                  ) : (
                    <>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">
                        {totalStock} un.
                      </p>
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {(stock.data ?? []).map((s) => (
                          <li
                            key={`${s.product.id}-${s.warehouseId}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate">
                              {warehouseNameById.get(s.warehouseId) ??
                                'Bodega'}
                              {s.locationCode ? (
                                <span className="text-muted-foreground/70">
                                  {' · '}Ubic.: {s.locationCode}
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono font-semibold">
                              {s.quantity} un.
                            </span>
                          </li>
                        ))}
                      </ul>
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

          <DialogFooter className="border-t bg-muted/30 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border bg-background px-3 py-2 text-xs font-bold hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!product.data}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2F6BFF] px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-[#2F6BFF]/90 disabled:opacity-60"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Agregar al bolso
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductImageLightbox
        open={lightboxIndex != null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
        images={imageUrls}
        initialIndex={lightboxIndex ?? 0}
      />
    </>
  );
}
