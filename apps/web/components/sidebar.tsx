'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  Car,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  Package,
  Receipt,
  RotateCcw,
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
import { getCompanySettings } from '@/lib/cashbox-api';
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
    label: 'Caja',
    items: [
      { href: '/caja', label: 'Libro de caja', icon: Wallet, matchPrefix: ['/caja'] },
      { href: '/gastos', label: 'Gastos', icon: Receipt, matchPrefix: ['/gastos'] },
    ],
  },
  {
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
  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000,
  });

  const companyName = settings.data?.name?.trim() || 'Inventario';

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-card md:flex md:flex-col">
      <div
        className="flex h-14 items-center border-b px-4 text-base font-semibold truncate"
        title={companyName}
      >
        {companyName}
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
