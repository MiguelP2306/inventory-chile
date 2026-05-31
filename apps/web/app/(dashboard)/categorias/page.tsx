'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronRight,
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
import { Button } from '@/components/ui/button';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import { Skeleton } from '@/components/ui/skeleton';
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
 * Listado de categorías — diseño C1 · Lista Pulida.
 *
 * Reemplaza el `<SimpleNameList>` genérico por una vista jerárquica:
 *  · Una fila por categoría raíz (parentId === null).
 *  · Subcategorías inline como chips clicables debajo del nombre.
 *  · Acciones (abrir / editar / eliminar) en hover.
 *
 * Carga TODAS las categorías de una vez vía `listCategories()` (sin
 * paginación — son pocas decenas). El filtrado por nombre se hace
 * client-side y matchea tanto raíces como hijas.
 *
 * `SimpleNameList` queda intacto para Marcas / Vehículos donde sí tiene
 * sentido la paginación + listado plano.
 *
 * Si tu `CategoryDto` expone `productCount` (opcional), se muestra por
 * fila. Si no, la columna queda con guión y el contador global se omite.
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

  const allRoots = useMemo(
    () => all.filter((c) => !c.parentId),
    [all],
  );

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
  const totalProducts = all.reduce(
    (a, c) => a + (c.productCount ?? 0),
    0,
  );

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
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
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

  return (
    <div className="flex flex-col gap-5">
      {/* ============================================================
          PAGE HEAD
          ============================================================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              <strong className="font-medium tabular-nums text-foreground">
                {allRoots.length}
              </strong>{' '}
              {allRoots.length === 1 ? 'categoría' : 'categorías'}
            </span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span>
              <strong className="font-medium tabular-nums text-foreground">
                {totalSubcategories}
              </strong>{' '}
              {totalSubcategories === 1 ? 'subcategoría' : 'subcategorías'}
            </span>
            {totalProducts > 0 && (
              <>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span>
                  <strong className="font-medium tabular-nums text-foreground">
                    {totalProducts.toLocaleString('es-CL')}
                  </strong>{' '}
                  productos asociados
                </span>
              </>
            )}
          </p>
        </div>
        <Button onClick={startCreate} size="sm" variant="brand">
          <Plus className="h-4 w-4" />
          Nueva categoría
        </Button>
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="relative flex h-10 max-w-[480px] items-center gap-2 rounded-lg border bg-card px-3 transition-shadow focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre…"
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ============================================================
          LIST CARD
          ============================================================ */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-[1fr_120px_140px_140px] items-center gap-4 border-b bg-muted/40 px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Nombre</span>
          <span className="text-right">Productos</span>
          <span>Subcategorías</span>
          <span />
        </div>

        {query.isLoading && (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b px-4 py-5 last:border-b-0">
                <Skeleton className="h-5 w-48" />
              </div>
            ))}
          </div>
        )}

        {!query.isLoading && roots.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <p className="text-sm font-medium">
              {q
                ? 'Sin resultados para tu búsqueda'
                : 'No hay categorías cargadas'}
            </p>
            <p className="text-xs text-muted-foreground">
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Limpiar búsqueda
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startCreate}
                  className="underline underline-offset-2 hover:text-foreground"
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
              <CategoryRow
                key={c.id}
                category={c}
                kids={kids}
                onEdit={() => startEdit(c)}
                onDelete={() => setDeleteTarget(c)}
              />
            );
          })}

        {!query.isLoading && roots.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Mostrando{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {roots.length}
              </strong>{' '}
              de{' '}
              <strong className="font-semibold tabular-nums text-foreground">
                {allRoots.length}
              </strong>{' '}
              categorías
            </span>
            <Button onClick={startCreate} variant="ghost" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Nueva categoría
            </Button>
          </div>
        )}
      </div>

      {/* ============================================================
          DIALOGS — crear / editar / eliminar
          ============================================================ */}
      <SoftModal
        open={open}
        onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}
        title={editing ? `Editar "${editing.name}"` : 'Nueva categoría'}
        subtitle={
          editing
            ? 'Actualizá el nombre de la categoría'
            : 'Creá una categoría para organizar tus productos'
        }
      >
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div className="space-y-1">
            <label htmlFor="cat-name" className={softLabelClass}>
              Nombre
            </label>
            <input
              id="cat-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: Frenos"
              className={softInputClass}
            />
            <p className="text-[11px] text-slate-400">
              Entre 2 y 60 caracteres. Debe ser único.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeDialog}
              className={softSecondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                createMut.isPending || updateMut.isPending || !name.trim()
              }
              className={`${softPrimaryButtonClass} w-auto px-5`}
            >
              {editing ? 'Guardar' : 'Crear categoría'}
            </button>
          </div>
        </form>
      </SoftModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar categoría?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si tiene
              productos o subcategorías asociadas, la operación va a fallar —
              primero reasigná o eliminá lo que cuelga de ella.
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
   CategoryRow — una fila con chips de subcategorías inline
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
    <div className="group grid grid-cols-[1fr_120px_140px_140px] items-center gap-4 border-b px-4 py-4 text-sm last:border-b-0 hover:bg-accent/30">
      {/* Name + subcategory chips (chips are individual links) */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={`/categorias/${category.id}`}
          className="text-[14px] font-medium tracking-tight underline-offset-2 hover:underline"
        >
          {category.name}
        </Link>
        {kids.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {kids.slice(0, 3).map((s) => (
              <Link
                key={s.id}
                href={`/categorias/${s.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronRight className="h-2.5 w-2.5 opacity-60" />
                <span>{s.name}</span>
                {s.productCount != null && (
                  <span className="font-mono text-[9.5px] text-foreground/60 tabular-nums">
                    {s.productCount}
                  </span>
                )}
              </Link>
            ))}
            {kids.length > 3 && (
              <span className="px-1 text-[10.5px] text-muted-foreground">
                +{kids.length - 3} más
              </span>
            )}
          </div>
        )}
      </div>

      {/* Product count */}
      <div className="text-right">
        {category.productCount != null ? (
          <>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {category.productCount.toLocaleString('es-CL')}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              productos
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Subcategory count */}
      <div
        className={cn(
          'inline-flex items-center gap-1.5 text-[12px]',
          kids.length === 0 ? 'text-muted-foreground' : 'text-foreground/85',
        )}
      >
        <span className="font-mono font-semibold tabular-nums">
          {kids.length}
        </span>
        <span>{kids.length === 1 ? 'subcategoría' : 'subcategorías'}</span>
      </div>

      {/* Actions (hover) */}
      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Link
          href={`/categorias/${category.id}`}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Abrir
          <ArrowRight className="h-3 w-3" />
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
