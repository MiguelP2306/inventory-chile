'use client';

/* ============================================================================
 *  ProductosPage — REESTILIZADO con el sistema visual de "Catalog.tsx".
 *
 *  QUÉ CAMBIÓ (solo UI/UX — toda la data, filtros, queries y LINKS intactos):
 *   · Barra de TABS arriba (Productos/Categorías/Marcas/Vehículos) como links
 *     de navegación a tus rutas + sello "SII Chile Conectado · CLP ($)".
 *   · Título font-black + "{n} resultados". Botones de acción rounded-xl
 *     (Exportar Excel, Catálogo PDF, Importar Excel) y "Nuevo producto"
 *     oscuro — TODOS conservan tus href/Link originales (export API,
 *     /productos/importar, /productos/nuevo).
 *   · Search rounded-xl con badge ⌘K. Filtros con popover RICOS conservados
 *     (categoría jerárquica, marca buscable, tipo, rango de fechas, vehículo
 *     marca+modelo+año) pero con el trigger reestilizado al "pill" de Catalog.
 *   · Tabla rounded-2xl: thumbnail rounded-xl, SKU mono, nombre bold +
 *     subtítulo de compatibilidad, badges Original (verde) / Alternativo
 *     (azul) con punto, costo/precio mono + margen, paginación rounded-xl.
 *   · Las filas siguen enlazando a /productos/[id] (tu flujo de edición). No
 *     se agregó columna de acciones editar/eliminar porque tu página no tiene
 *     handler de delete — la edición ocurre navegando a [id].
 *
 *  DEPENDENCIAS: idénticas. No agrega ninguna.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  Car,
  Check,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ProductThumbnail } from '@/components/product-thumbnail';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Permission, useCan } from '@/lib/current-user-context';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { usePathname } from 'next/navigation';
import type { ProductDto, ProductKindDto } from '@inventory/shared';

const ACCENT = '#2F6BFF';
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
  createdFrom: '',
  createdTo: '',
  page: '',
} as const;

/* Tabs del catálogo → tus rutas reales (nav, no estado interno). */
const CATALOG_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/productos', label: 'Productos', icon: Package },
  { href: '/categorias', label: 'Categorías', icon: Tag },
  { href: '/marcas', label: 'Marcas', icon: SlidersHorizontal },
  { href: '/vehiculos', label: 'Vehículos', icon: Car },
];

