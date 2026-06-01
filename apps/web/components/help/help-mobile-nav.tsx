'use client';

/* ============================================================================
 *  HelpMobileNav — menú de navegación de la guía para mobile (`<lg`).
 *
 *  En desktop el índice vive en la columna derecha (HelpGuide). En mobile esa
 *  columna se oculta, así que la navegación pasa al header como un botón
 *  hamburguesa que abre un drawer (Sheet) con los mismos enlaces ancla.
 *
 *  Usa la misma data (GROUPS / FAQS) que la guía para no duplicar contenido.
 *  Al tocar un enlace, hace scroll a la sección y cierra el drawer.
 * ========================================================================== */

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { FAQS, GROUPS } from '@/components/help/help-content';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function HelpMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir índice de la guía"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 lg:hidden dark:border-slate-800 dark:bg-[#0F131A] dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetHeader className="h-16 flex-row items-center border-b px-5">
          <SheetTitle className="text-[15px]">Índice de la guía</SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            <MobileLink id="intro" label="Inicio" onNavigate={() => setOpen(false)} />
            {GROUPS.map((group) => (
              <li key={group.key} className="pt-3">
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {group.label}
                </p>
                <ul className="space-y-0.5 border-l border-slate-100 dark:border-slate-800">
                  {group.modules.map((m) => (
                    <MobileLink
                      key={m.id}
                      id={m.id}
                      label={m.title}
                      nested
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
                </ul>
              </li>
            ))}
            {FAQS.length > 0 && (
              <li className="pt-3">
                <MobileLink
                  id="faq"
                  label="Preguntas frecuentes"
                  onNavigate={() => setOpen(false)}
                />
              </li>
            )}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileLink({
  id,
  label,
  nested,
  onNavigate,
}: {
  id: string;
  label: string;
  nested?: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <a
        href={`#${id}`}
        onClick={onNavigate}
        className={cn(
          'block truncate rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white',
          nested && 'pl-3',
        )}
      >
        {label}
      </a>
    </li>
  );
}
