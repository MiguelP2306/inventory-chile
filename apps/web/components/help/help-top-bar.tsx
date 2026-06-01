'use client';

/* ============================================================================
 *  HelpTopBar — barra superior del Centro de Ayuda.
 *
 *  Reusa el sistema visual de la web (marca con caja azul #2F6BFF, header
 *  glass translúcido, ThemeToggle). NO incluye sidebar: la página de ayuda
 *  vive a pantalla completa. El botón "Volver al sistema" devuelve al
 *  dashboard.
 * ========================================================================== */

import { ArrowLeft, Boxes } from 'lucide-react';
import Link from 'next/link';
import { HelpMobileNav } from '@/components/help/help-mobile-nav';
import { useCompanyName } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

const ACCENT = '#2F6BFF';

export function HelpTopBar() {
  const companyName = useCompanyName();

  return (
    <header
      className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-slate-50/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-slate-50/70 sm:px-6 dark:border-slate-800 dark:bg-[#0B0E14]/80"
    >
      {/* Menú hamburguesa (solo mobile/tablet) con el índice de la guía */}
      <HelpMobileNav />

      {/* Marca */}
      <Link href="/ayuda" className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-lg"
          style={{ backgroundColor: ACCENT, boxShadow: '0 10px 22px -8px rgba(47,107,255,0.5)' }}
        >
          <Boxes className="h-5 w-5" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="flex items-center gap-1 truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
            {companyName}{' '}
            <span style={{ color: ACCENT }} className="font-extrabold dark:brightness-125">
              PYME
            </span>
          </span>
          <span className="block truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
            Centro de ayuda
          </span>
        </span>
      </Link>

      {/* Acciones a la derecha */}
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90 sm:px-4"
          style={{ backgroundColor: ACCENT, boxShadow: '0 10px 22px -8px rgba(47,107,255,0.45)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Volver al sistema</span>
          <span className="sm:hidden">Volver</span>
        </Link>
      </div>
    </header>
  );
}
