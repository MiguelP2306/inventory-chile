'use client';

import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
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
import { apiAbsoluteUrl } from '@/lib/api';
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
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
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
  // Ronda 9 — filtros por fecha de creación.
  createdFrom: '',
  createdTo: '',
  page: '',
} as const;

export default function ProductosPage() {
  const filters = useUrlFilters(filterDefaults);
  const { values, setFilter, setFilters, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });

  const categoryId = values.category || ALL;
  const brandId = values.brand || ALL;
  const productKind = (values.kind || ALL) as 'ORIGINAL' | 'ALTERNATIVE' | typeof ALL;
  const vehMakeId = values.vmake || ALL;
  const vehModelId = values.vmodel || ALL;
  const vehYear = values.vyear ?? '';
  const createdFrom = values.createdFrom ?? '';
  const createdTo = values.createdTo ?? '';
  const page = Number(values.page || '1');

  const debouncedQ = (values.q ?? '').trim();

  const vehicleSearchActive = vehMakeId !== ALL || vehModelId !== ALL || vehYear !== '';
  const filtersActive =
    debouncedQ !== '' ||
    search.value !== '' ||
    categoryId !== ALL ||
    brandId !== ALL ||
    productKind !== ALL ||
    createdFrom !== '' ||
    createdTo !== '' ||
    vehicleSearchActive;

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategories(),
  });
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  const models = useQuery({
    queryKey: ['vehicle-models', vehMakeId],
    queryFn: () => listVehicleModels(vehMakeId === ALL ? undefined : vehMakeId),
    enabled: makes.data !== undefined,
  });

  const list = useQuery({
    queryKey: [
      'products',
      {
        q: debouncedQ,
        categoryId,
        brandId,
        productKind,
        createdFrom,
        createdTo,
        page,
      },
    ],
    queryFn: () =>
      listProducts({
        q: debouncedQ || undefined,
        categoryId: categoryId === ALL ? undefined : categoryId,
        brandId: brandId === ALL ? undefined : brandId,
        productKind:
          productKind === ALL ? undefined : (productKind as ProductKindDto),
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
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
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Limpiar filtros
            </Button>
          )}
          {/* Ronda 10 — exportar catálogo PDF con los filtros activos.
              Ronda 12 — apuntar al API backend (no a Next.js) usando
              `apiAbsoluteUrl`. */}
          <Button asChild variant="outline">
            <a
              href={apiAbsoluteUrl(
                `products/catalog.pdf${buildCatalogQuery({
                  q: debouncedQ,
                  categoryId: categoryId === ALL ? undefined : categoryId,
                  brandId: brandId === ALL ? undefined : brandId,
                  productKind: productKind === ALL ? undefined : productKind,
                  createdFrom: createdFrom || undefined,
                  createdTo: createdTo || undefined,
                })}`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="h-4 w-4" />
              Catálogo PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/productos/importar">
              <FileSpreadsheet className="h-4 w-4" />
              Importar Excel
            </Link>
          </Button>
          <Button asChild>
            <Link href="/productos/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Link>
          </Button>
        </div>
      </div>

      {/* Filtros principales */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input
          placeholder="Buscar por SKU, código universal, compatible, nombre..."
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
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
            {/* Ronda 10 — render jerárquico: raíces con sus hijas debajo.
                Filtrar por la raíz incluye productos de cualquiera de
                sus subcategorías (resuelto en backend). */}
            {(() => {
              const all = categories.data ?? [];
              const roots = all.filter((c) => c.parentId == null);
              const childrenByParent = new Map<string, typeof all>();
              for (const c of all) {
                if (!c.parentId) continue;
                const arr = childrenByParent.get(c.parentId) ?? [];
                arr.push(c);
                childrenByParent.set(c.parentId, arr);
              }
              return roots.map((r) => [
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>,
                ...(childrenByParent.get(r.id) ?? []).map((child) => (
                  <SelectItem
                    key={child.id}
                    value={child.id}
                    className="pl-8"
                  >
                    {r.name} › {child.name}
                  </SelectItem>
                )),
              ]);
            })()}
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

      {/* Ronda 9 — filtro por fecha de creación. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Creados desde</label>
          <Input
            type="date"
            value={createdFrom}
            onChange={(e) =>
              setFilters({ createdFrom: e.target.value || null, page: null })
            }
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Creados hasta</label>
          <Input
            type="date"
            value={createdTo}
            onChange={(e) =>
              setFilters({ createdTo: e.target.value || null, page: null })
            }
          />
        </div>
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

      {/* Tabla */}
      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
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

/**
 * Ronda 10 — arma la query string para el endpoint `/api/products/catalog.pdf`
 * a partir de los filtros activos en la pantalla. Omite los `undefined` y
 * vacíos para que la URL quede limpia.
 */
function buildCatalogQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
