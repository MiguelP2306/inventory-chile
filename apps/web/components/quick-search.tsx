'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { quickSearchProducts } from '@/lib/catalog-api';

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
}

export function QuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [mac, setMac] = useState(false);

  useEffect(() => setMac(isMac()), []);

  // Atajo: Cmd+K (mac) / Ctrl+K (resto). El listener vive en window porque
  // queremos abrirlo desde cualquier parte del dashboard.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Debounce de 250ms para no saturar al backend mientras se tipea.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ['quick-search', debounced],
    queryFn: () => quickSearchProducts(debounced, 10),
    enabled: debounced.length >= 1 && open,
  });

  const onSelect = (id: string) => {
    setOpen(false);
    setQuery('');
    router.push(`/productos/${id}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-72 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span>Buscar producto…</span>
        <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">
          {mac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="SKU, nombre, código de barras…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {results.data && results.data.length === 0 && debounced && (
            <CommandEmpty>Sin resultados para “{debounced}”</CommandEmpty>
          )}
          {results.data && results.data.length > 0 && (
            <CommandGroup heading="Productos">
              {results.data.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.sku} ${p.name}`}
                  onSelect={() => onSelect(p.id)}
                >
                  <div className="flex w-full items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {p.name}
                        {!p.isActive && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku}
                        {p.brand?.name ? ` · ${p.brand.name}` : ''}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">${p.price}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
