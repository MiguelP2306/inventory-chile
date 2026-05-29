'use client';

/* ============================================================================
 *  Sidebar — REESTILIZADO con el sistema visual de "Sidebar.tsx" (Inventario
 *  PYME) + nuevo comportamiento FIJO con toggle.
 *
 *  QUÉ CAMBIÓ (UI/UX — la data de navegación, rutas y queries son las tuyas):
 *
 *  COMPORTAMIENTO (lo que pediste):
 *   · El sidebar es FIJO: `sticky top-0 h-screen`, siempre visible y se
 *     mantiene en su lugar al hacer scroll de la página (su lista interna
 *     scrollea sola).
 *   · Toggle abrir/cerrar manual (botón en el header): alterna entre
 *     expandido (264px) y contraído/icon-rail (76px). YA NO se expande por
 *     hover y se eliminó el pin. El estado se persiste en localStorage.
 *   · Es un hijo de layout real (no flota): al expandir/contraer empuja el
 *     contenido en vez de superponerse.
 *
 *  ESTILO:
 *   · Fondo blanco (#0F131A en dark). Items rounded-xl con CHIP de ícono
 *     (slate-100 / azul al activo). Acento #2F6BFF.
 *   · Headers de sección uppercase tracking-widest colapsables (acordeón
 *     persistido). Grupos con borde izquierdo border-l-2.
 *   · Marca "Inventario PYME" con caja azul + subtítulo. Footer con CTA
 *     "Acceso rápido" (Nueva venta) + accesos Config/Ayuda.
 *
 *  DEPENDENCIAS: idénticas (react-query, lucide, next/link, next/navigation,
 *  @/lib/*). No agrega ninguna.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  Car,
  ChevronDown,
  ClipboardList,
  DollarSign,
  Factory,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  Package,
  PackageX,
  PanelLeftClose,
  Receipt,
  RotateCcw,
  ScanLine,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Tag,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getCompanySettings } from '@/lib/cashbox-api';
import { useIsAdmin } from '@/lib/current-user-context';
import { cn } from '@/lib/utils';

const ACCENT = '#2F6BFF';

interface NavSection {
  /** Identificador estable para persistir el estado del acordeón. */
  key: string;
  label?: string;
  /** Si true, dibuja un separador superior (grupo "Otros"). */
  divider?: boolean;
  items: NavItem[];
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPrefix?: string[];
  exact?: boolean;
  /** Badge opcional (ej: cotizaciones pendientes). No se inventa data: queda
   *  undefined salvo que le pases un número. */
  badge?: number;
  /** Si true, el item se oculta para usuarios sin rol ADMIN. */
  adminOnly?: boolean;
}

