'use client';

import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  ListChecks,
  Package,
  Pencil,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProductImageLightbox } from '@/components/product-image-lightbox';
import { ProductThumbnail } from '@/components/product-thumbnail';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { listProductImages, publicImageUrl } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { listStock } from '@/lib/inventory-api';
import { useProductBag } from '@/lib/use-product-bag';
import { cn } from '@/lib/utils';
import { listWarehouses } from '@/lib/warehouses-api';

/**
 * Botón del header que abre el drawer del bolso. Muestra un badge con la
 * cantidad total de unidades. Cuando el bolso está vacío, el badge no se
 * renderiza para no llenar el header de adornos.
 */
export function ProductBagButton() {
  const [open, setOpen] = useState(false);
  const { items, count, setQty, remove, clear } = useProductBag();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Bolso (${count} unidades)`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-500 transition-colors hover:text-slate-800 dark:border-slate-800 dark:bg-[#161B22] dark:text-slate-400 dark:hover:text-white"
        >
          <ShoppingBag className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-white bg-[#2F6BFF] px-1 text-[9px] font-extrabold leading-none text-white dark:border-[#161B22]">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full max-w-md overflow-y-auto p-0 sm:max-w-md"
      >
        <BagDrawerBody
          items={items}
          onClose={() => setOpen(false)}
          onSetQty={setQty}
          onRemove={remove}
          onClear={clear}
        />
      </SheetContent>
    </Sheet>
  );
}

function BagDrawerBody({
  items,
  onClose,
  onSetQty,
  onRemove,
  onClear,
}: {
  items: ReturnType<typeof useProductBag>['items'];
  onClose: () => void;
  onSetQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);

  // Modo selección: apagado por default → el bolso se ve y se comporta como
  // antes (convierte TODO). Al prenderlo aparecen los checkboxes para elegir
  // un subconjunto.
  const [selectionMode, setSelectionMode] = useState(false);
  function enterSelection() {
    setDeselected(new Set()); // arranca con todos marcados
    setSelectionMode(true);
  }

  // Selección de subconjunto: por defecto todos seleccionados. Guardamos los
  // DESelecionados, así los productos nuevos entran ya marcados.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const isSelected = (id: string) => !deselected.has(id);
  function toggleSelected(id: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectedItems = items.filter((it) => isSelected(it.productId));
  const allSelected = items.length > 0 && selectedItems.length === items.length;
  function toggleAll() {
    setDeselected(
      allSelected ? new Set(items.map((i) => i.productId)) : new Set(),
    );
  }
  // En modo selección operamos sobre lo elegido; si no, sobre TODO el bolso.
  const effectiveItems = selectionMode ? selectedItems : items;
  const effectiveTotal = effectiveItems.reduce(
    (acc, it) => acc + Number(it.unitPrice) * it.qty,
    0,
  );
  // Guardamos el productId (no la url) para poder cargar TODAS sus fotos.
  const [lightboxProductId, setLightboxProductId] = useState<string | null>(
    null,
  );

  // Stock vivo de los productos del bolso, desglosado por bodega. Solo corre
  // cuando el drawer está montado (Radix desmonta el contenido al cerrar).
  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(),
    staleTime: 5 * 60 * 1000,
    select: (rows) => (Array.isArray(rows) ? rows : rows.items),
  });
  const warehouseNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of warehouses.data ?? []) m.set(w.id, w.name);
    return m;
  }, [warehouses.data]);

  const stock = useQuery({
    queryKey: ['bag-stock'],
    queryFn: () => listStock({ q: undefined }),
    staleTime: 30 * 1000,
    enabled: items.length > 0,
  });
  const stockByProduct = useMemo(() => {
    const m = new Map<
      string,
      { warehouseId: string; quantity: number; locationCode: string | null }[]
    >();
    const rows = Array.isArray(stock.data) ? stock.data : [];
    for (const r of rows) {
      const arr = m.get(r.product.id) ?? [];
      arr.push({
        warehouseId: r.warehouseId,
        quantity: r.quantity,
        locationCode: r.locationCode,
      });
      m.set(r.product.id, arr);
    }
    return m;
  }, [stock.data]);

  // Todas las imágenes del producto cuyo lightbox está abierto.
  const lightboxImagesQ = useQuery({
    queryKey: ['product-images', lightboxProductId],
    queryFn: () => listProductImages(lightboxProductId as string),
    enabled: lightboxProductId != null,
    staleTime: 30 * 1000,
  });
  const lightboxImages = useMemo(() => {
    const fromApi = (lightboxImagesQ.data ?? [])
      .map((i) => publicImageUrl(i.url) ?? '')
      .filter(Boolean);
    if (fromApi.length > 0) return fromApi;
    // Fallback mientras carga (o si no hay registro de imágenes): la portada
    // que ya viene en el item del bolso (ya es URL absoluta).
    const cover = items.find((i) => i.productId === lightboxProductId)?.coverUrl;
    return cover ? [cover] : [];
  }, [lightboxImagesQ.data, items, lightboxProductId]);

  function goToFlow(target: 'quotation' | 'sale') {
    const ids = effectiveItems.map((i) => i.productId);
    if (ids.length === 0) return;
    onClose();
    // La página destino lee del bolso con useProductBag(); `fromBag=1` le dice
    // que prellene la lista. En modo selección agregamos `bagIds` para acotar a
    // los elegidos; sin modo selección se convierten todos (como antes).
    const idsParam = selectionMode
      ? `&bagIds=${ids.map(encodeURIComponent).join(',')}`
      : '';
    const path =
      target === 'quotation'
        ? `/cotizaciones?new=1&fromBag=1${idsParam}`
        : `/ventas/nueva?fromBag=1${idsParam}`;
    router.push(path);
  }

  return (
    <>
      <SheetHeader className="border-b px-5 py-4 pr-12">
        <SheetTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4 shrink-0" />
          <span className="flex-1">Bolso de productos</span>
          <span className="mr-2 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </SheetTitle>
      </SheetHeader>

      <div className="flex h-full flex-col">
        {items.length > 0 &&
          (selectionMode ? (
            <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-2.5">
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer accent-[#2F6BFF]"
                />
                Seleccionar todo
              </label>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium text-muted-foreground">
                  <strong className="font-bold text-foreground tabular-nums">
                    {selectedItems.length}
                  </strong>{' '}
                  de {items.length}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectionMode(false)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Salir
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end border-b px-5 py-2">
              <button
                type="button"
                onClick={enterSelection}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ListChecks className="h-3.5 w-3.5" />
                Seleccionar productos
              </button>
            </div>
          ))}
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">Bolso vacío</p>
            <p className="max-w-[28ch] text-xs text-muted-foreground">
              Buscá productos con el ícono de búsqueda o ⌘K y agregalos acá.
              Después podés convertirlos en cotización o venta.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => {
              const lineTotal = Number(it.unitPrice) * it.qty;
              const stockRows = stockByProduct.get(it.productId) ?? [];
              const totalStock = stockRows.reduce((a, r) => a + r.quantity, 0);
              return (
                <li
                  key={it.productId}
                  className={cn(
                    'flex items-start gap-3 px-5 py-4 transition-opacity',
                    selectionMode &&
                      !isSelected(it.productId) &&
                      'opacity-45',
                  )}
                >
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={isSelected(it.productId)}
                      onChange={() => toggleSelected(it.productId)}
                      aria-label={`Seleccionar ${it.name}`}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#2F6BFF]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      it.coverUrl && setLightboxProductId(it.productId)
                    }
                    aria-label="Ver imágenes ampliadas"
                    className={cn(
                      'shrink-0 overflow-hidden rounded-md border bg-muted',
                      it.coverUrl && 'cursor-zoom-in',
                    )}
                  >
                    <ProductThumbnail src={it.coverUrl} size={56} />
                  </button>
                  <div className="min-w-0 flex-1">
                    {/* Nombre como texto plano — NO navega a editar (eso es lo
                        que hace el lápiz de la derecha). */}
                    <p className="block truncate text-sm font-semibold">
                      {it.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {it.sku ?? '—'}
                    </p>

                    {/* Stock actual + bodega(s) de donde sale */}
                    <div className="mt-1.5 text-[11px]">
                      {stock.isLoading ? (
                        <span className="text-muted-foreground">
                          Cargando stock…
                        </span>
                      ) : stockRows.length === 0 ? (
                        <span className="font-semibold text-rose-500">
                          Sin stock registrado
                        </span>
                      ) : (
                        <>
                          <span className="font-semibold text-foreground">
                            Stock actual:{' '}
                            <span className="font-mono tabular-nums">
                              {totalStock} un.
                            </span>
                          </span>
                          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                            {stockRows.map((r) => (
                              <li
                                key={r.warehouseId}
                                className="flex items-center gap-1"
                              >
                                <Warehouse className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {warehouseNameById.get(r.warehouseId) ??
                                    'Bodega'}
                                  {r.locationCode ? ` · ${r.locationCode}` : ''}
                                </span>
                                <span className="ml-auto font-mono tabular-nums">
                                  {r.quantity} un.
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSetQty(it.productId, it.qty - 1)}
                        aria-label="Restar uno"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-sm font-bold hover:bg-muted"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n >= 0) {
                            onSetQty(it.productId, Math.floor(n));
                          }
                        }}
                        className="h-7 w-14 rounded-md border bg-background px-2 text-center font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => onSetQty(it.productId, it.qty + 1)}
                        aria-label="Sumar uno"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-sm font-bold hover:bg-muted"
                      >
                        +
                      </button>
                      <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(it.unitPrice)} c/u
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatCurrency(String(lineTotal))}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/productos/${it.productId}`}
                        onClick={onClose}
                        aria-label="Editar producto"
                        title="Editar producto"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onRemove(it.productId)}
                        aria-label="Quitar del bolso"
                        title="Quitar del bolso"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {items.length > 0 && (
          <div className="sticky bottom-0 border-t bg-background/95 px-5 py-4 backdrop-blur">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total estimado
                {selectionMode && (
                  <span className="ml-1 normal-case tracking-normal text-muted-foreground/70">
                    ({effectiveItems.length}{' '}
                    {effectiveItems.length === 1 ? 'producto' : 'productos'})
                  </span>
                )}
              </span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {formatCurrency(String(effectiveTotal))}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => goToFlow('quotation')}
                disabled={effectiveItems.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileText className="h-3.5 w-3.5" />
                Crear cotización
              </button>
              <button
                type="button"
                onClick={() => goToFlow('sale')}
                disabled={effectiveItems.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2F6BFF] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#2F6BFF]/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                Crear venta
              </button>
            </div>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="mt-2 w-full text-center text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            >
              Vaciar bolso
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="¿Vaciar el bolso?"
        description="Se quitarán todos los productos del bolso. Esta acción no afecta el catálogo."
        confirmLabel="Vaciar"
        variant="destructive"
        onConfirm={() => onClear()}
      />

      <ProductImageLightbox
        open={lightboxProductId != null}
        onOpenChange={(o) => !o && setLightboxProductId(null)}
        images={lightboxImages}
      />
    </>
  );
}
