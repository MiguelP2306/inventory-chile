/*
 * DashboardLayout — header REESTILIZADO con el sistema visual de "Header.tsx".
 *
 * QUÉ CAMBIÓ (solo UI/UX — auth, redirect y componentes cliente intactos):
 *  · Shell del header: translúcido glass (bg-slate-50/80 + backdrop-blur),
 *    SIN borde ni sombra pesada, padding px-6 py-3 (como el diseño).
 *  · Breadcrumb estilo "PYME › sección" (slate, separador ChevronRight).
 *  · Acciones a la derecha estilo "pill/redondas": Nueva venta (azul),
 *    toggle de tema (botón redondo), campana de notificaciones (dropdown) y
 *    avatar con nombre/rol + dropdown.
 *
 * SE MANTIENE LA ARQUITECTURA server-component: la interactividad sigue en
 * tus componentes cliente (QuickSearch, ThemeToggle, OperationButton,
 * MobileNav, LogoutButton, DropdownMenu de Radix).
 *
 * NOTA sobre el buscador: el "pill con ⌘K" del diseño vive DENTRO de
 * <QuickSearch /> (es tu componente). Acá solo lo centramos. Si querés que
 * el trigger se vea exactamente como el pill del diseño, aplicá ese estilo
 * en el botón interno de QuickSearch (te dejo el snippet en el resumen).
 *
 * NOTA sobre OperationButton: dejo tu <OperationButton /> como acción
 * principal (preserva su lógica). El diseño lo muestra como pill azul
 * "Nueva venta" — si tu OperationButton no es ya ese pill, estilízalo ahí.
 *
 * NOTA sobre notificaciones: el diseño trae una campana con dropdown. Tu
 * header no tenía notificaciones, así que la dejo cableada a un dropdown con
 * estado vacío honesto ("Sin alertas nuevas"); conectá tu fuente real cuando
 * la tengas. Si preferís no tenerla, borrá el bloque <NotificationsBell/>.
 */

import { Bell, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccountMenuItems } from '@/components/account-menu-items';
import { LogoutButton } from '@/components/logout-button';
import { MobileNav } from '@/components/mobile-nav';
import { OperationButton } from '@/components/operation-button';
import { ProductBagButton } from '@/components/product-bag';
import { QuickSearch } from '@/components/quick-search';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CurrentUserProvider } from '@/lib/current-user-context';
import { getCurrentUser } from '@/lib/server-api';
import { cn } from '@/lib/utils';

/** Iniciales para el avatar — local-part del email, hasta 2 letras. */
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
    <CurrentUserProvider user={user}>
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sticky top-0 z-40 flex items-center gap-3 px-4 py-3 sm:px-6',
            // Glass translúcido — sin borde ni sombra (como el diseño).
            'bg-slate-50/80 backdrop-blur-md supports-[backdrop-filter]:bg-slate-50/70',
            'dark:bg-[#0B0E14]/80 transition-colors duration-200',
          )}
        >
          {/* Izquierda: MobileNav + breadcrumb "PYME › sección" */}
          <div className="flex shrink-0 items-center gap-3">
            <MobileNav />
            {/*
             * Breadcrumb estático. Para que cambie según la página
             * ("PYME › Catálogo / Productos"), extraé un componente cliente
             * con usePathname() y reemplazá el <Link>Inicio</Link>.
             */}
            <nav
              aria-label="Breadcrumb"
              className="hidden items-center gap-2 md:flex"
            >
              <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                PYME
              </span>
              <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600" />
              <Link
                href="/"
                className="text-[12px] font-semibold tracking-tight text-slate-700 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                Inicio
              </Link>
            </nav>
          </div>

          {/* Centro: buscador (tu QuickSearch) centrado, ancho controlado.
              En móvil se colapsa a un botón con solo ícono (lo maneja el
              propio QuickSearch) pero permanece visible. */}
          <div className="mx-auto w-full min-w-0 max-w-md">
            <QuickSearch />
          </div>

          {/* Derecha: acciones tipo pill/redondas */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Nueva venta — tu acción principal (estilízala como pill azul
                dentro de OperationButton si aún no lo es). */}
            <OperationButton />

            {/* Toggle de tema — tu componente (estilo redondo en el diseño). */}
            <ThemeToggle />

            {/* Bolso temporal de productos — drawer con items rápidos. */}
            <ProductBagButton />

            {/* Campana de notificaciones — estado vacío honesto. */}
            {/* <NotificationsBell /> */}

            {/* Avatar + dropdown — nombre/rol visible en xl, como el diseño. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Cuenta"
                  className="flex items-center gap-2.5 rounded-full text-left focus:outline-none"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#c2755a] to-[#8b4d3c] text-[11px] font-semibold text-white">
                    {initials}
                  </span>
                  <span className="hidden leading-tight xl:block">
                    <span className="block text-[12px] font-bold text-slate-800 dark:text-slate-200">
                      {user.email.split('@')[0]}
                    </span>
                    <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      {user.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}
                    </span>
                  </span>
                  <ChevronDown className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[240px] rounded-2xl border-slate-100 p-0 dark:border-slate-800"
              >
                <div className="px-4 py-3">
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Sesión iniciada como
                  </p>
                  <p className="truncate text-[12px] font-bold text-slate-800 dark:text-slate-200">
                    {user.email}
                  </p>
                </div>
                <DropdownMenuSeparator className="my-0" />
                <div className="p-1">
                  <AccountMenuItems />
                </div>
                <DropdownMenuSeparator className="my-0" />
                {/*
                 * LogoutButton mantiene su lógica (server action / fetch).
                 * Lo estilamos como menu-item: ancho completo, alineado a la
                 * izquierda, tono rose como el diseño.
                 */}
                <div
                  className={cn(
                    'p-1',
                    '[&_button]:h-9 [&_button]:w-full [&_button]:justify-start [&_button]:gap-2.5 [&_button]:rounded-xl [&_button]:px-3 [&_button]:text-[12px] [&_button]:font-medium',
                    '[&_button]:text-rose-600 [&_button:hover]:bg-rose-50 dark:[&_button:hover]:bg-rose-950/20',
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
    </CurrentUserProvider>
  );
}

/* ============================================================
   CAMPANA DE NOTIFICACIONES — botón redondo (estilo diseño) + dropdown.
   Estado vacío honesto: conectá tu fuente real (alertas de stock/caja)
   reemplazando el contenido del dropdown. El punto rojo (unread) se
   muestra de forma condicional; déjalo oculto hasta que tengas datos.
   ============================================================ */
function NotificationsBell() {
  const hasUnread = false; // ← cámbialo cuando conectes notificaciones
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-500 transition-colors hover:text-slate-800 dark:border-slate-800 dark:bg-[#161B22] dark:text-slate-400 dark:hover:text-white"
        >
          <Bell className="h-4 w-4" />
          {hasUnread && (
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500 dark:border-[#161B22]" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 rounded-2xl border-slate-100 p-0 dark:border-slate-800"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span className="text-[12px] font-bold text-slate-800 dark:text-slate-200">
            Alertas de stock y caja
          </span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 px-6 py-8 text-center">
          <Bell className="h-6 w-6 text-slate-300 dark:text-slate-600" />
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
            Sin alertas nuevas
          </p>
          <p className="max-w-[40ch] text-[11px] leading-snug text-slate-400">
            Acá verás avisos de stock crítico, aperturas de caja y pagos
            recibidos.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
