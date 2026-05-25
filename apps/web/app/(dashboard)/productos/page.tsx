'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  Car,
  Check,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  Filter as FilterIcon,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
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
  const productKind = (values.kind || ALL) as
    | 'ORIGINAL'
    | 'ALTERNATIVE'
    | typeof ALL;
  const vehMakeId = values.vmake || ALL;
  const vehModelId = values.vmodel || ALL;
  const vehYear = values.vyear ?? '';
  const createdFrom = values.createdFrom ?? '';
  const createdTo = values.createdTo ?? '';
  const page = Number(values.page || '1');

  const debouncedQ = (values.q ?? '').trim();

  const vehicleSearchActive =
    vehMakeId !== ALL || vehModelId !== ALL || vehYear !== '';
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
  const makes = useQuery({
    queryKey: ['vehicle-makes'],
    queryFn: listVehicleMakes,
  });
  const models = useQuery({
    queryKey: ['vehicle-models', vehMakeId],
    queryFn: () =>
      listVehicleModels(vehMakeId === ALL ? undefined : vehMakeId),
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

  // Derived display values for the chip labels + active-filters bar.
  const selectedCategory = categories.data?.find((c) => c.id === categoryId);
  const selectedBrand = brands.data?.find((b) => b.id === brandId);
  const selectedMake = makes.data?.find((m) => m.id === vehMakeId);
  const selectedModel = models.data?.find((m) => m.id === vehModelId);

  const activeFilterCount =
    (search.value !== '' ? 1 : 0) +
    (categoryId !== ALL ? 1 : 0) +
    (brandId !== ALL ? 1 : 0) +
    (productKind !== ALL ? 1 : 0) +
    (createdFrom !== '' || createdTo !== '' ? 1 : 0) +
    (vehicleSearchActive ? 1 : 0);

  const isLoading = list.isLoading || byVehicle.isLoading;

  return (
    <div className="flex flex-col gap-5">
      {/* ============================================================
          HEADER — title + stats + primary actions
          ============================================================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <strong className="font-medium tabular-nums text-foreground">
                {total.toLocaleString('es-CL')}
              </strong>{' '}
              {total === 1 ? 'resultado' : 'resultados'}
            </span>
            {activeFilterCount > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>
                  {activeFilterCount}{' '}
                  {activeFilterCount === 1 ? 'filtro activo' : 'filtros activos'}
                </span>
              </>
            )}
            {!vehicleSearchActive && totalPages > 1 && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>
                  Página {page} de {totalPages}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Ronda 10 — exportar catálogo PDF con los filtros activos.
              Ronda 12 — apuntar al API backend (no a Next.js) usando
              `apiAbsoluteUrl`. */}
          <Button asChild variant="outline" size="sm">
            <a
              href={apiAbsoluteUrl(
                `products/export.xlsx${buildCatalogQuery({
                  q: debouncedQ,
                  categoryId: categoryId === ALL ? undefined : categoryId,
                  brandId: brandId === ALL ? undefined : brandId,
                  productKind:
                    productKind === ALL ? undefined : productKind,
                  createdFrom: createdFrom || undefined,
                  createdTo: createdTo || undefined,
                })}`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="h-4 w-4" />
              Exportar Excel
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={apiAbsoluteUrl(
                `products/catalog.pdf${buildCatalogQuery({
                  q: debouncedQ,
                  categoryId: categoryId === ALL ? undefined : categoryId,
                  brandId: brandId === ALL ? undefined : brandId,
                  productKind:
                    productKind === ALL ? undefined : productKind,
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
          <Button asChild variant="outline" size="sm">
            <Link href="/productos/importar">
              <FileSpreadsheet className="h-4 w-4" />
              Importar Excel
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/productos/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Link>
          </Button>
        </div>
      </div>

      {/* ============================================================
          SMART TOOLBAR — prominent search + filter chips with popover
          ============================================================ */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex h-10 min-w-[260px] max-w-[520px] flex-1 items-center gap-2 rounded-lg border bg-card px-3 transition-shadow focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar por SKU, código universal, compatible, nombre…"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search.value && (
            <button
              type="button"
              onClick={() => search.setValue('')}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </div>

        {/* Categoría */}
        <CategoryChip
          categories={categories.data ?? []}
          value={categoryId}
          selectedName={selectedCategory?.name}
          onChange={(v) =>
            setFilters({ category: v === ALL ? null : v, page: null })
          }
        />

        {/* Marca */}
        <SimpleListChip
          icon={<Package className="h-3.5 w-3.5" />}
          label="Marca"
          placeholder="Buscar marca…"
          items={brands.data ?? []}
          value={brandId}
          selectedName={selectedBrand?.name}
          onChange={(v) =>
            setFilters({ brand: v === ALL ? null : v, page: null })
          }
        />

        {/* Tipo */}
        <KindChip
          value={productKind}
          onChange={(v) =>
            setFilters({ kind: v === ALL ? null : v, page: null })
          }
        />

        {/* Creados — date range */}
        <DateRangeChip
          from={createdFrom}
          to={createdTo}
          onChange={(from, to) =>
            setFilters({
              createdFrom: from || null,
              createdTo: to || null,
              page: null,
            })
          }
        />

        {/* Vehículo compatible — accent chip */}
        <VehicleChip
          makes={makes.data ?? []}
          models={models.data ?? []}
          vmake={vehMakeId}
          vmodel={vehModelId}
          vyear={vehYear}
          selectedMakeName={selectedMake?.name}
          selectedModelName={selectedModel?.name}
          onMakeChange={(v) =>
            setFilters({
              vmake: v === ALL ? null : v,
              vmodel: null,
              page: null,
            })
          }
          onModelChange={(v) =>
            setFilters({ vmodel: v === ALL ? null : v, page: null })
          }
          onYearChange={(v) => setFilters({ vyear: v || null, page: null })}
          onClear={() =>
            setFilters({
              vmake: null,
              vmodel: null,
              vyear: null,
              page: null,
            })
          }
        />

        <div className="flex-1" />

        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            className="text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* ============================================================
          ACTIVE FILTERS BAR — chip-pills, removable individually
          ============================================================ */}
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros activos
          </span>
          {search.value && (
            <FilterTag
              k="Texto"
              v={`"${search.value}"`}
              onRemove={() => search.setValue('')}
            />
          )}
          {categoryId !== ALL && selectedCategory && (
            <FilterTag
              k="Cat"
              v={selectedCategory.name}
              onRemove={() => setFilters({ category: null, page: null })}
            />
          )}
          {brandId !== ALL && selectedBrand && (
            <FilterTag
              k="Marca"
              v={selectedBrand.name}
              onRemove={() => setFilters({ brand: null, page: null })}
            />
          )}
          {productKind !== ALL && (
            <FilterTag
              k="Tipo"
              v={productKind === 'ORIGINAL' ? 'Original' : 'Alternativo'}
              onRemove={() => setFilters({ kind: null, page: null })}
            />
          )}
          {(createdFrom || createdTo) && (
            <FilterTag
              k="Creados"
              v={`${createdFrom || '…'} → ${createdTo || '…'}`}
              onRemove={() =>
                setFilters({
                  createdFrom: null,
                  createdTo: null,
                  page: null,
                })
              }
            />
          )}
          {vehicleSearchActive && (
            <FilterTag
              k="Vehículo"
              v={
                [
                  selectedMake?.name,
                  selectedModel?.name,
                  vehYear,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Cualquiera'
              }
              onRemove={() =>
                setFilters({
                  vmake: null,
                  vmodel: null,
                  vyear: null,
                  page: null,
                })
              }
            />
          )}
        </div>
      )}

      {/* ============================================================
          TABLE
          ============================================================ */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[68px]" />
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                SKU
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nombre
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categoría
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Marca
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tipo
              </TableHead>
              <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Costo
              </TableHead>
              <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Precio
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">
                      No encontramos productos
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filtersActive ? (
                        <>
                          Ajustá los filtros o{' '}
                          <button
                            type="button"
                            onClick={clear}
                            className="underline underline-offset-2 hover:text-foreground"
                          >
                            limpiá la búsqueda
                          </button>
                          .
                        </>
                      ) : (
                        'Empezá creando un producto nuevo.'
                      )}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              items.map((p) => {
                const cover = publicImageUrl(p.coverUrl ?? null);
                const costNum = p.cost ? Number(p.cost) : 0;
                const priceNum = p.price ? Number(p.price) : 0;
                const margin =
                  costNum > 0 && priceNum > 0
                    ? Math.round(((priceNum - costNum) / priceNum) * 100)
                    : null;
                return (
                  <TableRow key={p.id} className="group cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/productos/${p.id}`}
                        className="inline-block"
                      >
                        <ProductThumbnail src={cover} size={44} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/productos/${p.id}`}
                        className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {p.sku}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/productos/${p.id}`}
                        className="block underline-offset-2 hover:underline"
                      >
                        <span className="text-sm font-medium leading-tight">
                          {p.name}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.category?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.brand?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                          p.productKind === 'ORIGINAL'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {p.productKind === 'ORIGINAL'
                          ? 'Original'
                          : 'Alternativo'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(p.cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm font-medium tabular-nums">
                        {formatCurrency(p.price)}
                      </div>
                      {margin !== null && margin > 0 && (
                        <div className="text-[10px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                          +{margin}%
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

        {/* Pagination inside the same card */}
        {!vehicleSearchActive && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Mostrando{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {items.length}
              </strong>{' '}
              de{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {total.toLocaleString('es-CL')}
              </strong>{' '}
              {total === 1 ? 'producto' : 'productos'} · página {page} de{' '}
              {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFilter('page', String(Math.max(1, page - 1)))
                }
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

/* ============================================================
   CHIP TRIGGER — shared style for all popover triggers
   ============================================================ */

type ChipTriggerProps = {
  icon?: ReactNode;
  label: string;
  value?: string | null;
  active?: boolean;
  accent?: boolean;
};

function ChipTrigger({ icon, label, value, active, accent }: ChipTriggerProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 max-w-[280px] items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium shadow-sm transition-colors',
        'hover:bg-accent hover:text-foreground',
        active &&
          !accent &&
          'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background',
        accent &&
          'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/15',
      )}
    >
      {icon && <span className="opacity-75">{icon}</span>}
      <span>{label}</span>
      {value && (
        <span
          className={cn(
            'ml-0.5 max-w-[160px] truncate border-l pl-2 font-medium',
            active && !accent
              ? 'border-white/20'
              : accent
                ? 'border-orange-400/30'
                : 'border-border',
          )}
        >
          {value}
        </span>
      )}
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

/* ============================================================
   FILTER TAG — pill in the "active filters" bar
   ============================================================ */

function FilterTag({
  k,
  v,
  onRemove,
}: {
  k: string;
  v: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 pl-2.5 pr-1 text-[11px] text-muted-foreground">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {k}
      </span>
      <span className="font-medium text-foreground">{v}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Quitar filtro ${k}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/* ============================================================
   CATEGORÍA — hierarchical popover (root + indented children)
   ============================================================ */

type Cat = { id: string; name: string; parentId: string | null };

function CategoryChip({
  categories,
  value,
  selectedName,
  onChange,
}: {
  categories: Cat[];
  value: string;
  selectedName?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const roots = categories.filter((c) => c.parentId == null);
  const childrenByParent = new Map<string, Cat[]>();
  for (const c of categories) {
    if (!c.parentId) continue;
    const arr = childrenByParent.get(c.parentId) ?? [];
    arr.push(c);
    childrenByParent.set(c.parentId, arr);
  }
  const term = q.trim().toLowerCase();
  const matches = (name: string) =>
    !term || name.toLowerCase().includes(term);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <ChipTrigger
            icon={<Tag className="h-3.5 w-3.5" />}
            label="Categoría"
            value={selectedName}
            active={value !== ALL || open}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[300px] p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <PopHeader title="Categoría" canClear={value !== ALL} onClear={() => onChange(ALL)} />
        <PopSearch value={q} onChange={setQ} placeholder="Buscar categoría…" />
        <div className="mt-1 max-h-72 overflow-auto">
          <PopOption
            label="Todas las categorías"
            active={value === ALL}
            onClick={() => {
              onChange(ALL);
              setOpen(false);
            }}
          />
          {roots.map((r) => {
            const childs = childrenByParent.get(r.id) ?? [];
            const childMatches = childs.filter((c) =>
              matches(`${r.name} ${c.name}`),
            );
            const rootMatches = matches(r.name);
            if (!rootMatches && childMatches.length === 0) return null;
            return (
              <div key={r.id}>
                {rootMatches && (
                  <PopOption
                    label={r.name}
                    active={value === r.id}
                    onClick={() => {
                      onChange(r.id);
                      setOpen(false);
                    }}
                  />
                )}
                {childMatches.map((c) => (
                  <PopOption
                    key={c.id}
                    label={
                      <>
                        <span className="text-muted-foreground">› </span>
                        {c.name}
                      </>
                    }
                    indent
                    active={value === c.id}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   SIMPLE LIST CHIP — searchable single-select (used for Marca)
   ============================================================ */

function SimpleListChip({
  icon,
  label,
  placeholder,
  items,
  value,
  selectedName,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  placeholder: string;
  items: { id: string; name: string }[];
  value: string;
  selectedName?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const filtered = items.filter(
    (i) => !term || i.name.toLowerCase().includes(term),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <ChipTrigger
            icon={icon}
            label={label}
            value={selectedName}
            active={value !== ALL || open}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[260px] p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <PopHeader
          title={label}
          canClear={value !== ALL}
          onClear={() => onChange(ALL)}
        />
        <PopSearch value={q} onChange={setQ} placeholder={placeholder} />
        <div className="mt-1 max-h-72 overflow-auto">
          <PopOption
            label={`Todas las ${label.toLowerCase()}s`}
            active={value === ALL}
            onClick={() => {
              onChange(ALL);
              setOpen(false);
            }}
          />
          {filtered.map((i) => (
            <PopOption
              key={i.id}
              label={i.name}
              active={value === i.id}
              onClick={() => {
                onChange(i.id);
                setOpen(false);
              }}
            />
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Sin resultados.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   TIPO — 3-option chip (Todos / Original / Alternativo)
   ============================================================ */

function KindChip({
  value,
  onChange,
}: {
  value: 'ORIGINAL' | 'ALTERNATIVE' | typeof ALL;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    value === 'ORIGINAL'
      ? 'Original'
      : value === 'ALTERNATIVE'
        ? 'Alternativo'
        : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <ChipTrigger
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            label="Tipo"
            value={label ?? undefined}
            active={value !== ALL || open}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-2">
        <PopHeader title="Tipo de producto" />
        <div className="space-y-0.5">
          <PopOption
            label={
              <span>
                <span className="block font-medium">Todos los tipos</span>
                <span className="block text-[11px] text-muted-foreground">
                  Original + Alternativo
                </span>
              </span>
            }
            active={value === ALL}
            onClick={() => {
              onChange(ALL);
              setOpen(false);
            }}
          />
          <PopOption
            label={
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>
                  <span className="block font-medium">Originales</span>
                  <span className="block text-[11px] text-muted-foreground">
                    OEM y de marca
                  </span>
                </span>
              </span>
            }
            active={value === 'ORIGINAL'}
            onClick={() => {
              onChange('ORIGINAL');
              setOpen(false);
            }}
          />
          <PopOption
            label={
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>
                  <span className="block font-medium">Alternativos</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Compatibles / genéricos
                  </span>
                </span>
              </span>
            }
            active={value === 'ALTERNATIVE'}
            onClick={() => {
              onChange('ALTERNATIVE');
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   CREADOS — date range popover
   ============================================================ */

function DateRangeChip({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const value =
    from || to ? `${from || '…'} → ${to || '…'}` : undefined;
  const active = Boolean(from || to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <ChipTrigger
            icon={<CalendarIcon className="h-3.5 w-3.5" />}
            label="Creados"
            value={value}
            active={active || open}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-2">
        <PopHeader
          title="Rango de creación"
          canClear={active}
          onClear={() => onChange('', '')}
        />
        <div className="grid grid-cols-2 gap-2 px-1 pb-1 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Desde
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => onChange(e.target.value, to)}
              className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Hasta
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => onChange(from, e.target.value)}
              className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-foreground"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   VEHÍCULO COMPATIBLE — special chip (orange accent when active).
   When active the products list switches to /products-by-vehicle
   in the parent — same behavior as the original page.tsx.
   ============================================================ */

function VehicleChip({
  makes,
  models,
  vmake,
  vmodel,
  vyear,
  selectedMakeName,
  selectedModelName,
  onMakeChange,
  onModelChange,
  onYearChange,
  onClear,
}: {
  makes: { id: string; name: string }[];
  models: { id: string; name: string }[];
  vmake: string;
  vmodel: string;
  vyear: string;
  selectedMakeName?: string;
  selectedModelName?: string;
  onMakeChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onYearChange: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = vmake !== ALL || vmodel !== ALL || vyear !== '';
  const value = active
    ? [selectedMakeName, selectedModelName, vyear].filter(Boolean).join(' · ')
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <ChipTrigger
            icon={<Car className="h-3.5 w-3.5" />}
            label="Vehículo compatible"
            value={value}
            active={active || open}
            accent={active}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Vehículo compatible
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Cruza el catálogo con las compatibilidades cargadas.
            </p>
          </div>
          {active && (
            <button
              type="button"
              onClick={() => {
                onClear();
              }}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-[1fr_1fr_88px] gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Marca
            </label>
            <select
              value={vmake}
              onChange={(e) => onMakeChange(e.target.value)}
              className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-foreground"
            >
              <option value={ALL}>Cualquiera</option>
              {makes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Modelo
            </label>
            <select
              value={vmodel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={vmake === ALL}
              className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-foreground disabled:opacity-50"
            >
              <option value={ALL}>{vmake === ALL ? '—' : 'Cualquiera'}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Año
            </label>
            <select
              value={vyear}
              onChange={(e) => onYearChange(e.target.value)}
              className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-foreground"
            >
              <option value="">Cualq.</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   POPOVER PRIMITIVES
   ============================================================ */

function PopHeader({
  title,
  canClear,
  onClear,
}: {
  title: string;
  canClear?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="mb-1 flex items-center justify-between border-b px-1 pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {canClear && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

function PopSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-1 flex h-8 items-center gap-2 rounded-md bg-muted px-2">
      <Search className="h-3.5 w-3.5 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function PopOption({
  label,
  active,
  indent,
  onClick,
}: {
  label: ReactNode;
  active?: boolean;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent',
        active && 'bg-accent text-foreground',
      )}
    >
      <span
        className={cn(
          'mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
          active
            ? 'border-foreground bg-foreground text-background'
            : 'border-border bg-card',
        )}
      >
        {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          indent && 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </button>
  );
}

/* ============================================================
   Ronda 10 — arma la query string para el endpoint
   `/api/products/catalog.pdf` a partir de los filtros activos.
   ============================================================ */
function buildCatalogQuery(
  params: Record<string, string | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return (
    '?' +
    entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  );
}