export default function ProductosPage() {
  const filters = useUrlFilters(filterDefaults);
  const { values, setFilter, setFilters, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const pathname = usePathname();
  const canSeeCost = useCan(Permission.PRODUCT_VIEW_COST);

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

  const catalogQuery = buildCatalogQuery({
    q: debouncedQ,
    categoryId: categoryId === ALL ? undefined : categoryId,
    brandId: brandId === ALL ? undefined : brandId,
    productKind: productKind === ALL ? undefined : productKind,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
  });

  return (
    <div className="flex flex-col gap-5 text-slate-800 dark:text-slate-200">
      {/* ============================================================
          TAB BAR — links a tus rutas + sello CLP
          ============================================================ */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-0.5 text-xs dark:bg-slate-950">
          {CATALOG_TABS.map((t) => {
            const active = pathname === t.href;
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[11.5px] font-bold transition-all',
                  active
                    ? 'bg-white text-[#2F6BFF] shadow-sm dark:bg-slate-800 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>
                  {t.label}
                  {t.href === '/productos' && total > 0
                    ? ` (${total.toLocaleString('es-CL')})`
                    : ''}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="font-mono text-[10px] font-medium text-slate-400 dark:text-slate-500">
          SII Chile Conectado • CLP ($)
        </div>
      </div>

      {/* ============================================================
          HEADER — título + stats + acciones (links conservados)
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Productos
          </h1>
          <p className="mt-0.5 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              {total.toLocaleString('es-CL')}{' '}
              {total === 1 ? 'resultado' : 'resultados'}
            </span>
            {activeFilterCount > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="font-medium text-slate-400">
                  {activeFilterCount}{' '}
                  {activeFilterCount === 1 ? 'filtro activo' : 'filtros activos'}
                </span>
              </>
            )}
            {!vehicleSearchActive && totalPages > 1 && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="font-medium text-slate-400">
                  Página {page} de {totalPages}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Exportar Excel — link a tu API (conservado) */}
          <ActionButton
            as="a"
            href={apiAbsoluteUrl(`products/export.xlsx${catalogQuery}`)}
            target="_blank"
            rel="noopener noreferrer"
            icon={FileSpreadsheet}
          >
            Exportar Excel
          </ActionButton>
          {/* Catálogo PDF — link a tu API (conservado) */}
          <ActionButton
            as="a"
            href={apiAbsoluteUrl(`products/catalog.pdf${catalogQuery}`)}
            target="_blank"
            rel="noopener noreferrer"
            icon={FileText}
          >
            Catálogo PDF
          </ActionButton>
          {/* Importar Excel — Link conservado */}
          <ActionButton as="link" href="/productos/importar" icon={Upload}>
            Importar Excel
          </ActionButton>
          {/* Nuevo producto — Link conservado, botón oscuro (estilo Catalog) */}
          <Link
            href="/productos/nuevo"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-950 px-4 py-2.5 text-[11.5px] font-extrabold text-white shadow-md transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </div>
      </div>

      {/* ============================================================
          SEARCH + FILTER PILLS
          ============================================================ */}
      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Search */}
        <div className="relative min-w-[30%] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar por SKU, código universal, compatible, nombre…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-12 text-xs text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          />
          {search.value ? (
            <button
              type="button"
              onClick={() => search.setValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-800 sm:inline">
              ⌘K
            </span>
          )}
        </div>

        {/* Filter pills (popovers ricos conservados, trigger reestilizado) */}
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip
            categories={categories.data ?? []}
            value={categoryId}
            selectedName={selectedCategory?.name}
            onChange={(v) =>
              setFilters({ category: v === ALL ? null : v, page: null })
            }
          />
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
          <KindChip
            value={productKind}
            onChange={(v) =>
              setFilters({ kind: v === ALL ? null : v, page: null })
            }
          />
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
          <VehicleChip
            makes={makes.data ?? []}
            models={models.data ?? []}
            vmake={vehMakeId}
            vmodel={vehModelId}
            vyear={vehYear}
            selectedMakeName={selectedMake?.name}
            selectedModelName={selectedModel?.name}
            onMakeChange={(v) =>
              setFilters({ vmake: v === ALL ? null : v, vmodel: null, page: null })
            }
            onModelChange={(v) =>
              setFilters({ vmodel: v === ALL ? null : v, page: null })
            }
            onYearChange={(v) => setFilters({ vyear: v || null, page: null })}
            onClear={() =>
              setFilters({ vmake: null, vmodel: null, vyear: null, page: null })
            }
          />
          {filtersActive && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ============================================================
          ACTIVE FILTERS BAR
          ============================================================ */}
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Filtros activos
          </span>
          {search.value && (
            <FilterTag k="Texto" v={`"${search.value}"`} onRemove={() => search.setValue('')} />
          )}
          {categoryId !== ALL && selectedCategory && (
            <FilterTag k="Cat" v={selectedCategory.name} onRemove={() => setFilters({ category: null, page: null })} />
          )}
          {brandId !== ALL && selectedBrand && (
            <FilterTag k="Marca" v={selectedBrand.name} onRemove={() => setFilters({ brand: null, page: null })} />
          )}
          {productKind !== ALL && (
            <FilterTag k="Tipo" v={productKind === 'ORIGINAL' ? 'Original' : 'Alternativo'} onRemove={() => setFilters({ kind: null, page: null })} />
          )}
          {(createdFrom || createdTo) && (
            <FilterTag k="Creados" v={`${createdFrom || '…'} → ${createdTo || '…'}`} onRemove={() => setFilters({ createdFrom: null, createdTo: null, page: null })} />
          )}
          {vehicleSearchActive && (
            <FilterTag
              k="Vehículo"
              v={[selectedMake?.name, selectedModel?.name, vehYear].filter(Boolean).join(' · ') || 'Cualquiera'}
              onRemove={() => setFilters({ vmake: null, vmodel: null, vyear: null, page: null })}
            />
          )}
        </div>
      )}

      {/* ============================================================
          TABLE
          ============================================================ */}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-[#11151C]">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="w-[50px] px-4 py-3" />
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Nombre</th>
                <th className="px-3 py-3">Categoría</th>
                <th className="px-3 py-3">Marca</th>
                <th className="px-3 py-3">Tipo</th>
                {canSeeCost && (
                  <th className="px-3 py-3 text-right">Costo</th>
                )}
                <th className="px-3 py-3 text-right">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={canSeeCost ? 8 : 7} className="px-3">
                      <Skeleton className="my-1 h-10 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={canSeeCost ? 8 : 7}>
                    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Package className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        No encontramos productos
                      </p>
                      <p className="text-xs text-slate-400">
                        {filtersActive ? (
                          <>
                            Ajustá los filtros o{' '}
                            <button
                              type="button"
                              onClick={clear}
                              className="font-medium underline underline-offset-2 hover:text-slate-700"
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
                  </td>
                </tr>
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
                  const isOriginal = p.productKind === 'ORIGINAL';
                  return (
                    <tr
                      key={p.id}
                      className="group border-b border-slate-50 transition-colors hover:bg-slate-50/60 dark:border-slate-800/50 dark:hover:bg-slate-800/20"
                    >
                      <td className="py-2.5 pl-4 pr-1">
                        <Link href={`/productos/${p.id}`} className="inline-block">
                          <ProductThumbnail src={cover} size={42} />
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/productos/${p.id}`}
                          className="font-mono text-[11.5px] font-medium text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-500"
                        >
                          {p.sku}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/productos/${p.id}`}
                          className="block underline-offset-2 hover:underline"
                        >
                          <span className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-200">
                            {p.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {p.category?.name ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {p.brand?.name ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        {isOriginal ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-[#E6F4EA] px-2.5 py-1 text-[10px] font-bold text-[#137333] dark:border-transparent dark:bg-emerald-950/40 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#137333] dark:bg-emerald-400" />
                            Original
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-[#E8F0FE] px-2.5 py-1 text-[10px] font-bold text-[#1A73E8] dark:border-transparent dark:bg-blue-950/40 dark:text-blue-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#1A73E8] dark:bg-blue-400" />
                            Alternativo
                          </span>
                        )}
                      </td>
                      {canSeeCost && (
                        <td className="px-3 py-3 text-right font-mono text-[12px] font-medium tabular-nums text-slate-400">
                          {p.cost != null ? formatCurrency(p.cost) : '—'}
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        <div className="font-mono text-[12.5px] font-black tabular-nums text-slate-900 dark:text-white">
                          {formatCurrency(p.price)}
                        </div>
                        {canSeeCost && margin !== null && margin > 0 && (
                          <span className="mt-0.5 block text-[9.5px] font-extrabold tracking-tight text-[#137333] dark:text-emerald-400">
                            +{margin}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination (lógica conservada) */}
        {!vehicleSearchActive && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/10">
            <span className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              Mostrando{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {items.length}
              </strong>{' '}
              de{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {total.toLocaleString('es-CL')}
              </strong>{' '}
              {total === 1 ? 'producto' : 'productos'} · página {page} de{' '}
              {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
                disabled={page === 1}
                className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilter('page', String(Math.min(totalPages, page + 1)))
                }
                disabled={page >= totalPages}
                className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
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

/* ============================================================
   ACTION BUTTON — pill rounded-xl (Excel / PDF / Importar)
   Soporta <a> externo o <Link> interno conservando tus hrefs.
   ============================================================ */
function ActionButton({
  as,
  href,
  icon: Icon,
  children,
  ...rest
}: {
  as: 'a' | 'link';
  href: string;
  icon: LucideIcon;
  children: ReactNode;
  target?: string;
  rel?: string;
}) {
  const cls =
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11.5px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
  const inner = (
    <>
      <Icon className="h-4 w-4 text-slate-500" />
      {children}
    </>
  );
  if (as === 'link') {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      {inner}
    </a>
  );
}

/* ============================================================
   CHIP TRIGGER — estilo "pill" rounded-xl (Catalog) reusable
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
        'inline-flex h-9 max-w-[280px] items-center gap-1.5 rounded-xl border bg-white px-3.5 text-xs font-bold shadow-sm transition-colors dark:bg-slate-900',
        accent
          ? 'border-[#2F6BFF]/30 bg-[#2F6BFF]/5 text-[#2F6BFF] hover:bg-[#2F6BFF]/10 dark:border-[#2F6BFF]/40 dark:bg-[#2F6BFF]/10 dark:text-blue-400'
          : active
            ? 'border-[#2F6BFF]/40 text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
            : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {icon && <span className={accent ? '' : 'text-slate-400'}>{icon}</span>}
      <span>{label}</span>
      {value && (
        <span
          className={cn(
            'ml-0.5 max-w-[160px] truncate border-l pl-2 font-bold',
            accent
              ? 'border-[#2F6BFF]/30 text-[#2F6BFF] dark:text-blue-400'
              : 'border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white',
          )}
        >
          {value}
        </span>
      )}
      <ChevronDown className="h-3 w-3 opacity-50" />
    </button>
  );
}

/* ============================================================
   FILTER TAG — pill en la barra de "filtros activos"
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
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
        {k}
      </span>
      <span className="font-semibold text-slate-700 dark:text-slate-200">{v}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700"
        aria-label={`Quitar filtro ${k}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/* ============================================================
   CATEGORÍA — popover jerárquico (idéntico en lógica)
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
  const matches = (name: string) => !term || name.toLowerCase().includes(term);

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
        className="w-[300px] rounded-xl p-2"
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
            const childMatches = childs.filter((c) => matches(`${r.name} ${c.name}`));
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
                        <span className="text-slate-400">› </span>
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
   SIMPLE LIST CHIP — single-select buscable (Marca)
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
  const filtered = items.filter((i) => !term || i.name.toLowerCase().includes(term));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <ChipTrigger icon={icon} label={label} value={selectedName} active={value !== ALL || open} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[260px] rounded-xl p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <PopHeader title={label} canClear={value !== ALL} onClear={() => onChange(ALL)} />
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
            <p className="px-2 py-4 text-center text-xs text-slate-400">
              Sin resultados.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   TIPO — chip 3 opciones (Todos / Original / Alternativo)
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
      <PopoverContent align="start" className="w-[240px] rounded-xl p-2">
        <PopHeader title="Tipo de producto" />
        <div className="space-y-0.5">
          <PopOption
            label={
              <span>
                <span className="block font-semibold">Todos los tipos</span>
                <span className="block text-[11px] text-slate-400">
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
                  <span className="block font-semibold">Originales</span>
                  <span className="block text-[11px] text-slate-400">
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
                  <span className="block font-semibold">Alternativos</span>
                  <span className="block text-[11px] text-slate-400">
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
   CREADOS — popover de rango de fechas
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
  const value = from || to ? `${from || '…'} → ${to || '…'}` : undefined;
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
      <PopoverContent align="start" className="w-[320px] rounded-xl p-2">
        <PopHeader title="Rango de creación" canClear={active} onClear={() => onChange('', '')} />
        <div className="grid grid-cols-2 gap-2 px-1 pb-1 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Desde
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => onChange(e.target.value, to)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#2F6BFF] dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Hasta
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => onChange(from, e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#2F6BFF] dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   VEHÍCULO COMPATIBLE — chip accent azul (lógica conservada)
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
      <PopoverContent align="start" className="w-[380px] rounded-xl p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Vehículo compatible
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Cruza el catálogo con las compatibilidades cargadas.
            </p>
          </div>
          {active && (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="grid grid-cols-[1fr_1fr_88px] gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Marca
            </label>
            <select
              value={vmake}
              onChange={(e) => onMakeChange(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#2F6BFF] dark:border-slate-700 dark:bg-slate-900"
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Modelo
            </label>
            <select
              value={vmodel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={vmake === ALL}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#2F6BFF] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Año
            </label>
            <select
              value={vyear}
              onChange={(e) => onYearChange(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#2F6BFF] dark:border-slate-700 dark:bg-slate-900"
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
    <div className="mb-1 flex items-center justify-between border-b border-slate-100 px-1 pb-2 dark:border-slate-800">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {title}
      </span>
      {canClear && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
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
    <div className="mb-1 flex h-8 items-center gap-2 rounded-lg bg-slate-100 px-2 dark:bg-slate-800">
      <Search className="h-3.5 w-3.5 text-slate-400" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
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
        'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800',
        active && 'bg-slate-100 dark:bg-slate-800',
      )}
    >
      <span
        className={cn(
          'mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
          active
            ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900',
        )}
      >
        {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', indent && 'text-slate-400')}>
        {label}
      </span>
    </button>
  );
}

/* ============================================================
   Arma la query string para los endpoints de exportación
   (idéntico al original).
   ============================================================ */
function buildCatalogQuery(
  params: Record<string, string | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
