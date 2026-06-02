'use client';

import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Brand } from '@/components/brand';
import { SidebarNav } from '@/components/sidebar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

/**
 * Ronda 4: drawer hamburger para `<md`. En desktop el botón se oculta
 * (`md:hidden`) y queda sólo el sidebar fijo. Al navegar, el drawer se
 * cierra solo (callback `onNavigate` que pasa al SidebarNav).
 *
 * Si el pathname cambia por otro motivo (back/forward, navegación
 * programática) también cerramos por seguridad.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cierre defensivo en cambios de ruta.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menú"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-accent md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetHeader className="h-16 flex-row items-center border-b px-4">
          <SheetTitle className="min-w-0">
            <Brand />
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
