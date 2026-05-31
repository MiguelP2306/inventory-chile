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
import { Button } from '@/components/ui/button';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
 * Detalle de categoría — diseño C1 unificado.
 *
 * Preserva 1:1 toda la lógica de Ronda 7 + Ronda 10:
 *  · `bulkUpdateProductCategory({ productIds, categoryId })` para Desvincular / Mover.
 *  · CRUD de subcategorías (createCategory con parentId, updateCategory, deleteCategory).
 *  · Filtros URL + debounce + paginación.
 *
 * La UI cambia a:
 *  · Header con back + breadcrumb + acciones (editar nombre / eliminar).
 *  · 4 stat cards: total productos · valor inventario · sin stock · margen.
 *  · Sección Subcategorías + Top productos lado a lado.
 *  · Tabla de productos refinada con bulk actions inline.
 *
 * Ronda 11 — datos:
 *  · `listCategories({ withStats: true })` provee productCount + 4 stats
 *    DIRECTOS por categoría (fallback rápido mientras carga el detalle).
 *  · `getCategory(id, { withStats: true })` provee los stats ROLLED-UP
 *    (categoría + sus subcategorías) + topProducts del mes en curso.
 *  · Cuando llega el detalle, sus valores override los del listado.
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
  const categoryFromList =
    allCategories.find((c) => c.id === id) ?? null;
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
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  // ---------- Ronda 10 — Subcategorías ----------
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
  const [subDeleteTarget, setSubDeleteTarget] = useState<CategoryDto | null>(
    null,
  );

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
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
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
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
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

  // Stats opcionales (ver TODO al final)
  const inventoryValue =
    category?.inventoryValue != null ? Number(category.inventoryValue) : null;
  const outOfStock = category?.outOfStockCount ?? null;
  const lowStock = category?.lowStockCount ?? null;
  const avgMargin = category?.avgMarginPct ?? null;
  const topProducts = category?.topProducts ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* ============================================================
          HEADER — back + breadcrumb + title + actions
          ============================================================ */}
      <Link
        href="/categorias"
        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a categorías
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {category?.parentName && (
            <Link
              href="/categorias"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              {category.parentName}
              <ChevronRight className="h-3 w-3 opacity-60" />
            </Link>
          )}
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {category?.name ?? 'Categoría'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              <strong className="font-medium tabular-nums text-foreground">
                {total}
              </strong>{' '}
              {total === 1 ? 'producto asociado' : 'productos asociados'}
            </span>
            {isRoot && subcategories.length > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>
                  <strong className="font-medium tabular-nums text-foreground">
                    {subcategories.length}
                  </strong>{' '}
                  {subcategories.length === 1
                    ? 'subcategoría'
                    : 'subcategorías'}
                </span>
              </>
            )}
            {(outOfStock ?? 0) + (lowStock ?? 0) > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span className="font-medium text-rose-600 dark:text-rose-400">
                  {(outOfStock ?? 0) + (lowStock ?? 0)} requieren reposición
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startEditCategory}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar nombre
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>
        </div>
      </div>

      {/* ============================================================
          STATS — 4 cards
          ============================================================ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package className="h-3 w-3" />}
          label="Total productos"
          value={String(total)}
          sub="incluye subcategorías"
        />
        <StatCard
          icon={<Wallet className="h-3 w-3" />}
          label="Valor inventario"
          value={
            inventoryValue != null
              ? formatCurrency(String(inventoryValue))
              : '—'
          }
          sub={inventoryValue != null ? 'stock × costo unitario' : 'sin datos'}
        />
        <StatCard
          icon={<AlertTriangle className="h-3 w-3" />}
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
          icon={<TrendingUp className="h-3 w-3" />}
          label="Margen promedio"
          value={avgMargin != null ? `${avgMargin}%` : '—'}
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
            <div className="rounded-2xl border bg-card shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold tracking-tight">
                    Subcategorías
                  </h3>
                  <p className="mt-1 max-w-prose text-[11.5px] leading-relaxed text-muted-foreground">
                    Ej: "Lubricantes sintéticos" dentro de "Lubricantes". Los
                    productos pueden asociarse directamente a la subcategoría;
                    al filtrar por esta categoría también se incluyen los
                    productos de sus subcategorías.
                  </p>
                </div>
                <Button size="sm" onClick={startCreateSub}>
                  <Plus className="h-3.5 w-3.5" />
                  Nueva subcategoría
                </Button>
              </div>
              <div className="px-2 py-2">
                {subcategoriesQ.isLoading && (
                  <div className="space-y-2 px-2 py-2">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                )}
                {!subcategoriesQ.isLoading && subcategories.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs italic text-muted-foreground">
                    Sin subcategorías. Usá «Nueva subcategoría» para crear la
                    primera.
                  </div>
                )}
                <div className="flex flex-col">
                  {subcategories.map((s) => (
                    <div
                      key={s.id}
                      className="group grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent/40"
                    >
                      <Link
                        href={`/categorias/${s.id}`}
                        className="min-w-0 font-medium underline-offset-2 hover:underline"
                      >
                        {s.name}
                      </Link>
                      <span className="font-mono text-[11.5px] text-muted-foreground">
                        {s.productCount != null ? (
                          <>
                            <strong className="font-semibold text-foreground">
                              {s.productCount}
                            </strong>{' '}
                            productos
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEditSub(s)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubDeleteTarget(s)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Eliminar"
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
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground hover:border-solid hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar subcategoría
                  </button>
                )}
              </div>
            </div>
          )}

          {topProducts && topProducts.length > 0 && (
            <div className="rounded-2xl border bg-card shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold tracking-tight">
                    Top productos
                  </h3>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    SKUs que más vendieron en esta categoría este mes.
                  </p>
                </div>
                <Link
                  href={`/reportes/ventas?categoryId=${id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Ver todos
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex flex-col gap-2 p-3">
                {topProducts.slice(0, 3).map((p) => (
                  <Link
                    key={p.id}
                    href={`/productos/${p.id}`}
                    className="-mx-1 grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md px-1 py-2 text-[12.5px] transition-colors hover:bg-accent/40"
                  >
                    <ProductThumbnail
                      src={p.coverUrl ? publicImageUrl(p.coverUrl) : null}
                      size={36}
                    />
                    <div className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {p.name}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{p.sku}</span>
                        <span>·</span>
                        <span className="font-mono">{p.units} u.</span>
                      </div>
                    </div>
                    <span className="font-mono text-[12px] font-semibold tabular-nums">
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
          DIALOG — crear / editar subcategoría
          ============================================================ */}
      <SoftModal
        open={subDialogOpen}
        onOpenChange={setSubDialogOpen}
        title={
          subEditing
            ? `Editar "${subEditing.name}"`
            : `Nueva subcategoría de ${category?.name ?? '—'}`
        }
        subtitle={
          subEditing
            ? 'Actualizá el nombre de la subcategoría'
            : 'Agregá una subcategoría para organizar mejor los productos'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!subName.trim()) return;
            if (subEditing) updateSubMut.mutate();
            else createSubMut.mutate();
          }}
          className="space-y-4 p-5"
        >
          <div className="space-y-1">
            <label htmlFor="sub-name" className={softLabelClass}>
              Nombre
            </label>
            <input
              id="sub-name"
              autoFocus
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="ej: Lubricantes sintéticos"
              className={softInputClass}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSubDialogOpen(false)}
              className={softSecondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                !subName.trim() ||
                createSubMut.isPending ||
                updateSubMut.isPending
              }
              className={`${softPrimaryButtonClass} w-auto px-5`}
            >
              {subEditing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </SoftModal>

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
          if (subDeleteTarget)
            await deleteSubMut.mutateAsync(subDeleteTarget.id);
        }}
      />

      {/* ============================================================
          DIALOG — editar nombre de la categoría actual
          ============================================================ */}
      <SoftModal
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Editar "${category?.name ?? '—'}"`}
        subtitle="Actualizá el nombre de la categoría"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editName.trim()) return;
            updateCatMut.mutate();
          }}
          className="space-y-4 p-5"
        >
          <div className="space-y-1">
            <label htmlFor="cat-name" className={softLabelClass}>
              Nombre
            </label>
            <input
              id="cat-name"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={softInputClass}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className={softSecondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!editName.trim() || updateCatMut.isPending}
              className={`${softPrimaryButtonClass} w-auto px-5`}
            >
              Guardar
            </button>
          </div>
        </form>
      </SoftModal>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar categoría?"
        description={
          category ? (
            <>
              Se eliminará <strong>{category.name}</strong>. Si tiene productos
              o subcategorías asociadas, la operación va a fallar — primero
              desvinculá o reasigná lo que cuelga de ella.
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
          PRODUCTS TOOLBAR + BULK
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
        <div className="grid grid-cols-[40px_60px_120px_minmax(200px,1fr)_140px_120px_40px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <button
            type="button"
            onClick={toggleAllOnPage}
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded border-[1.5px] transition-colors',
              allOnPageSelected
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card hover:border-muted-foreground',
            )}
            aria-label="Seleccionar todos en esta página"
          >
            {allOnPageSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
          </button>
          <span />
          <span>SKU</span>
          <span>Nombre</span>
          <span>Marca</span>
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
            <p className="text-sm font-medium">Sin productos en esta categoría</p>
            <p className="max-w-[36ch] text-xs text-muted-foreground">
              Cuando asignes productos a &ldquo;{category?.name ?? 'esta categoría'}
              &rdquo; o a sus subcategorías, aparecerán acá.
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
                className="group grid grid-cols-[40px_60px_120px_minmax(200px,1fr)_140px_120px_40px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 hover:bg-accent/30"
              >
                <button
                  type="button"
                  onClick={() => toggleRow(p.id)}
                  className={cn(
                    'inline-flex h-4 w-4 items-center justify-center rounded border-[1.5px] transition-colors',
                    isOn
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card hover:border-muted-foreground',
                  )}
                  aria-label={`Seleccionar ${p.sku}`}
                >
                  {isOn && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </button>
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
                  {p.brand?.name ?? '—'}
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

      {/* ============================================================
          BULK CONFIRM DIALOGS — preservados 1:1 de la lógica original
          ============================================================ */}
      <ConfirmDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="¿Desvincular productos de esta categoría?"
        description={
          <>
            Los <strong>{selected.size}</strong> producto
            {selected.size === 1 ? '' : 's'} seleccionado
            {selected.size === 1 ? '' : 's'} quedarán sin categoría asignada.
            Podrás reasignarlos después desde el detalle del producto o de
            otra categoría.
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
              {selected.size === 1 ? '' : 's'} se moverán a la categoría
              elegida.
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
          selected.size > 0
            ? 'translate-y-0 opacity-100'
            : 'translate-y-4 opacity-0',
        )}
        aria-hidden={selected.size === 0}
      >
        <div
          className={cn(
            'flex items-center gap-1 rounded-2xl border border-background/10 bg-foreground p-1.5 text-background shadow-2xl shadow-foreground/30 ring-1 ring-foreground/5',
            selected.size > 0 && 'pointer-events-auto',
          )}
        >
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-background/15 px-1.5 font-mono text-[11px] font-bold tabular-nums">
              {selected.size}
            </span>
            <span className="text-[13px] font-medium">
              {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
            </span>
          </div>
          <span className="h-6 w-px bg-background/15" />
          <button
            type="button"
            onClick={() => setUnlinkOpen(true)}
            disabled={bulkMut.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-background/10 disabled:opacity-50"
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
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-background/10 disabled:opacity-50"
          >
            <FolderInput className="h-3.5 w-3.5" />
            Mover
          </button>
          <span className="h-6 w-px bg-background/15" />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-background/70 transition-colors hover:bg-background/10 hover:text-background"
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
   StatCard — pequeña card con icon · label · big value · sub
   ============================================================ */
function StatCard({
  icon,
  label,
  value,
  valueTone,
  sub,
  subTone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueTone?: 'alert' | 'success';
  sub?: string;
  subTone?: 'alert' | 'success';
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border bg-card p-4 shadow-sm">
      <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </span>
      <span
        className={cn(
          'text-2xl font-semibold tracking-tight tabular-nums',
          valueTone === 'alert' && 'text-rose-600 dark:text-rose-400',
          valueTone === 'success' && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {value}
      </span>
      {sub && (
        <span
          className={cn(
            'text-[11.5px]',
            subTone === 'alert' && 'font-medium text-rose-600 dark:text-rose-400',
            subTone === 'success' &&
              'font-medium text-emerald-600 dark:text-emerald-400',
            !subTone && 'text-muted-foreground',
          )}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

