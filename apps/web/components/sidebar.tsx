'use client';

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
  Factory,
  FileSpreadsheet,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  Package,
  PackageX,
  Pin,
  Receipt,
  RotateCcw,
  ScanLine,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Tag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { getCompanySettings } from '@/lib/cashbox-api';
import { cn } from '@/lib/utils';

interface NavSection {
  /** Identificador estable para persistir el estado del acordeón. */
  key: string;
  label?: string;
  items: NavItem[];
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Si están definidos, activo cuando pathname empieza con alguno de los prefijos.
  matchPrefix?: string[];
  // Si true, sólo activo en match exacto (sirve para padres tipo /inventario
  // que tienen un sub-item /inventario/movimientos).
  exact?: boolean;
}

const SECTIONS: NavSection[] = [
  {
    key: 'top',
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }],
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
      {
        href: '/inventario/movimientos',
        label: 'Movimientos',
        icon: ArrowDownToLine,
        matchPrefix: ['/inventario/movimientos'],
      },
      {
        href: '/escanear',
        label: 'Escanear',
        icon: ScanLine,
        matchPrefix: ['/escanear'],
      },
      {
        href: '/almacenes',
        label: 'Almacenes',
        icon: Building2,
        matchPrefix: ['/almacenes'],
      },
      {
        href: '/transferencias',
        label: 'Transferencias',
        icon: ArrowLeftRight,
        matchPrefix: ['/transferencias'],
      },
      { href: '/compras', label: 'Compras', icon: ArrowDownToLine, matchPrefix: ['/compras'] },
      {
        href: '/proveedores',
        label: 'Proveedores',
        icon: Factory,
        matchPrefix: ['/proveedores'],
      },
      {
        href: '/clientes',
        label: 'Clientes',
        icon: Users,
        matchPrefix: ['/clientes'],
      },
      {
        href: '/cotizaciones',
        label: 'Cotizaciones',
        icon: ClipboardList,
        matchPrefix: ['/cotizaciones'],
      },
      {
        href: '/seguimiento',
        label: 'Seguimiento',
        icon: MessageCircle,
        matchPrefix: ['/seguimiento'],
      },
      {
        href: '/ventas',
        label: 'Ventas',
        icon: ShoppingCart,
        matchPrefix: ['/ventas'],
      },
      {
        href: '/devoluciones',
        label: 'Devoluciones',
        icon: RotateCcw,
        matchPrefix: ['/devoluciones'],
      },
      {
        href: '/garantias',
        label: 'Garantías',
        icon: ShieldAlert,
        matchPrefix: ['/garantias'],
      },
      {
        href: '/guias',
        label: 'Guías de despacho',
        icon: Truck,
        matchPrefix: ['/guias'],
      },
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
      {
        href: '/proyeccion',
        label: 'Proyección',
        icon: TrendingUp,
        matchPrefix: ['/proyeccion'],
      },
      {
        href: '/reportes/ventas',
        label: 'Ventas',
        icon: BarChart3,
        matchPrefix: ['/reportes/ventas'],
      },
      {
        href: '/reportes/iva',
        label: 'IVA',
        icon: FileSpreadsheet,
        matchPrefix: ['/reportes/iva'],
      },
      {
        href: '/reportes/flujo-caja',
        label: 'Flujo de caja',
        icon: LineChart,
        matchPrefix: ['/reportes/flujo-caja'],
      },
      // Fase 9 — productos sin movimiento.
      {
        href: '/reportes/sin-movimiento',
        label: 'Sin movimiento',
        icon: PackageX,
        matchPrefix: ['/reportes/sin-movimiento'],
      },
    ],
  },
  {
    key: 'config',
    label: 'Configuración',
    items: [
      {
        href: '/configuracion',
        label: 'Configuración',
        icon: Settings,
        matchPrefix: ['/configuracion'],
      },
    ],
  },
];

/* ------------------------------------------------------------------
 * Persistencia local del acordeón y del estado "pinned" del rail.
 * Usa localStorage y inicializa con defaults SSR-safe (no toca window
 * hasta el primer effect en cliente).
 * ----------------------------------------------------------------*/
const DEFAULT_OPEN: Record<string, boolean> = {
  top: true,
  catalogo: true,
  operacion: true,
  caja: true,
  reportes: true,
  config: true,
};
const ACCORDION_KEY = 'inv:sidebar:sections';
const PIN_KEY = 'inv:sidebar:pinned';

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

