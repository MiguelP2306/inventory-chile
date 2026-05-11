'use client';

import {
  ArrowDownToLine,
  Boxes,
  Car,
  ClipboardList,
  Factory,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Tag,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavSection {
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
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Catálogo',
    items: [
      { href: '/productos', label: 'Productos', icon: Package, matchPrefix: ['/productos'] },
      { href: '/categorias', label: 'Categorías', icon: Tag, matchPrefix: ['/categorias'] },
      { href: '/marcas', label: 'Marcas', icon: Boxes, matchPrefix: ['/marcas'] },
      { href: '/vehiculos', label: 'Vehículos', icon: Car, matchPrefix: ['/vehiculos'] },
    ],
  },
  {
    label: 'Operación',
    items: [
      { href: '/inventario', label: 'Stock', icon: Warehouse, exact: true },
      {
        href: '/inventario/movimientos',
        label: 'Movimientos',
        icon: ArrowDownToLine,
        matchPrefix: ['/inventario/movimientos'],
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
        href: '/ventas',
        label: 'Ventas',
        icon: ShoppingCart,
        matchPrefix: ['/ventas'],
      },
    ],
  },
  {
    label: 'Caja',
    items: [
      { href: '/caja', label: 'Libro de caja', icon: Wallet, matchPrefix: ['/caja'] },
      { href: '/gastos', label: 'Gastos', icon: Receipt, matchPrefix: ['/gastos'] },
    ],
  },
  {
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

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4 font-semibold">
        Inventario
      </div>
      <nav className="flex flex-1 flex-col gap-3 p-2">
        {SECTIONS.map((section, idx) => (
          <div key={section.label ?? `section-${idx}`} className="flex flex-col gap-1">
            {section.label && (
              <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </div>
            )}
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
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
