'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Package, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { listProducts } from '@/lib/catalog-api';
import { cn } from '@/lib/utils';

export interface ProductValue {
  id: string;
  sku: string | null;
  name: string;
}

interface Props {
  value: ProductValue | null;
  onChange: (next: ProductValue | null) => void;
}

// Ronda 13 — filtro de producto para la página de movimientos. Lazy-load
// con búsqueda debounced (200ms) — no carga todo el catálogo de entrada.
export function ProductFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setDebouncedQ('');
    }
  }, [open]);

  const products = useQuery({
    queryKey: ['product-filter', { q: debouncedQ }],
    queryFn: () =>
      listProducts({
        q: debouncedQ || undefined,
        page: 1,
        pageSize: 15,
      }),
    enabled: open,
  });

  const items = products.data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between gap-2 font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Package className="h-4 w-4 shrink-0" />
            <span className="truncate">{value ? value.name : 'Producto'}</span>
            {value?.sku && (
              <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                · {value.sku}
              </span>
            )}
          </span>
          {value ? (
            <X
              className="h-4 w-4 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="SKU, partNumber, código o nombre…"
              className="h-9 pl-7"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto border-t">
          {products.isLoading && (
            <div className="space-y-1 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}
          {!products.isLoading && items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {debouncedQ ? 'Sin resultados.' : 'Escribí para buscar.'}
            </p>
          )}
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange({ id: p.id, sku: p.sku, name: p.name });
                setOpen(false);
              }}
              className={cn(
                'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                value?.id === p.id && 'bg-accent',
              )}
            >
              <span className="font-medium">{p.name}</span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {p.sku && <span className="font-mono">{p.sku}</span>}
                {p.brand?.name && <span>· {p.brand.name}</span>}
                {p.category?.name && <span>· {p.category.name}</span>}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
