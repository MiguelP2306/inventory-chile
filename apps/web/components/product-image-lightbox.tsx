'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * - Click en el fondo cierra. Click en la imagen NO cierra (para no
 *   gatillar accidentalmente al elegir un slide).
 * - Si la lista llega vacía, no se renderiza nada.
 * - Se monta con `createPortal` directo a `document.body` para escapar
 *   stacking contexts del layout (header sticky, sidebar, etc.) que
 *   antes hacían que el overlay quedase por debajo y el botón Cerrar no
 *   apareciera.
 */
export function ProductImageLightbox({
  open,
  onOpenChange,
  images,
  initialIndex = 0,
  alt = '',
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev, onOpenChange]);

  // Bloquea el scroll del body mientras el lightbox está abierto.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || !mounted || images.length === 0) return null;

  const src = images[index] ?? images[0]!;
  const hasMultiple = images.length > 1;

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar: contador + botón Cerrar pill visible */}
      <div
        className="flex items-center justify-between px-5 py-4 sm:px-8"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="rounded-full bg-white/10 px-3 py-1.5 font-mono text-xs font-semibold text-white">
          {hasMultiple ? `${index + 1} / ${images.length}` : 'Foto'}
        </span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Cerrar"
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-lg transition-all hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
          Cerrar
        </button>
      </div>

      {/* Centro: imagen + flechas */}
      <div
        className="relative flex flex-1 items-center justify-center px-4 sm:px-16"
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
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
          onClick={(e) => e.stopPropagation()}
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
        <div
          className="flex items-center justify-center pb-6 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
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
    </div>
  );

  return createPortal(content, document.body);
}
