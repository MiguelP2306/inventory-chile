'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MoreHorizontal, Package, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { listBrands, listProducts, publicImageUrl } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 50;

/**
 * /marcas/[id] — Rediseño UI (look de MarcasView · vista detalle).
 *
 * SOLO UI/UX. Toda la lógica se preserva 1:1 desde page-c89f07ac:
 *  · useParams<{ id }>() + useUrlFilters({ q, page }) + useDebouncedUrlFilter.
 *  · Doble query: listBrands (para el nombre) + listProducts({ brandId, q, page }).
 *  · Paginación por URL. Pantalla de solo lectura (sin CRUD ni bulk).
 *
 * Cambios visuales (sistema compartido con Categorías / Almacenes):
 *  · Back link + header font-black con contador de productos.
 *  · Toolbar de búsqueda rounded-2xl con foco azul + contador a la derecha.
 *  · Tabla de productos en sheet rounded-3xl: Imagen / SKU / Nombre / Categoría / Precio.
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
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          BACK LINK
          ============================================================ */}
      <Link
        href="/marcas"
        className="group inline-flex w-fit items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Volver a marcas</span>
      </Link>

      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            {brand?.name ?? 'Marca'}
          </h1>
          <p className="mt-1.5 text-xs font-bold text-slate-500">
            <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
              {total}
            </strong>{' '}
            {total === 1 ? 'producto de esta marca' : 'productos de esta marca'}
            {totalPages > 1 && (
              <span className="text-slate-400">
                {' · '}página {page} de {totalPages}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ============================================================
          SEARCH TOOLBAR
          ============================================================ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar por SKU o nombre…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-xs font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/10 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-200"
          />
          {search.value && (
            <button
              type="button"
              onClick={() => search.setValue('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              aria-label="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="ml-auto font-mono text-[10.5px] font-black uppercase tracking-wider text-slate-400">
          <strong className="font-black tabular-nums text-slate-600 dark:text-slate-300">
            {total}
          </strong>{' '}
          {total === 1 ? 'producto' : 'productos'}
        </span>
      </div>

      {/* ============================================================
          PRODUCTS TABLE
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        {/* head */}
        <div className="grid grid-cols-[60px_120px_minmax(180px,1fr)_160px_120px_40px] items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
          <span>Imagen</span>
          <span>SKU</span>
          <span>Nombre</span>
          <span>Categoría</span>
          <span className="justify-self-end">Precio</span>
          <span />
        </div>

        {productsQ.isLoading && (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="border-b border-slate-100 px-5 py-4 last:border-b-0 dark:border-slate-800/80"
              >
                <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        )}

        {!productsQ.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Package className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              Sin productos asociados a esta marca
            </p>
            <p className="max-w-[40ch] text-xs text-slate-400">
              Cuando asignes productos a «{brand?.name ?? 'esta marca'}», aparecerán acá.
            </p>
          </div>
        )}

        {!productsQ.isLoading &&
          items.map((p) => {
            const cover = publicImageUrl(p.coverUrl ?? null);
            return (
              <div
                key={p.id}
                className="group grid grid-cols-[60px_120px_minmax(180px,1fr)_160px_120px_40px] items-center gap-3 border-b border-slate-100 px-5 py-3 text-xs transition-colors last:border-b-0 hover:bg-slate-50/60 dark:border-slate-800/80 dark:hover:bg-slate-800/10"
              >
                <Link href={`/productos/${p.id}`} className="inline-block">
                  <div className="overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
                    <ProductThumbnail src={cover} size={44} />
                  </div>
                </Link>
                <Link
                  href={`/productos/${p.id}`}
                  className="font-mono text-[11px] font-bold text-slate-500 underline-offset-2 transition-colors hover:text-[#2F6BFF] hover:underline dark:text-slate-400"
                >
                  {p.sku}
                </Link>
                <Link
                  href={`/productos/${p.id}`}
                  className="block min-w-0 truncate text-[12.5px] font-black uppercase tracking-tight text-slate-900 underline-offset-2 transition-colors hover:text-[#2F6BFF] hover:underline dark:text-white"
                >
                  {p.name}
                </Link>
                <span className="truncate font-bold text-slate-500 dark:text-slate-400">
                  {p.category?.name ?? '—'}
                </span>
                <span className="justify-self-end font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                  {formatCurrency(p.price)}
                </span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Más opciones"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

        {!productsQ.isLoading && total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 text-[11.5px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-400">
            <span>
              Mostrando{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {items.length}
              </strong>{' '}
              de{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {total}
              </strong>{' '}
              · página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
                disabled={page === 1}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
                disabled={page >= totalPages}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
