'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { Button } from '@/components/ui/button';
import { SoftModal, softInputClass } from '@/components/ui/soft-modal';
import { Skeleton } from '@/components/ui/skeleton';
import { listProducts, publicImageUrl } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import type { ProductDto } from '@inventory/shared';

interface Props {
  onPick: (product: ProductDto) => void;
  buttonLabel?: string;
  // Cuando es 'true' el picker lista SOLO servicios (envío/flete) en vez de
  // productos de inventario. Cambia también los textos del modal.
  isService?: 'true';
  title?: string;
  subtitle?: string;
}

const PAGE_SIZE = 10;

export function ProductPicker({
  onPick,
  buttonLabel = 'Agregar producto',
  isService,
  title,
  subtitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Cuando cambia el término de búsqueda, vuelvo a la primera página.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  // Resetear estado al cerrar.
  useEffect(() => {
    if (!open) {
      setQ('');
      setDebouncedQ('');
      setPage(1);
    }
  }, [open]);

  const results = useQuery({
    queryKey: ['product-picker', { q: debouncedQ, page, isService: isService ?? '' }],
    queryFn: () =>
      listProducts({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
        isService,
      }),
    enabled: open,
  });

  const items = results.data?.items ?? [];
  const total = results.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <SoftModal
        open={open}
        onOpenChange={setOpen}
        title={title ?? 'Elegir producto'}
        subtitle={subtitle ?? 'Buscá por SKU, código de barras o nombre'}
        size="xl"
      >
        <div className="space-y-3 p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                placeholder={isService ? "Buscar servicio" : "SKU, código de barras o nombre"}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={`${softInputClass} pl-10`}
              />
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto">
              {results.isLoading && (
                <>
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </>
              )}
              {!results.isLoading && items.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {debouncedQ ? 'Sin resultados.' : isService ? 'No hay servicios cargados.' : 'No hay productos cargados.'}
                </p>
              )}
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent"
                >
                  <ProductThumbnail
                    src={publicImageUrl(p.coverUrl ?? null)}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.sku}
                      {p.brand?.name ? ` · ${p.brand.name}` : ''}
                      {p.category?.name ? ` · ${p.category.name}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {p.cost != null && (
                      <div>Costo {formatCurrency(p.cost)}</div>
                    )}
                    <div>Precio {formatCurrency(p.price)}</div>
                  </div>
                </button>
              ))}
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {total} producto{total === 1 ? '' : 's'} · página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || results.isFetching}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || results.isFetching}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
      </SoftModal>
    </>
  );
}
