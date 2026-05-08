'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import {
  listBrands,
  listCategories,
  listProducts,
  listVehicleMakes,
  listVehicleModels,
  productsByVehicle,
  publicImageUrl,
} from '@/lib/catalog-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { ProductDto, ProductKindDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;
const MIN_YEAR = 1980;
const MAX_YEAR = new Date().getFullYear() + 1;
const YEAR_OPTIONS = Array.from(
  { length: MAX_YEAR - MIN_YEAR + 1 },
  (_, i) => MAX_YEAR - i,
);

const filterDefaults = {
  q: '',
  category: '',
  brand: '',
  kind: '',
  vmake: '',
  vmodel: '',
  vyear: '',
  page: '',
} as const;

export default function ProductosPage() {
  const { values, setFilter, setFilters, clear } = useUrlFilters(filterDefaults);

  const q = values.q ?? '';
  const categoryId = values.category || ALL;
  const brandId = values.brand || ALL;
  const productKind = (values.kind || ALL) as 'ORIGINAL' | 'ALTERNATIVE' | typeof ALL;
  const vehMakeId = values.vmake || ALL;
  const vehModelId = values.vmodel || ALL;
  const vehYear = values.vyear ?? '';
  const page = Number(values.page || '1');

  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const vehicleSearchActive = vehMakeId !== ALL || vehModelId !== ALL || vehYear !== '';
  const filtersActive =
    debouncedQ !== '' ||
    categoryId !== ALL ||
    brandId !== ALL ||
    productKind !== ALL ||
    vehicleSearchActive;

  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  const models = useQuery({
    queryKey: ['vehicle-models', vehMakeId],
    queryFn: () => listVehicleModels(vehMakeId === ALL ? undefined : vehMakeId),
    enabled: makes.data !== undefined,
  });

  const list = useQuery({
    queryKey: ['products', { q: debouncedQ, categoryId, brandId, productKind, page }],
    queryFn: () =>
      listProducts({
        q: debouncedQ || undefined,
        categoryId: categoryId === ALL ? undefined : categoryId,
        brandId: brandId === ALL ? undefined : brandId,
        productKind:
          productKind === ALL ? undefined : (productKind as ProductKindDto),
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !vehicleSearchActive,
  });

  const byVehicle = useQuery({
    queryKey: ['products-by-vehicle', { vehMakeId, vehModelId, vehYear }],
    queryFn: () =>
      productsByVehicle({
        makeId: vehMakeId === ALL ? undefined : vehMakeId,
        modelId: vehModelId === ALL ? undefined : vehModelId,
        year: vehYear ? Number(vehYear) : undefined,
      }),
    enabled: vehicleSearchActive,
  });

  const items: ProductDto[] = vehicleSearchActive
    ? (byVehicle.data ?? [])
    : (list.data?.items ?? []);
  const total = vehicleSearchActive ? items.length : (list.data?.total ?? 0);
  const totalPages = useMemo(() => {
    if (vehicleSearchActive) return 1;
    return Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));
  }, [list.data, vehicleSearchActive]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <Button asChild>
          <Link href="/productos/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </Button>
      </div>

      {/* Filtros principales */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input
          placeholder="Buscar por SKU, código universal, compatible, nombre..."
          value={q}
          onChange={(e) => setFilters({ q: e.target.value, page: null })}
        />
        <Select
          value={categoryId}
          onValueChange={(v) => setFilters({ category: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {categories.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={brandId}
          onValueChange={(v) => setFilters({ brand: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las marcas</SelectItem>
            {brands.data?.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={productKind}
          onValueChange={(v) => setFilters({ kind: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            <SelectItem value="ORIGINAL">Originales</SelectItem>
            <SelectItem value="ALTERNATIVE">Alternativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Búsqueda por vehículo */}
      <div className="rounded-md border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Buscar por vehículo compatible</h2>
          {vehicleSearchActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ vmake: null, vmodel: null, vyear: null })}
            >
              Limpiar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            value={vehMakeId}
            onValueChange={(v) =>
              setFilters({ vmake: v === ALL ? null : v, vmodel: null })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>—</SelectItem>
              {makes.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={vehModelId}
            onValueChange={(v) => setFilter('vmodel', v === ALL ? null : v)}
            disabled={vehMakeId === ALL}
          >
            <SelectTrigger>
              <SelectValue placeholder="Modelo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>—</SelectItem>
              {models.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={vehYear || ALL}
            onValueChange={(v) => setFilter('vyear', v === ALL ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Cualquier año</SelectItem>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtersActive && (
        <div>
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar todos los filtros
          </Button>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]" />
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.isLoading || byVehicle.isLoading) && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && !byVehicle.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => {
              const cover = publicImageUrl(p.coverUrl ?? null);
              return (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/productos/${p.id}`}>
                      <ProductThumbnail src={cover} size={40} />
                    </Link>
                  </TableCell>
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
                  <TableCell className="text-muted-foreground">
                    {p.brand?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        p.productKind === 'ORIGINAL'
                          ? 'rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300'
                          : 'rounded bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300'
                      }
                    >
                      {p.productKind === 'ORIGINAL' ? 'Original' : 'Alternativo'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(p.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(p.price)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {!vehicleSearchActive && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} producto{total === 1 ? '' : 's'} · página {page} de {totalPages}
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
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
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