const SECTIONS: NavSection[] = [
  {
    key: 'top',
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    key: 'catalogo',
    label: 'Catálogo',
    items: [
      { href: '/productos', label: 'Productos', icon: Package, matchPrefix: ['/productos'] },
      { href: '/categorias', label: 'Categorías', icon: Tag, matchPrefix: ['/categorias'] },
      { href: '/marcas', label: 'Marcas', icon: Boxes, matchPrefix: ['/marcas'] },
      { href: '/vehiculos', label: 'Vehículos', icon: Car, matchPrefix: ['/vehiculos'] },
    ],
  },
  {
    key: 'operacion',
    label: 'Operación',
    items: [
      { href: '/inventario', label: 'Stock', icon: Warehouse, exact: true },
      { href: '/inventario/movimientos', label: 'Movimientos', icon: ArrowDownToLine, matchPrefix: ['/inventario/movimientos'] },
      { href: '/almacenes', label: 'Almacenes', icon: Building2, matchPrefix: ['/almacenes'] },
      { href: '/transferencias', label: 'Transferencias', icon: ArrowLeftRight, matchPrefix: ['/transferencias'] },
      { href: '/compras', label: 'Compras', icon: ArrowDownToLine, matchPrefix: ['/compras'] },
      { href: '/proveedores', label: 'Proveedores', icon: Factory, matchPrefix: ['/proveedores'] },
      { href: '/clientes', label: 'Clientes', icon: Users, matchPrefix: ['/clientes'] },
      { href: '/cotizaciones', label: 'Cotizaciones', icon: ClipboardList, matchPrefix: ['/cotizaciones'] },
      { href: '/seguimiento', label: 'Seguimiento', icon: MessageCircle, matchPrefix: ['/seguimiento'] },
      { href: '/ventas', label: 'Ventas', icon: ShoppingCart, matchPrefix: ['/ventas'] },
      { href: '/devoluciones', label: 'Devoluciones', icon: RotateCcw, matchPrefix: ['/devoluciones'] },
      { href: '/garantias', label: 'Garantías', icon: ShieldAlert, matchPrefix: ['/garantias'] },
      { href: '/guias', label: 'Guías de despacho', icon: Truck, matchPrefix: ['/guias'] },
    ],
  },
  {
    key: 'caja',
    label: 'Caja',
    items: [
      { href: '/caja', label: 'Libro de caja', icon: Wallet, matchPrefix: ['/caja'] },
      { href: '/gastos', label: 'Gastos', icon: Receipt, matchPrefix: ['/gastos'] },
    ],
  },
  {
    key: 'reportes',
    label: 'Reportes',
    items: [
      { href: '/proyeccion', label: 'Proyección', icon: TrendingUp, matchPrefix: ['/proyeccion'] },
      { href: '/reportes/ventas', label: 'Ventas', icon: BarChart3, matchPrefix: ['/reportes/ventas'] },
      { href: '/reportes/iva', label: 'IVA', icon: FileSpreadsheet, matchPrefix: ['/reportes/iva'] },
      { href: '/reportes/flujo-caja', label: 'Flujo de caja', icon: LineChart, matchPrefix: ['/reportes/flujo-caja'] },
      { href: '/reportes/sin-movimiento', label: 'Sin movimiento', icon: PackageX, matchPrefix: ['/reportes/sin-movimiento'] },
    ],
  },
  {
    key: 'otros',
    divider: true,
    items: [
      { href: '/productos?scan=1', label: 'Escaneo rápido', icon: ScanLine, matchPrefix: ['/escanear'] },
      { href: '/usuarios', label: 'Usuarios', icon: UserCog, matchPrefix: ['/usuarios'], adminOnly: true },
      { href: '/configuracion', label: 'Configuración', icon: Settings, matchPrefix: ['/configuracion'], adminOnly: true },
    ],
  },
];

/* ------------------------------------------------------------------
 * Persistencia local: estado del acordeón + estado contraído del rail.
 * ----------------------------------------------------------------*/
const DEFAULT_OPEN: Record<string, boolean> = {
  top: true,
  catalogo: true,
  operacion: true,
  caja: true,
  reportes: true,
  otros: true,
};
const ACCORDION_KEY = 'inv:sidebar:sections';
const COLLAPSE_KEY = 'inv:sidebar:collapsed';

function useAccordion() {
  const [open, setOpen] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACCORDION_KEY);
      if (raw) setOpen({ ...DEFAULT_OPEN, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
  }, []);
  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = { ...prev, [key]: !(prev[key] !== false) };
      try {
        localStorage.setItem(ACCORDION_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);
  return [open, toggle] as const;
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* noop */
    }
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);
  return [collapsed, toggle] as const;
}

export function useCompanyName(): string {
  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000,
  });
  return settings.data?.name?.trim() || 'Inventario';
}

/* ============================================================
   NAV — items con chip de ícono + acordeón.
   Compartido por el sidebar desktop y el drawer mobile.
   ============================================================ */
