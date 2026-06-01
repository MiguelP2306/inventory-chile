'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  FolderInput,
  Link2Off,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProductThumbnail } from '@/components/product-thumbnail';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  apiErrorMessage,
  bulkUpdateProductCategory,
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  listProducts,
  publicImageUrl,
  updateCategory,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { CategoryDto } from '@inventory/shared';

const PAGE_SIZE = 50;

/**
 * /categorias/[id] — Rediseño UI (look de CategoriasView · vista detalle).
 *
 * SOLO UI/UX. Toda la lógica se preserva 1:1 desde page-c3aa73b0:
 *  · useUrlFilters({ q, page }) + useDebouncedUrlFilter para el search.
 *  · categoriesQ / categoryDetailQ (stats rolled-up) / productsQ / subcategoriesQ.
 *  · bulkUpdateProductCategory({ productIds, categoryId }) → Desvincular / Mover.
 *  · CRUD de subcategorías (createCategory con parentId / updateCategory / deleteCategory).
 *  · Edición / eliminación de la categoría actual.
 *  · Selección de productos en memoria + paginación.
 *
 * Cambios visuales (sistema compartido con Almacenes / Movimientos):
 *  · Back link + header font-black con stats y acento rojo "requieren reposición".
 *  · 4 stat cards rounded-2xl con icono, valor grande y subtexto.
 *  · Subcategorías + Top productos lado a lado en sheets rounded-3xl.
 *  · Tabla de productos con checkbox custom y barra flotante de bulk actions.
 *  · Modales crear/editar custom con overlay blur (reemplazan <SoftModal>).
 *  · <ConfirmDialog> y <Select> (destino de mover) se conservan tal cual.
 */

type CategoryWithStats = CategoryDto & {
  productCount?: number;
  inventoryValue?: number | string;
  outOfStockCount?: number;
  lowStockCount?: number;
  avgMarginPct?: number;
  topProducts?: Array<{
    id: string;
    sku: string;
    name: string;
    units: number;
    amount: number;
    coverUrl?: string | null;
  }>;
};