function usePinned() {
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === '1');
    } catch {
      /* noop */
    }
  }, []);
  const toggle = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PIN_KEY, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);
  return [pinned, toggle] as const;
}

/**
 * Hook que devuelve el nombre de la empresa para mostrar como título del
 * sidebar desktop o el drawer mobile. Compartido entre ambos para no
 * duplicar la query (TanStack reuses el caché por queryKey).
 */
export function useCompanyName(): string {
  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000,
  });
  return settings.data?.name?.trim() || 'Inventario';
}

/**
 * Lista de links del sidebar. Compartida entre el sidebar fijo (desktop)
 * y el drawer mobile (`<md`). `onNavigate` lo invoca el drawer al hacer
 * tap en un link para cerrarse solo. `collapsed` lo pasa el `Sidebar`
 * desktop cuando el rail está en estado plegado (solo iconos).
 */
export function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const [open, toggleSection] = useAccordion();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
      {SECTIONS.map((section, idx) => {
        const isOpen = open[section.key] !== false;
        const showHeader = !collapsed && !!section.label;
        return (
          <div
            key={section.key}
            className={cn(
              'flex flex-col',
              // En estado plegado, separamos secciones con una línea sutil
              collapsed && idx > 0 && 'mt-1.5 border-t border-border/60 pt-1.5',
            )}
          >
            {showHeader && (
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="flex items-center gap-1.5 rounded-md px-3 pb-1 pt-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="flex-1">{section.label}</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 opacity-70 transition-transform duration-200',
                    !isOpen && '-rotate-90',
                  )}
                />
              </button>
            )}
            <div
              className={cn(
                'flex flex-col overflow-hidden transition-[max-height,opacity] duration-200 ease-out',
                // El acordeón sólo aplica cuando hay header visible (no en collapsed)
                !collapsed && !isOpen ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100',
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
                      'flex h-9 items-center gap-2.5 rounded-md text-sm transition-colors',
                      collapsed ? 'justify-center px-0' : 'px-3',
                      active
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={cn('truncate', collapsed && 'sr-only')}>
                      {item.label}
                    </span>
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

/**
 * Sidebar desktop "Floating Rail" — V2.
 *
 * Comportamiento:
 *  - 60px en reposo, mostrando sólo los iconos.
 *  - Al hacer hover (o si está fijado con el botón pin), crece a 272px
 *    y FLOTA sobre el contenido con sombra. No empuja el layout.
 *  - El host externo siempre ocupa 60px para que el contenido no salte.
 *  - Estado pinned + estado de secciones del acordeón se persisten en
 *    localStorage.
 */
export function Sidebar() {
  const companyName = useCompanyName();
  const [pinned, togglePinned] = usePinned();
  const [hover, setHover] = useState(false);
  const expanded = pinned || hover;

  return (
    <div className="relative hidden w-[60px] shrink-0 md:block">
      <aside
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          'absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r bg-card/85 backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-out',
          expanded
            ? 'w-[272px] shadow-[0_28px_60px_-20px_rgba(0,0,0,0.18),0_60px_120px_-40px_rgba(0,0,0,0.12)]'
            : 'w-[60px] border-border/60',
        )}
      >
        {/* Header del sidebar — brand mark + wordmark + pin */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-[15px]">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br from-foreground to-foreground/75 text-background shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_4px_10px_-4px_rgba(0,0,0,0.35)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="4"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 6.5V3M12 21v-3.5M6.5 12H3M21 12h-3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col leading-tight transition-opacity duration-150',
              expanded ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0',
            )}
          >
            <span
              className="truncate text-[14px] font-semibold tracking-tight"
              title={companyName}
            >
              {companyName}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              Bodega Principal
            </span>
          </div>
          <button
            type="button"
            onClick={togglePinned}
            aria-label={pinned ? 'Desfijar sidebar' : 'Fijar sidebar abierto'}
            aria-pressed={pinned}
            title={pinned ? 'Desfijar' : 'Fijar abierto'}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
              expanded ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0',
              pinned && 'bg-accent text-foreground',
            )}
          >
            <Pin
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                pinned && 'rotate-45',
              )}
            />
          </button>
        </div>

        <SidebarNav collapsed={!expanded} />
      </aside>
    </div>
  );
}
