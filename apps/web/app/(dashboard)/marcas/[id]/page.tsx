'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  MoreHorizontal,
  Package,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  listBrands,
  listProducts,
  publicImageUrl,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 50;

/**
 * Detalle de marca — diseño C1 alineado con el detalle de categoría.
 *
 * Preserva 1:1 la lógica original:
 *  · `useParams<{ id: string }>()` + `useUrlFilters` + `useDebouncedUrlFilter`.
 *  · Doble query: `listBrands` (para el nombre) + `listProducts({ brandId, q, page })`.
 *  · Paginación por URL.
 *
 * Sin stats, sin bulk actions, sin sección de "top productos" — la pantalla
 * es de solo lectura para listar los SKUs de esta marca.
 */
export default function MarcaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const brandsQ = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const brand = (brandsQ.data ?? []).find((b) => b.id === id) ?? null;

  const productsQ = useQuery({
    queryKey: ['products', { brandId: id, q: debouncedQ, page }],
    queryFn: () =>
      listProducts({
        brandId: id,
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !!id,
  });

  const items = productsQ.data?.items ?? [];
  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      {/* ============================================================
          BACK + HEADER
          ============================================================ */}
      <Link
        href="/marcas"
        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a marcas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {brand?.name ?? 'Marca'}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong className="font-medium tabular-nums text-foreground">
              {total}
            </strong>{' '}
            {total === 1 ? 'producto de esta marca' : 'productos de esta marca'}
            {totalPages > 1 && (
              <> · página {page} de {totalPages}</>
            )}
          </p>
        </div>
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex h-10 max-w-[480px] flex-1 items-center gap-2 rounded-lg border bg-card px-3 transition-shadow focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar por SKU o nombre…"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search.value && (
            <button
              type="button"
              onClick={() => search.setValue('')}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          <strong className="font-semibold text-foreground tabular-nums">
            {total}
          </strong>{' '}
          {total === 1 ? 'producto' : 'productos'}
        </span>
      </div>

      {/* ============================================================
          PRODUCTS TABLE
          ============================================================ */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-[60px_120px_minmax(200px,1fr)_140px_120px_40px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span />
          <span>SKU</span>
          <span>Nombre</span>
          <span>Categoría</span>
          <span className="justify-self-end">Precio</span>
          <span />
        </div>

        {productsQ.isLoading && (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b px-4 py-4 last:border-b-0">
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        )}

        {!productsQ.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Package className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">
              Sin productos asociados a esta marca
            </p>
            <p className="max-w-[36ch] text-xs text-muted-foreground">
              Cuando asignes productos a &ldquo;{brand?.name ?? 'esta marca'}
              &rdquo;, aparecerán acá.
            </p>
          </div>
        )}

        {!productsQ.isLoading &&
          items.map((p) => {
            const cover = publicImageUrl(p.coverUrl ?? null);
            return (
              <div
                key={p.id}
                className="group grid grid-cols-[60px_120px_minmax(200px,1fr)_140px_120px_40px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 hover:bg-accent/30"
              >
                <Link href={`/productos/${p.id}`} className="inline-block">
                  <ProductThumbnail src={cover} size={44} />
                </Link>
                <Link
                  href={`/productos/${p.id}`}
                  className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {p.sku}
                </Link>
                <Link
                  href={`/productos/${p.id}`}
                  className="block min-w-0 truncate text-[13.5px] font-medium tracking-tight underline-offset-2 hover:underline"
                >
                  {p.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {p.category?.name ?? '—'}
                </span>
                <span className="justify-self-end font-mono text-sm font-medium tabular-nums">
                  {formatCurrency(p.price)}
                </span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                  aria-label="Más opciones"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

        {!productsQ.isLoading && total > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Mostrando{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {items.length}
              </strong>{' '}
              de{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {total}
              </strong>{' '}
              · página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFilter('page', String(Math.min(totalPages, page + 1)))
                }
                disabled={page >= totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
