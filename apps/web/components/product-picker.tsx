'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { quickSearchProducts } from '@/lib/catalog-api';
import type { ProductDto } from '@inventory/shared';

interface Props {
  onPick: (product: ProductDto) => void;
  buttonLabel?: string;
}

export function ProductPicker({ onPick, buttonLabel = 'Agregar producto' }: Props) {
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

  const results = useQuery({
    queryKey: ['quick-search', debouncedQ],
    queryFn: () => quickSearchProducts(debouncedQ, 20),
    enabled: open && debouncedQ.length >= 1,
  });

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elegir producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="SKU, número de parte, código de barras o nombre"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="max-h-[300px] space-y-1 overflow-y-auto">
              {results.isLoading && (
                <>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </>
              )}
              {!results.isLoading &&
                debouncedQ &&
                (results.data?.length ?? 0) === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Sin resultados.
                  </p>
                )}
              {results.data?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.sku}
                      {p.brand?.name ? ` · ${p.brand.name}` : ''}
                      {p.category?.name ? ` · ${p.category.name}` : ''}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Costo ${p.cost} · Precio ${p.price}
                  </div>
                </button>
              ))}
              {!debouncedQ && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Escribí al menos 1 carácter para buscar.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