export function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const [open, toggleSection] = useAccordion();
  const isAdmin = useIsAdmin();

  // Filtrado por rol — los items `adminOnly` solo se muestran a admin. Si
  // tras el filtro una sección queda vacía, la omitimos.
  const visibleSections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((it) => !it.adminOnly || isAdmin),
  })).filter((s) => s.items.length > 0);

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
      {visibleSections.map((section) => {
        const isOpen = open[section.key] !== false;
        const showHeader = !collapsed && !!section.label;
        // En collapsed mostramos siempre los iconos (ignoramos el acordeón).
        const bodyVisible = collapsed || !section.label || isOpen;

        return (
          <div
            key={section.key}
            className={cn(
              'flex flex-col',
              section.divider && 'mt-3 border-t border-slate-100 pt-3 dark:border-slate-800/80',
              !section.divider && section.label && 'pt-2',
            )}
          >
            {showHeader && (
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                <span>{section.label}</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 transition-transform duration-200',
                    !isOpen && '-rotate-90',
                  )}
                />
              </button>
            )}
            <div
              className={cn(
                'flex flex-col overflow-hidden transition-[max-height,opacity] duration-200 ease-out',
                bodyVisible ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0',
                // Borde-guía del grupo (solo expandido y con header).
                !collapsed && section.label && 'ml-1 gap-0.5 border-l-2 border-slate-100 pl-2 dark:border-slate-800/80',
                (!section.label || collapsed) && 'gap-0.5',
              )}
            >
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.exact
                  ? pathname === item.href
                  : item.matchPrefix
                    ? item.matchPrefix.some((p) => pathname.startsWith(p))
                    : pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex h-9 items-center rounded-xl text-[13px] font-medium transition-all',
                      collapsed ? 'justify-center px-0' : 'justify-between px-3',
                      active
                        ? 'bg-[#2F6BFF]/10 text-[#2F6BFF] dark:bg-[#2F6BFF]/15 dark:text-blue-400'
                        : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/60',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                          active
                            ? 'bg-[#2F6BFF]/15 text-[#2F6BFF] dark:bg-[#2F6BFF]/25 dark:text-blue-400'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-slate-800/80 dark:text-slate-400 dark:group-hover:bg-slate-700/80',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className={cn('truncate', collapsed && 'sr-only')}>
                        {item.label}
                      </span>
                    </span>
                    {item.badge !== undefined && !collapsed && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/* ============================================================
   SIDEBAR DESKTOP — FIJO (sticky) + toggle abrir/cerrar.
   ============================================================
   · `sticky top-0 h-screen`: se mantiene fijo al hacer scroll.
   · width 264px (expandido) ↔ 76px (icon-rail), persistido.
   · El botón del header alterna el estado (sin hover, sin pin).
*/
export function Sidebar() {
  const companyName = useCompanyName();
  const [collapsed, toggleCollapsed] = useCollapsed();
  const isAdmin = useIsAdmin();

  return (
    <aside
      className={cn(
        'sticky top-0 z-40 hidden h-screen shrink-0 flex-col self-start border-r border-slate-200/70 bg-white transition-[width] duration-300 ease-out dark:border-slate-800 dark:bg-[#0F131A] md:flex',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      {/* Header — brand + toggle */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-3 px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-lg"
          style={{ backgroundColor: ACCENT, boxShadow: '0 10px 22px -8px rgba(47,107,255,0.5)' }}
        >
          <Boxes className="h-5 w-5" />
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <h1
                className="flex items-center gap-1 truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-white"
                title={companyName}
              >
                {companyName}{' '}
                <span style={{ color: ACCENT }} className="font-extrabold dark:brightness-125">
                  PYME
                </span>
              </h1>
              <p className="truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                SaaS Chile CLP
              </p>
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Contraer sidebar"
              title="Contraer"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Botón expandir cuando está contraído (debajo del logo) */}
      {collapsed && (
        <div className="flex justify-center pb-1">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expandir sidebar"
            title="Expandir"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <PanelLeftClose className="h-4 w-4 rotate-180" />
          </button>
        </div>
      )}

      <SidebarNav collapsed={collapsed} />

      {/* Footer — CTA + accesos */}
      <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800/80">
        {!collapsed ? (
          <div
            className="rounded-2xl border p-4 text-center"
            style={{ borderColor: 'rgba(47,107,255,0.1)', backgroundColor: 'rgba(47,107,255,0.05)' }}
          >
            <p className="mb-1 text-xs font-bold" style={{ color: ACCENT }}>
              Acceso rápido
            </p>
            <p className="mb-3 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Genera una nueva venta POS en segundos
            </p>
            <Link
              href="/ventas/nueva"
              style={{ backgroundColor: ACCENT, boxShadow: '0 10px 22px -8px rgba(47,107,255,0.45)' }}
              className="block w-full rounded-xl py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
            >
              Nueva venta
            </Link>
          </div>
        ) : (
          <Link
            href="/ventas/nueva"
            title="Nueva venta"
            style={{ backgroundColor: ACCENT }}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
          >
            <ShoppingCart className="h-4 w-4" />
          </Link>
        )}

        {!collapsed && (
          <div className="flex items-center justify-between px-1 text-[12px] font-medium text-slate-500 dark:text-slate-400">
            {isAdmin ? (
              <Link
                href="/configuracion"
                className="flex items-center gap-1.5 transition-colors hover:text-slate-900 dark:hover:text-white"
              >
                <Settings className="h-4 w-4" />
                <span>Config</span>
              </Link>
            ) : (
              <span />
            )}
            <a
              href="mailto:soporte@pyme.cl"
              className="flex items-center gap-1.5 transition-colors hover:text-slate-900 dark:hover:text-white"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Ayuda</span>
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}
