'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  apiErrorMessage,
  createBrand,
  deleteBrand,
  listBrandsPaginated,
  updateBrand,
} from '@/lib/catalog-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 20;

/**
 * Listado de marcas — diseño C1 alineado con categorías.
 *
 * Reemplaza el `<SimpleNameList>` genérico por una vista pulida pero
 * mantiene 1:1 la lógica original:
 *  · `listBrandsPaginated({ q, page, pageSize })` con filtros en URL.
 *  · CRUD vía `createBrand` / `updateBrand` / `deleteBrand`.
 *  · ConfirmDialog para borrado + Dialog para crear/editar.
 *  · Toasts con apiErrorMessage.
 *
 * Las marcas son planas (sin parent/hijas) — no se muestran chips de
 * subcategorías ni stats. Cada fila linkea a `/marcas/[id]`.
 *
 * `SimpleNameList` sigue intacto para Vehículos / Vehículos / Modelos.
 */

interface BrandItem {
  id: string;
  name: string;
}

export default function MarcasPage() {
  const qc = useQueryClient();

  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BrandItem | null>(null);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BrandItem | null>(null);

  const query = useQuery({
    queryKey: ['brands', { q: debouncedQ, page }],
    queryFn: () =>
      listBrandsPaginated({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const createMut = useMutation({
    mutationFn: (n: string) => createBrand({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Marca creada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      updateBrand(id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Marca actualizada');
      closeDialog();
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Marca eliminada');
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
  function startEdit(item: BrandItem) {
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
          <h1 className="text-2xl font-semibold tracking-tight">Marcas</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong className="font-medium tabular-nums text-foreground">
              {total}
            </strong>{' '}
            {total === 1 ? 'marca registrada' : 'marcas registradas'}
            {totalPages > 1 && (
              <> · página {page} de {totalPages}</>
            )}
          </p>
        </div>
        <Button onClick={startCreate} size="sm">
          <Plus className="h-4 w-4" />
          Nueva marca
        </Button>
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="relative flex h-10 max-w-[480px] items-center gap-2 rounded-lg border bg-card px-3 transition-shadow focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          placeholder="Buscar por nombre…"
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

      {/* ============================================================
          LIST CARD
          ============================================================ */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-[1fr_140px] items-center gap-4 border-b bg-muted/40 px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Nombre</span>
          <span />
        </div>

        {query.isLoading && (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b px-4 py-4 last:border-b-0">
                <Skeleton className="h-5 w-48" />
              </div>
            ))}
          </div>
        )}

        {!query.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <p className="text-sm font-medium">
              {debouncedQ
                ? 'Sin resultados para tu búsqueda'
                : 'No hay marcas cargadas'}
            </p>
            <p className="text-xs text-muted-foreground">
              {debouncedQ ? (
                <button
                  type="button"
                  onClick={() => search.setValue('')}
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
                  Crear la primera marca
                </button>
              )}
            </p>
          </div>
        )}

        {!query.isLoading &&
          items.map((b) => (
            <BrandRow
              key={b.id}
              brand={b}
              onEdit={() => startEdit(b)}
              onDelete={() => setDeleteTarget(b)}
            />
          ))}

        {!query.isLoading && total > 0 && (
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
          DIALOGS — crear / editar / eliminar
          ============================================================ */}
      <Dialog
        open={open}
        onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar "${editing.name}"` : 'Nueva marca'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brand-name">Nombre</Label>
              <Input
                id="brand-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Bosch"
              />
              <p className="text-[11px] text-muted-foreground">
                Entre 2 y 60 caracteres. Debe ser único.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  createMut.isPending || updateMut.isPending || !name.trim()
                }
              >
                {editing ? 'Guardar' : 'Crear marca'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar marca?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si tiene
              productos asociados la operación va a fallar — primero
              reasigná o eliminá los productos.
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
   BrandRow — fila simple con name + actions hover
   ============================================================ */
function BrandRow({
  brand,
  onEdit,
  onDelete,
}: {
  brand: BrandItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group grid grid-cols-[1fr_140px] items-center gap-4 border-b px-4 py-4 text-sm last:border-b-0 hover:bg-accent/30">
      <Link
        href={`/marcas/${brand.id}`}
        className="min-w-0 text-[14px] font-medium tracking-tight underline-offset-2 hover:underline"
      >
        {brand.name}
      </Link>

      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Link
          href={`/marcas/${brand.id}`}
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
