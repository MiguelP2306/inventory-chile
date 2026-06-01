'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal — monta a `document.body` los modales "custom" (los que usan un
 * `<div className="fixed inset-0 …">` propio en vez de <SoftModal>/<Dialog>).
 *
 * Sin esto, el overlay se renderiza dentro del árbol de la página (debajo de
 * <main>) y queda atrapado por el contexto de apilamiento del header sticky:
 * el fondo oscuro + blur no llega hasta arriba (se ve cortado a la altura del
 * header). Al portalizar al body, el `fixed inset-0` es relativo al viewport
 * real y cubre toda la pantalla, igual que <SoftModal> y <Dialog> (Radix).
 *
 * Devuelve null hasta montar en cliente para no romper el SSR.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
