/*
 * Header · H1 — Centered Search
 *
 * Mantengo el layout como server component (el auth + redirect siguen
 * igual). Para el dropdown del avatar uso <DropdownMenu> de shadcn que
 * internamente es client component (Radix) y se puede usar dentro de un
 * server component sin problema.
 *
 * Requisito: tener instalado `@/components/ui/dropdown-menu`. Si no lo
 * tenés todavía, instalalo con:
 *     npx shadcn-ui@latest add dropdown-menu
 */

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { MobileNav } from '@/components/mobile-nav';
import { OperationButton } from '@/components/operation-button';
import { QuickSearch } from '@/components/quick-search';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getCurrentUser } from '@/lib/server-api';
import { cn } from '@/lib/utils';

/** Iniciales para el avatar — toma local-part del email y agarra hasta 2
 *  letras de cualquier separador (`. _ - +`). Fallback "U". */
function getInitials(email: string) {
  const local = email.split('@')[0] || email;
  return (
    local
      .split(/[._\-+]/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join('')
      .toUpperCase() || 'U'
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const initials = getInitials(user.email);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sticky top-0 z-20 flex h-14 items-center gap-3 px-3 sm:px-5',
            // Glass + soft shadow (sin borde inferior)
            'bg-card/85 backdrop-blur-xl supports-[backdrop-filter]:bg-card/70',
            'shadow-[0_1px_0_rgba(0,0,0,0.06),0_8px_24px_-16px_rgba(0,0,0,0.18),0_22px_40px_-28px_rgba(0,0,0,0.12)]',
            'dark:shadow-[0_1px_0_rgba(255,255,255,0.04),0_14px_30px_-20px_rgba(0,0,0,0.6),0_30px_60px_-30px_rgba(0,0,0,0.4)]',
          )}
        >
          {/* Izquierda: MobileNav + breadcrumb anchor estático */}
          <div className="flex shrink-0 items-center gap-3">
            <MobileNav />
            {/*
             * Breadcrumb estático con anchor "Inicio". Si querés que cambie
             * según la página (ej. "Inicio / Catálogo / Productos"), extraé
             * un componente cliente que use `usePathname()` y mapeá las
             * rutas. Se mantiene en server-side para no romper el async.
             */}
            <nav
              aria-label="Breadcrumb"
              className="hidden items-center gap-1 text-[12.5px] md:flex"
            >
              <Link
                href="/"
                className="rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Inicio
              </Link>
            </nav>
          </div>

          {/* Spacer izquierdo — empuja el buscador al centro */}
          <div className="flex-1" />

          {/* Centro: buscador con ancho controlado (clamp natural via max-w) */}
          <div className="hidden w-full max-w-[460px] sm:block">
            <QuickSearch />
          </div>

          {/* Spacer derecho — empuja las acciones al borde */}
          <div className="flex-1" />

          {/* Derecha: acciones */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <div className="hidden h-[22px] w-px bg-border sm:block" />
            <OperationButton />

            {/* Avatar + dropdown — reemplaza el email suelto + LogoutButton suelto */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Cuenta"
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-full border bg-card pl-1 pr-2 transition-colors hover:bg-accent/50"
                >
                  <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-gradient-to-br from-[#c2755a] to-[#8b4d3c] text-[10.5px] font-semibold text-white">
                    {initials}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[240px]">
                <div className="px-2 py-1.5">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {user.email}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Administrador
                  </div>
                </div>
                <DropdownMenuSeparator />
                {/*
                 * LogoutButton mantiene su lógica original (server action /
                 * fetch). Lo envolvemos para que el botón interno se
                 * comporte como menu-item: ancho completo, alineado a la
                 * izquierda, sin estilos de botón fuertes.
                 */}
                <div
                  className={cn(
                    'p-1',
                    '[&_button]:h-9 [&_button]:w-full [&_button]:justify-start [&_button]:rounded-md [&_button]:px-2.5 [&_button]:text-[13px] [&_button]:font-normal',
                  )}
                >
                  <LogoutButton />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