export default function CategoriaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  // Selección de productos (en memoria, recarga la pierde — aceptable).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = useState<string>('');
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  // Edición / eliminación de la propia categoría
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const categoriesQ = useQuery({
    queryKey: ['categories', { withStats: true }],
    queryFn: () => listCategories({ withStats: true }),
  });
  const allCategories = (categoriesQ.data ?? []) as CategoryWithStats[];
  const otherCategories = allCategories.filter((c) => c.id !== id);

  // Detalle con stats rolled-up + topProducts del mes. Mientras carga,
  // caemos al item del listado (que ya tiene stats DIRECTOS) para no
  // mostrar "—" en la transición.
  const categoryDetailQ = useQuery({
    queryKey: ['category', id, { withStats: true }],
    queryFn: () => getCategory(id, { withStats: true }),
    enabled: !!id,
  });
  const categoryFromList = allCategories.find((c) => c.id === id) ?? null;
  const category: CategoryWithStats | null =
    (categoryDetailQ.data as CategoryWithStats | undefined) ?? categoryFromList;

  const productsQ = useQuery({
    queryKey: ['products', { categoryId: id, q: debouncedQ, page }],
    queryFn: () =>
      listProducts({
        categoryId: id,
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !!id,
  });

  const items = productsQ.data?.items ?? [];
  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((p) => selected.has(p.id)),
    [items, selected],
  );

  function toggleRow(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }
  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const it of items) next.delete(it.id);
      } else {
        for (const it of items) next.add(it.id);
      }
      return next;
    });
  }

  const bulkMut = useMutation({
    mutationFn: ({ categoryId }: { categoryId: string | null }) =>
      bulkUpdateProductCategory({
        productIds: Array.from(selected),
        categoryId,
      }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(
        vars.categoryId === null
          ? `${res.updated} producto${res.updated === 1 ? '' : 's'} desvinculado${res.updated === 1 ? '' : 's'}`
          : `${res.updated} producto${res.updated === 1 ? '' : 's'} movido${res.updated === 1 ? '' : 's'}`,
      );
      setSelected(new Set());
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  // ---------- Subcategorías ----------
  const isRoot = category?.parentId == null;

  const subcategoriesQ = useQuery({
    queryKey: ['categories', { parentId: id, withStats: true }],
    queryFn: () => listCategories({ parentId: id, withStats: true }),
    enabled: !!id && isRoot,
  });
  const subcategories = (subcategoriesQ.data ?? []) as CategoryWithStats[];

  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subEditing, setSubEditing] = useState<CategoryDto | null>(null);
  const [subName, setSubName] = useState('');
  const [subDeleteTarget, setSubDeleteTarget] = useState<CategoryDto | null>(null);

  function startCreateSub() {
    setSubEditing(null);
    setSubName('');
    setSubDialogOpen(true);
  }
  function startEditSub(s: CategoryDto) {
    setSubEditing(s);
    setSubName(s.name);
    setSubDialogOpen(true);
  }

  const createSubMut = useMutation({
    mutationFn: () => createCategory({ name: subName.trim(), parentId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Subcategoría creada');
      setSubDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateSubMut = useMutation({
    mutationFn: () => updateCategory(subEditing!.id, { name: subName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Subcategoría actualizada');
      setSubDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const deleteSubMut = useMutation({
    mutationFn: (cid: string) => deleteCategory(cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Subcategoría eliminada');
      setSubDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  // ---------- Editar / eliminar categoría actual ----------
  const updateCatMut = useMutation({
    mutationFn: () => updateCategory(id, { name: editName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría actualizada');
      setEditOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const deleteCatMut = useMutation({
    mutationFn: () => deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría eliminada');
      window.location.href = '/categorias';
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function startEditCategory() {
    setEditName(category?.name ?? '');
    setEditOpen(true);
  }

  // Stats opcionales
  const inventoryValue =
    category?.inventoryValue != null ? Number(category.inventoryValue) : null;
  const outOfStock = category?.outOfStockCount ?? null;
  const lowStock = category?.lowStockCount ?? null;
  const avgMargin = category?.avgMarginPct ?? null;
  const topProducts = category?.topProducts ?? null;

  const reposicion = (outOfStock ?? 0) + (lowStock ?? 0);
  const subSaving = createSubMut.isPending || updateSubMut.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          BACK LINK
          ============================================================ */}
      <Link
        href="/categorias"
        className="group inline-flex w-fit items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Volver a categorías</span>
      </Link>

      {/* ============================================================
          HEADER — breadcrumb + title + stats + acciones
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0">
          {category?.parentName && (
            <Link
              href="/categorias"
              className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
            >
              {category.parentName}
              <ChevronRight className="h-3 w-3 opacity-60" />
            </Link>
          )}
          <h1 className="mt-0.5 text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            {category?.name ?? 'Categoría'}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span>
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {total}
              </strong>{' '}
              {total === 1 ? 'producto asociado' : 'productos asociados'}
            </span>
            {isRoot && subcategories.length > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span>
                  <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                    {subcategories.length}
                  </strong>{' '}
                  {subcategories.length === 1 ? 'subcategoría' : 'subcategorías'}
                </span>
              </>
            )}
            {reposicion > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="inline-flex items-center gap-1.5 font-extrabold text-[#E03131] dark:text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E03131]" />
                  {reposicion} requieren reposición
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={startEditCategory}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 dark:border-slate-800 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Pencil className="h-3.5 w-3.5 text-slate-400" />
            <span>Editar nombre</span>
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-[#E03131] shadow-sm transition-all hover:bg-rose-50 active:scale-95 dark:border-rose-950/30 dark:bg-transparent dark:hover:bg-rose-950/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Eliminar</span>
          </button>
        </div>
      </div>

      {/* ============================================================
          STATS — 4 cards
          ============================================================ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package className="h-3.5 w-3.5" />}
          label="Total productos"
          value={String(total)}
          sub="incluye subcategorías"
        />
        <StatCard
          icon={<Wallet className="h-3.5 w-3.5" />}
          label="Valor inventario"
          value={inventoryValue != null ? formatCurrency(String(inventoryValue)) : '—'}
          valueMono
          sub={inventoryValue != null ? 'stock × costo unitario' : 'sin datos'}
        />
        <StatCard
          icon={<AlertTriangle className="h-3.5 w-3.5 text-[#E03131]" />}
          label="Sin stock"
          value={outOfStock != null ? String(outOfStock) : '—'}
          valueTone={outOfStock && outOfStock > 0 ? 'alert' : undefined}
          sub={
            outOfStock != null
              ? lowStock && lowStock > 0
                ? `+${lowStock} stock crítico`
                : 'todos con stock'
              : 'sin datos'
          }
          subTone={lowStock && lowStock > 0 ? 'alert' : undefined}
        />
        <StatCard
          icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
          label="Margen promedio"
          value={avgMargin != null ? `${avgMargin}%` : '—'}
          valueMono
          valueTone={avgMargin != null && avgMargin > 0 ? 'success' : undefined}
          sub={avgMargin != null ? 'precio venta vs costo' : 'sin datos'}
        />
      </div>

      {/* ============================================================
          SUBCATEGORÍAS + TOP PRODUCTOS (lado a lado)
          ============================================================ */}
      {(isRoot || (topProducts && topProducts.length > 0)) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          {isRoot && (
            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
                <div className="min-w-0">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Subcategorías
                  </h3>
                  <p className="mt-1.5 max-w-prose text-[11.5px] font-medium leading-relaxed text-slate-400">
                    Ej: «Lubricantes sintéticos» dentro de «Lubricantes». Los productos
                    pueden asociarse directamente a la subcategoría; al filtrar por esta
                    categoría también se incluyen los de sus subcategorías.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCreateSub}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#2F6BFF] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-[#2F6BFF]/90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Nueva subcategoría</span>
                </button>
              </div>

              <div className="p-3">
                {subcategoriesQ.isLoading && (
                  <div className="space-y-2 p-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
                      />
                    ))}
                  </div>
                )}

                {!subcategoriesQ.isLoading && subcategories.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-8 text-center dark:border-slate-800">
                    <p className="text-xs font-medium italic text-slate-400">
                      Sin subcategorías. Usá «Nueva subcategoría» para crear la primera.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-0.5">
                  {subcategories.map((s) => (
                    <div
                      key={s.id}
                      className="group grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <Link
                        href={`/categorias/${s.id}`}
                        className="inline-flex min-w-0 items-center gap-2 self-start"
                      >
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#2F6BFF] opacity-70 dark:text-blue-400" />
                        <span className="truncate text-[12.5px] font-bold text-slate-700 transition-colors hover:text-[#2F6BFF] dark:text-slate-200">
                          {s.name}
                        </span>
                      </Link>
                      <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-slate-400">
                        {s.productCount != null ? (
                          <>
                            <strong className="font-bold text-slate-600 dark:text-slate-300">
                              {s.productCount}
                            </strong>{' '}
                            productos
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEditSub(s)}
                          aria-label="Editar"
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubDeleteTarget(s)}
                          aria-label="Eliminar"
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-[#E03131] dark:hover:bg-rose-950/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {!subcategoriesQ.isLoading && subcategories.length > 0 && (
                  <button
                    type="button"
                    onClick={startCreateSub}
                    className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 py-2.5 text-xs font-bold text-slate-400 transition-all hover:border-solid hover:border-[#2F6BFF]/40 hover:bg-[#2F6BFF]/5 hover:text-[#2F6BFF] dark:border-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar subcategoría
                  </button>
                )}
              </div>
            </div>
          )}

          {topProducts && topProducts.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
                <div className="min-w-0">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Top productos
                  </h3>
                  <p className="mt-1.5 text-[11.5px] font-medium text-slate-400">
                    SKUs que más vendieron este mes.
                  </p>
                </div>
                <Link
                  href={`/reportes/ventas?categoryId=${id}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-white hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                >
                  Ver todos
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex flex-col gap-1 p-3">
                {topProducts.slice(0, 3).map((p) => (
                  <Link
                    key={p.id}
                    href={`/productos/${p.id}`}
                    className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
                  >
                    <ProductThumbnail
                      src={p.coverUrl ? publicImageUrl(p.coverUrl) : null}
                      size={40}
                    />
                    <div className="min-w-0">
                      <span className="block truncate text-[12.5px] font-bold text-slate-800 dark:text-white">
                        {p.name}
                      </span>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                        <span className="font-mono">{p.sku}</span>
                        <span>·</span>
                        <span className="font-mono">{p.units} u.</span>
                      </div>
                    </div>
                    <span className="whitespace-nowrap font-mono text-[12px] font-black tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(String(p.amount))}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          PRODUCTS TOOLBAR
          ============================================================ */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
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
        <div className="grid grid-cols-[40px_60px_120px_minmax(180px,1fr)_140px_120px_40px] items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
          <button
            type="button"
            onClick={toggleAllOnPage}
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded-[5px] border-[1.5px] transition-colors',
              allOnPageSelected
                ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900',
            )}
            aria-label="Seleccionar todos en esta página"
          >
            {allOnPageSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
          </button>
          <span>Imagen</span>
          <span>SKU</span>
          <span>Nombre</span>
          <span>Marca</span>
          <span className="justify-self-end">Precio</span>
          <span />
        </div>

        {productsQ.isLoading && (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-slate-100 px-5 py-4 last:border-b-0 dark:border-slate-800/80">
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
              Sin productos en esta categoría
            </p>
            <p className="max-w-[40ch] text-xs text-slate-400">
              Cuando asignes productos a «{category?.name ?? 'esta categoría'}» o a sus
              subcategorías, aparecerán acá.
            </p>
          </div>
        )}

        {!productsQ.isLoading &&
          items.map((p) => {
            const isOn = selected.has(p.id);
            const cover = publicImageUrl(p.coverUrl ?? null);
            return (
              <div
                key={p.id}
                className={cn(
                  'group grid grid-cols-[40px_60px_120px_minmax(180px,1fr)_140px_120px_40px] items-center gap-3 border-b border-slate-100 px-5 py-3 text-xs transition-colors last:border-b-0 dark:border-slate-800/80',
                  isOn
                    ? 'bg-[#2F6BFF]/[0.04] dark:bg-blue-950/10'
                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/10',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleRow(p.id)}
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded-[5px] border-[1.5px] transition-colors',
                    isOn
                      ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                      : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900',
                  )}
                  aria-label={`Seleccionar ${p.sku}`}
                >
                  {isOn && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </button>
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
                  {p.brand?.name ?? '—'}
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

      {/* ============================================================
          MODAL — crear / editar subcategoría (custom)
          ============================================================ */}
      {subDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-[#11151C]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {subEditing
                    ? `Editar "${subEditing.name}"`
                    : `Nueva subcategoría de ${category?.name ?? '—'}`}
                </h4>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {subEditing
                    ? 'Actualizá el nombre de la subcategoría'
                    : 'Agregá una subcategoría para organizar mejor los productos'}
                </p>
              </div>
              <button
                onClick={() => setSubDialogOpen(false)}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!subName.trim()) return;
                if (subEditing) updateSubMut.mutate();
                else createSubMut.mutate();
              }}
              className="space-y-4 p-5"
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Nombre
                </label>
                <input
                  autoFocus
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="ej: Lubricantes sintéticos"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSubDialogOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!subName.trim() || subSaving}
                  className="rounded-xl bg-[#2F6BFF] px-5 py-2 text-xs font-black text-white shadow-md transition-colors hover:bg-opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {subSaving ? 'Guardando…' : subEditing ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!subDeleteTarget}
        onOpenChange={(o) => !o && setSubDeleteTarget(null)}
        title="¿Eliminar subcategoría?"
        description={
          subDeleteTarget
            ? `Eliminará "${subDeleteTarget.name}". Si tiene productos asociados, la operación devolverá un error y deberás reasignarlos primero.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (subDeleteTarget) await deleteSubMut.mutateAsync(subDeleteTarget.id);
        }}
      />

      {/* ============================================================
          MODAL — editar nombre de la categoría actual (custom)
          ============================================================ */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-[#11151C]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  Editar "{category?.name ?? '—'}"
                </h4>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Actualizá el nombre de la categoría
                </p>
              </div>
              <button
                onClick={() => setEditOpen(false)}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editName.trim()) return;
                updateCatMut.mutate();
              }}
              className="space-y-4 p-5"
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Nombre
                </label>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!editName.trim() || updateCatMut.isPending}
                  className="rounded-xl bg-[#2F6BFF] px-5 py-2 text-xs font-black text-white shadow-md transition-colors hover:bg-opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateCatMut.isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar categoría?"
        description={
          category ? (
            <>
              Se eliminará <strong>{category.name}</strong>. Si tiene productos o
              subcategorías asociadas, la operación va a fallar — primero desvinculá o
              reasigná lo que cuelga de ella.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          await deleteCatMut.mutateAsync();
        }}
      />

      {/* ============================================================
          BULK CONFIRM DIALOGS — preservados 1:1
          ============================================================ */}
      <ConfirmDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="¿Desvincular productos de esta categoría?"
        description={
          <>
            Los <strong>{selected.size}</strong> producto
            {selected.size === 1 ? '' : 's'} seleccionado
            {selected.size === 1 ? '' : 's'} quedarán sin categoría asignada. Podrás
            reasignarlos después desde el detalle del producto o de otra categoría.
          </>
        }
        confirmLabel="Desvincular"
        onConfirm={async () => {
          await bulkMut.mutateAsync({ categoryId: null });
        }}
      />

      <ConfirmDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title="Mover productos a otra categoría"
        description={
          <div className="space-y-3">
            <p>
              Los <strong>{selected.size}</strong> producto
              {selected.size === 1 ? '' : 's'} seleccionado
              {selected.size === 1 ? '' : 's'} se moverán a la categoría elegida.
            </p>
            <Select value={moveTargetId} onValueChange={setMoveTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí categoría destino" />
              </SelectTrigger>
              <SelectContent>
                {otherCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        confirmLabel="Mover"
        onConfirm={async () => {
          if (!moveTargetId) {
            toast.error('Elegí una categoría destino');
            throw new Error('no target');
          }
          await bulkMut.mutateAsync({ categoryId: moveTargetId });
        }}
      />

      {/* ============================================================
          FLOATING BULK ACTION BAR — aparece al seleccionar productos
          ============================================================ */}
      <div
        className={cn(
          'pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-200 ease-out',
          selected.size > 0 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
        aria-hidden={selected.size === 0}
      >
        <div
          className={cn(
            'flex items-center gap-1 rounded-2xl border border-white/10 bg-[#2F6BFF] p-1.5 text-white shadow-2xl shadow-[#2F6BFF]/40',
            selected.size > 0 && 'pointer-events-auto',
          )}
        >
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/20 px-1.5 font-mono text-[11px] font-black tabular-nums">
              {selected.size}
            </span>
            <span className="text-[12.5px] font-bold">
              {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
            </span>
          </div>
          <span className="h-6 w-px bg-white/20" />
          <button
            type="button"
            onClick={() => setUnlinkOpen(true)}
            disabled={bulkMut.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-bold transition-colors hover:bg-white/15 disabled:opacity-50"
          >
            <Link2Off className="h-3.5 w-3.5" />
            Desvincular
          </button>
          <button
            type="button"
            onClick={() => {
              setMoveTargetId('');
              setMoveOpen(true);
            }}
            disabled={bulkMut.isPending || otherCategories.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-bold transition-colors hover:bg-white/15 disabled:opacity-50"
          >
            <FolderInput className="h-3.5 w-3.5" />
            Mover
          </button>
          <span className="h-6 w-px bg-white/20" />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Limpiar selección"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   StatCard — icon · label · valor grande · subtexto
   (look de CategoriasView)
   ============================================================ */
function StatCard({
  icon,
  label,
  value,
  valueMono,
  valueTone,
  sub,
  subTone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueMono?: boolean;
  valueTone?: 'alert' | 'success';
  sub?: string;
  subTone?: 'alert' | 'success';
}) {
  return (
    <div className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:border-slate-200 dark:border-slate-850 dark:bg-[#11151C] dark:hover:border-slate-800">
      <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className="my-1">
        <span
          className={cn(
            'text-2xl font-black tracking-tight tabular-nums',
            valueMono && 'font-mono',
            valueTone === 'alert'
              ? 'text-[#E03131] dark:text-rose-400'
              : valueTone === 'success'
                ? 'text-[#137333] dark:text-emerald-400'
                : 'text-slate-900 dark:text-white',
          )}
        >
          {value}
        </span>
      </div>
      {sub && (
        <span
          className={cn(
            'text-[10px] font-semibold',
            subTone === 'alert'
              ? 'font-extrabold text-[#A61C1C] dark:text-rose-300'
              : subTone === 'success'
                ? 'font-extrabold text-[#137333] dark:text-emerald-400'
                : 'text-slate-400',
          )}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
