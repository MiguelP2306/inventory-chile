'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronRight,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Portal } from '@/components/ui/portal';
import {
  apiErrorMessage,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '@/lib/catalog-api';
import { cn } from '@/lib/utils';
import type { CategoryDto } from '@inventory/shared';

/**
 * /categorias — Rediseño UI (look de CategoriasView).
 *
 * SOLO UI/UX. La lógica de datos es idéntica a la versión previa
 * (page-88f5b5c4): una sola carga vía `listCategories({ withStats: true })`,
 * agrupado raíz/hijos en memoria, filtro client-side que matchea raíces y
 * subcategorías, y mutaciones create/update/delete con sus toasts.
 *
 * Cambios visuales (sistema compartido con Almacenes / Movimientos):
 *  · Header font-black + subtítulo con stats y acento #2F6BFF.
 *  · "Sheet" rounded-3xl con tabla; fila con FolderTree azul, nombre en
 *    uppercase black, chips de subcategoría y acciones en hover.
 *  · Search rounded-2xl con foco azul.
 *  · Modal crear/editar custom con overlay blur (reemplaza <SoftModal>).
 *  · <ConfirmDialog> se conserva tal cual (misma lógica de borrado).
 */

type CategoryWithCount = CategoryDto & { productCount?: number };

export default function CategoriasPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CategoryDto | null>(null);

  const query = useQuery({
    queryKey: ['categories', { withStats: true }],
    queryFn: () => listCategories({ withStats: true }),
  });

  const all = (query.data ?? []) as CategoryWithCount[];

  const childrenByParent = useMemo(() => {
    const m = new Map<string, CategoryWithCount[]>();
    for (const c of all) {
      if (!c.parentId) continue;
      const arr = m.get(c.parentId) ?? [];
      arr.push(c);
      m.set(c.parentId, arr);
    }
    return m;
  }, [all]);

  const allRoots = useMemo(() => all.filter((c) => !c.parentId), [all]);

  const roots = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allRoots
      .filter((c) => {
        if (!term) return true;
        if (c.name.toLowerCase().includes(term)) return true;
        const kids = childrenByParent.get(c.id) ?? [];
        return kids.some((k) => k.name.toLowerCase().includes(term));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [allRoots, q, childrenByParent]);

  const totalSubcategories = allRoots.reduce(
    (a, c) => a + (childrenByParent.get(c.id)?.length ?? 0),
    0,
  );
  const totalProducts = all.reduce((a, c) => a + (c.productCount ?? 0), 0);

  const createMut = useMutation({
    mutationFn: (n: string) => createCategory({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría creada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      updateCategory(id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría actualizada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categoría eliminada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setName('');
  }
  function startCreate() {
    setEditing(null);
    setName('');
    setOpen(true);
  }
  function startEdit(item: CategoryDto) {
    setEditing(item);
    setName(item.name);
    setOpen(true);
  }
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) updateMut.mutate({ id: editing.id, n: trimmed });
    else createMut.mutate(trimmed);
  }

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Categorías
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-slate-400 dark:text-slate-500">
            <span>
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {allRoots.length}
              </strong>{' '}
              {allRoots.length === 1 ? 'categoría' : 'categorías'}
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            <span>
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {totalSubcategories}
              </strong>{' '}
              {totalSubcategories === 1 ? 'subcategoría' : 'subcategorías'}
            </span>
            {totalProducts > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span>
                  <strong className="font-extrabold tabular-nums text-[#2F6BFF] dark:text-blue-400">
                    {totalProducts.toLocaleString('es-CL')}
                  </strong>{' '}
                  productos asociados
                </span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={startCreate}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90 sm:self-auto"
        >
          <Plus className="h-[18px] w-[18px]" />
          <span>Nueva categoría</span>
        </button>
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre…"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-xs font-semibold text-slate-800 shadow-sm outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/10 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-200"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            aria-label="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ============================================================
          LIST SHEET
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-3.5 pl-6 pr-3">Nombre</th>
                <th className="w-32 py-3.5 px-3 text-right">Productos</th>
                <th className="w-44 py-3.5 px-3">Subcategorías</th>
                <th className="w-40 py-3.5 pr-6 pl-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {query.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={4} className="px-6 py-5">
                      <div className="h-4 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!query.isLoading && roots.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-14 text-center">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      {q ? 'Sin resultados para tu búsqueda' : 'No hay categorías cargadas'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {q ? (
                        <button
                          type="button"
                          onClick={() => setQ('')}
                          className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Limpiar búsqueda
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startCreate}
                          className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          Crear la primera categoría
                        </button>
                      )}
                    </p>
                  </td>
                </tr>
              )}

              {!query.isLoading &&
                roots.map((c) => {
                  const kids = childrenByParent.get(c.id) ?? [];
                  return (
                    <CategoryRow
                      key={c.id}
                      category={c}
                      kids={kids}
                      onEdit={() => startEdit(c)}
                      onDelete={() => setDeleteTarget(c)}
                    />
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Mobile: tarjetas apiladas (la tabla scrollea feo en teléfonos) */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 sm:hidden">
          {query.isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-5">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ))}

          {!query.isLoading && roots.length === 0 && (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {q ? 'Sin resultados para tu búsqueda' : 'No hay categorías cargadas'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {q ? (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Limpiar búsqueda
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Crear la primera categoría
                  </button>
                )}
              </p>
            </div>
          )}

          {!query.isLoading &&
            roots.map((c) => {
              const kids = childrenByParent.get(c.id) ?? [];
              return (
                <CategoryCard
                  key={c.id}
                  category={c}
                  kids={kids}
                  onEdit={() => startEdit(c)}
                  onDelete={() => setDeleteTarget(c)}
                />
              );
            })}
        </div>

        {!query.isLoading && roots.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3.5 text-[11.5px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-400">
            <span>
              Mostrando{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {roots.length}
              </strong>{' '}
              de{' '}
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {allRoots.length}
              </strong>{' '}
              categorías
            </span>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva categoría
            </button>
          </div>
        )}
      </div>

      {/* ============================================================
          MODAL crear / editar (custom — reemplaza SoftModal)
          ============================================================ */}
      {open && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-100 bg-white shadow-xl animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-[#11151C]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {editing ? `Editar "${editing.name}"` : 'Nueva categoría'}
                </h4>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {editing
                    ? 'Actualizá el nombre de la categoría'
                    : 'Creá una categoría para organizar tus productos'}
                </p>
              </div>
              <button
                onClick={closeDialog}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Nombre
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej: Frenos"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900"
                />
                <span className="block text-[10px] font-medium text-slate-400">
                  Entre 2 y 60 caracteres. Debe ser único.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || saving}
                  className="rounded-xl bg-[#2F6BFF] px-5 py-2 text-xs font-black text-white shadow-md transition-colors hover:bg-opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </Portal>
      )}

      {/* ============================================================
          CONFIRMACIÓN DE BORRADO (sin cambios de lógica)
          ============================================================ */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar categoría?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si tiene productos o
              subcategorías asociadas, la operación va a fallar — primero reasigná o
              eliminá lo que cuelga de ella.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget) await removeMut.mutateAsync(deleteTarget.id);
        }}
      />
    </div>
  );
}

/* ============================================================
   CategoryRow — fila con FolderTree, chips de subcategoría inline
   y acciones (abrir / editar / eliminar) en hover.
   ============================================================ */
function CategoryRow({
  category,
  kids,
  onEdit,
  onDelete,
}: {
  category: CategoryWithCount;
  kids: CategoryWithCount[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="group transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/10">
      {/* Nombre + chips de subcategoría */}
      <td className="py-4 pl-6 pr-3 align-top">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={`/categorias/${category.id}`}
            className="inline-flex items-center gap-2.5 self-start"
          >
            <FolderTree className="h-4 w-4 shrink-0 text-[#2F6BFF] transition-transform group-hover:scale-105 dark:text-blue-400" />
            <span className="text-[12.5px] font-black uppercase tracking-tight text-slate-800 transition-colors group-hover:text-[#2F6BFF] dark:text-slate-100 dark:group-hover:text-blue-400">
              {category.name}
            </span>
          </Link>
          {kids.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-[26px]">
              {kids.slice(0, 4).map((s) => (
                <Link
                  key={s.id}
                  href={`/categorias/${s.id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-bold text-slate-500 transition-colors hover:border-[#2F6BFF]/30 hover:bg-[#2F6BFF]/5 hover:text-[#2F6BFF] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                >
                  <ChevronRight className="h-2.5 w-2.5 opacity-50" />
                  <span>{s.name}</span>
                  {s.productCount != null && (
                    <span className="font-mono text-[9.5px] tabular-nums opacity-70">
                      {s.productCount}
                    </span>
                  )}
                </Link>
              ))}
              {kids.length > 4 && (
                <span className="self-center px-1 text-[10.5px] font-bold text-slate-400">
                  +{kids.length - 4} más
                </span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Productos */}
      <td className="py-4 px-3 text-right align-top">
        {category.productCount != null ? (
          <>
            <p className="text-[13px] font-black leading-none tabular-nums text-slate-800 dark:text-white">
              {category.productCount.toLocaleString('es-CL')}
            </p>
            <p className="mt-1 text-[10px] font-medium text-slate-400">productos</p>
          </>
        ) : (
          <span className="text-slate-300 dark:text-slate-600">—</span>
        )}
      </td>

      {/* Subcategorías count */}
      <td className="py-4 px-3 align-top">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-bold',
            kids.length === 0
              ? 'text-slate-400 dark:text-slate-500'
              : 'text-slate-600 dark:text-slate-300',
          )}
        >
          <span className="font-mono tabular-nums">{kids.length}</span>
          <span>{kids.length === 1 ? 'subcategoría' : 'subcategorías'}</span>
        </span>
      </td>

      {/* Acciones (hover) */}
      <td className="py-4 pr-6 pl-3 text-right align-top">
        <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
          <Link
            href={`/categorias/${category.id}`}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-300"
          >
            Abrir
            <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={onEdit}
            title="Editar"
            className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-600 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-300"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar"
            className="cursor-pointer rounded-xl border border-rose-100 p-2 text-rose-400 transition-all hover:bg-rose-50/50 dark:border-rose-950/20 dark:hover:bg-rose-950/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ============================================================
   CategoryCard — versión MÓVIL de la fila (sin scroll horizontal).
   Nombre + acciones arriba, stats, y chips de subcategoría debajo.
   ============================================================ */
function CategoryCard({
  category,
  kids,
  onEdit,
  onDelete,
}: {
  category: CategoryWithCount;
  kids: CategoryWithCount[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/categorias/${category.id}`}
          className="inline-flex min-w-0 items-center gap-2.5"
        >
          <FolderTree className="h-4 w-4 shrink-0 text-[#2F6BFF] dark:text-blue-400" />
          <span className="truncate text-[13px] font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">
            {category.name}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Editar"
            className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-300"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Eliminar"
            className="cursor-pointer rounded-xl border border-rose-100 p-2 text-rose-400 transition-colors hover:bg-rose-50/50 dark:border-rose-950/20 dark:hover:bg-rose-950/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-[26px] text-[11px] font-bold text-slate-500 dark:text-slate-400">
        <span>
          <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
            {category.productCount ?? 0}
          </strong>{' '}
          {(category.productCount ?? 0) === 1 ? 'producto' : 'productos'}
        </span>
        <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        <span>
          <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
            {kids.length}
          </strong>{' '}
          {kids.length === 1 ? 'subcategoría' : 'subcategorías'}
        </span>
      </div>

      {kids.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[26px]">
          {kids.slice(0, 4).map((s) => (
            <Link
              key={s.id}
              href={`/categorias/${s.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-bold text-slate-500 transition-colors hover:border-[#2F6BFF]/30 hover:bg-[#2F6BFF]/5 hover:text-[#2F6BFF] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            >
              <ChevronRight className="h-2.5 w-2.5 opacity-50" />
              <span>{s.name}</span>
              {s.productCount != null && (
                <span className="font-mono text-[9.5px] tabular-nums opacity-70">
                  {s.productCount}
                </span>
              )}
            </Link>
          ))}
          {kids.length > 4 && (
            <span className="self-center px-1 text-[10.5px] font-bold text-slate-400">
              +{kids.length - 4} más
            </span>
          )}
        </div>
      )}
    </div>
  );
}
