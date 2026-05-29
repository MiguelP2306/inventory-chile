'use client';

import {
  FileText,
  Package,
  Pencil,
  ShoppingBag,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { formatCurrency } from '@/lib/format';
import { useProductBag } from '@/lib/use-product-bag';
import { cn } from '@/lib/utils';

/**
 * Botón del header que abre el drawer del bolso. Muestra un badge con la
 * cantidad total de unidades. Cuando el bolso está vacío, el badge no se
 * renderiza para no llenar el header de adornos.
 */
export function ProductBagButton() {
  const [open, setOpen] = useState(false);
  const { items, count, totalAmount, setQty, remove, clear } = useProductBag();

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
          totalAmount={totalAmount}
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
  totalAmount,
  onClose,
  onSetQty,
  onRemove,
  onClear,
}: {
  items: ReturnType<typeof useProductBag>['items'];
  totalAmount: number;
  onClose: () => void;
  onSetQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const [confirmClear, setConfirmClear] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  function goToFlow(target: 'quotation' | 'sale') {
    if (items.length === 0) return;
    onClose();
    // La página destino lee del bolso con useProductBag(); el query param
    // `fromBag=1` solo le dice al form que prelene la lista de items.
    const path =
      target === 'quotation'
        ? '/cotizaciones?new=1&fromBag=1'
        : '/ventas/nueva?fromBag=1';
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
              return (
                <li
                  key={it.productId}
                  className="flex items-start gap-3 px-5 py-4"
                >
                  <button
                    type="button"
                    onClick={() => it.coverUrl && setLightboxSrc(it.coverUrl)}
                    aria-label="Ver imagen ampliada"
                    className={cn(
                      'shrink-0 overflow-hidden rounded-md border bg-muted',
                      it.coverUrl && 'cursor-zoom-in',
                    )}
                  >
                    <ProductThumbnail src={it.coverUrl} size={56} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/productos/${it.productId}`}
                      onClick={onClose}
                      className="block truncate text-sm font-semibold underline-offset-2 hover:underline"
                    >
                      {it.name}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {it.sku ?? '—'}
                    </p>
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
              </span>
              <span className="font-mono text-lg font-bold tabular-nums">
                {formatCurrency(String(totalAmount))}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => goToFlow('quotation')}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileText className="h-3.5 w-3.5" />
                Crear cotización
              </button>
              <button
                type="button"
                onClick={() => goToFlow('sale')}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2F6BFF] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#2F6BFF]/90"
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
        open={lightboxSrc != null}
        onOpenChange={(o) => !o && setLightboxSrc(null)}
        images={lightboxSrc ? [lightboxSrc] : []}
      />
    </>
  );
}
