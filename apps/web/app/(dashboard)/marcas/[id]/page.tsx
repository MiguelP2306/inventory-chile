'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listBrands, listProducts } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 50;

/**
 * Ronda 7 — Detalle de marca: listado de productos asociados con búsqueda y
 * paginación. Sin selección múltiple ni acciones masivas (a diferencia de
 * categorías). El operador puede navegar de un producto a su detalle.
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/marcas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{brand?.name ?? 'Marca'}</h1>
          <p className="text-sm text-muted-foreground">
            {total} producto{total === 1 ? '' : 's'} de esta marca
          </p>
        </div>
      </div>

      <Input
        placeholder="Buscar por SKU o nombre"
        value={search.value}
        onChange={(e) => search.setValue(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productsQ.isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!productsQ.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin productos asociados a esta marca.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/productos/${p.id}`} className="hover:underline">
                    {p.sku}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/productos/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.category?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(p.price)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
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
  );
}
