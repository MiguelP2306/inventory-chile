'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  initialIndex?: number;
  alt?: string;
}

/**
 * Lightbox reutilizable para galería de productos.
 * - Carrusel con flechas + indicadores de página + contador "n / total".
 * - Teclas: ← → para navegar, ESC para cerrar.
 * - SOLO se cierra con el botón "Cerrar"/"X" o ESC. Construido sobre Radix
 *   Dialog: el Content cubre toda la pantalla, así que NO existe un "fondo"
 *   que clickear → los mis-clicks ya no cierran nada. Además, al usar la pila
 *   de capas de Radix, funciona correctamente aún cuando se abre ANIDADO
 *   dentro de otro diálogo Radix (SoftModal del buscador, Sheet del bolso):
 *   antes el portal quedaba "fuera" del padre y cualquier click lo cerraba.
 * - Todas las imágenes se precargan al abrir para que el slider sea fluido.
 * - Si la lista llega vacía, no se abre.
 */
export function ProductImageLightbox({
  open,
  onOpenChange,
  images,
  initialIndex = 0,
  alt = '',
}: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
  }, [open, initialIndex, images.length]);

  const next = useCallback(() => {
    if (images.length === 0) return;
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const prev = useCallback(() => {
    if (images.length === 0) return;
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Flechas del teclado para navegar. ESC lo maneja Radix (cierra la capa top).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev]);

  // Precarga TODAS las imágenes al abrir para que cambiar de slide sea
  // instantáneo (sin el flash/espera que daba la sensación de "no hay más").
  useEffect(() => {
    if (!open) return;
    for (const url of images) {
      const img = new window.Image();
      img.src = url;
    }
  }, [open, images]);

  const hasImages = images.length > 0;
  const src = hasImages ? (images[index] ?? images[0]!) : '';
  const hasMultiple = images.length > 1;

  return (
    <DialogPrimitive.Root open={open && hasImages} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-black/95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-0 z-[9999] flex flex-col outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          {/* Título accesible (requerido por Radix), oculto visualmente. */}
          <DialogPrimitive.Title className="sr-only">
            {alt || 'Galería de imágenes del producto'}
          </DialogPrimitive.Title>

          {/* Top bar: contador + botón Cerrar pill visible */}
          <div className="flex items-center justify-between px-5 py-4 sm:px-8">
            <span className="rounded-full bg-white/10 px-3 py-1.5 font-mono text-xs font-semibold text-white">
              {hasMultiple ? `${index + 1} / ${images.length}` : 'Foto'}
            </span>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-lg transition-all hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
                Cerrar
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Centro: imagen + flechas. `min-h-0` es clave: sin él el item flex
              no se encoge y la imagen desborda el viewport (se veía "cortada"). */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16">
            {hasMultiple && (
              <button
                type="button"
                onClick={prev}
                aria-label="Anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white shadow-lg backdrop-blur transition-all hover:bg-white/25 sm:left-6"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
            />

            {hasMultiple && (
              <button
                type="button"
                onClick={next}
                aria-label="Siguiente"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white shadow-lg backdrop-blur transition-all hover:bg-white/25 sm:right-6"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Bottom: dots indicadores */}
          {hasMultiple && (
            <div className="flex items-center justify-center pb-6 pt-2">
              <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Imagen ${i + 1} de ${images.length}`}
                    className={cn(
                      'h-2 rounded-full transition-all',
                      i === index
                        ? 'w-8 bg-white'
                        : 'w-2 bg-white/40 hover:bg-white/70',
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hint sutil para ESC en bottom-right */}
          <span className="pointer-events-none absolute bottom-4 right-5 hidden text-[10px] font-medium uppercase tracking-wider text-white/40 sm:block">
            ESC para cerrar
          </span>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
