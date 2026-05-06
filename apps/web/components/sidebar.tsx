'use client';

import {
  Boxes,
  Car,
  Factory,
  LayoutDashboard,
  Package,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Si están definidos, el item se considera activo cuando pathname empieza con
  // alguno de los prefijos. Si no, comparación exacta.
  matchPrefix?: string[];
}

const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/productos',
    label: 'Productos',
    icon: Package,
    matchPrefix: ['/productos'],
  },
  {
    href: '/categorias',
    label: 'Categorías',
    icon: Tag,
    matchPrefix: ['/categorias'],
  },
  { href: '/marcas', label: 'Marcas', icon: Boxes, matchPrefix: ['/marcas'] },
  { href: '/vehiculos', label: 'Vehículos', icon: Car, matchPrefix: ['/vehiculos'] },
  // Próximas fases — placeholder
  {
    href: '/proveedores',
    label: 'Proveedores',
    icon: Factory,
    matchPrefix: ['/proveedores'],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4 font-semibold">
        Inventario
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.matchPrefix
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
      </nav>
    </aside>
  );
}
