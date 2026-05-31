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
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import { Skeleton } from '@/components/ui/skeleton';
import {
  apiErrorMessage,
  createVehicleMake,
  deleteVehicleMake,
  listVehicleMakesPaginated,
  updateVehicleMake,
} from '@/lib/catalog-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 20;

/**
 * Listado de marcas de vehículo — diseño C1 alineado con marcas.
 *
 * Ronda 9 — vista consolidada. Los modelos viven dentro del detalle de
 * cada marca (`/vehiculos/marcas/[id]`).
 *
 * Reemplaza el `<SimpleNameList>` genérico por una vista pulida pero
 * preserva 1:1 la lógica original:
 *  · `listVehicleMakesPaginated({ q, page, pageSize })` con filtros en URL.
 *  · CRUD vía `createVehicleMake` / `updateVehicleMake` / `deleteVehicleMake`.
 *  · ConfirmDialog para borrado + Dialog para crear/editar.
 *  · Toasts con apiErrorMessage.
 *
 * `SimpleNameList` queda intacto para `vehiculos/marcas` (sub-rutas) y
 * `vehiculos/modelos`.
 */

interface MakeItem {
  id: string;
  name: string;
}

export default function VehiculosPage() {
  const qc = useQueryClient();

  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MakeItem | null>(null);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MakeItem | null>(null);

  const query = useQuery({
    queryKey: ['vehicle-makes', { q: debouncedQ, page }],
    queryFn: () =>
      listVehicleMakesPaginated({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const createMut = useMutation({
    mutationFn: (n: string) => createVehicleMake({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-makes'] });
      toast.success('Marca creada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      updateVehicleMake(id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-makes'] });
      toast.success('Marca actualizada');
      closeDialog();
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteVehicleMake(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-makes'] });
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
  function startEdit(item: MakeItem) {
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Marcas de vehículo
          </h1>
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
                : 'No hay marcas de vehículo cargadas'}
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
          items.map((m) => (
            <MakeRow
              key={m.id}
              make={m}
              onEdit={() => startEdit(m)}
              onDelete={() => setDeleteTarget(m)}
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
      <SoftModal
        open={open}
        onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}
        title={editing ? `Editar "${editing.name}"` : 'Nueva marca de vehículo'}
        subtitle={
          editing
            ? 'Actualizá el nombre de la marca'
            : 'Registrá una nueva marca de vehículo'
        }
      >
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div className="space-y-1">
            <label htmlFor="make-name" className={softLabelClass}>
              Nombre
            </label>
            <input
              id="make-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: Toyota"
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
              {editing ? 'Guardar' : 'Crear marca'}
            </button>
          </div>
        </form>
      </SoftModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar marca de vehículo?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si tiene
              modelos o compatibilidades de productos asociadas, la operación
              va a fallar — primero eliminá los modelos / reasigná las
              compatibilidades.
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
   MakeRow — fila simple con name + actions hover
   ============================================================ */
function MakeRow({
  make,
  onEdit,
  onDelete,
}: {
  make: MakeItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group grid grid-cols-[1fr_140px] items-center gap-4 border-b px-4 py-4 text-sm last:border-b-0 hover:bg-accent/30">
      <Link
        href={`/vehiculos/marcas/${make.id}`}
        className="min-w-0 text-[14px] font-medium tracking-tight underline-offset-2 hover:underline"
      >
        {make.name}
      </Link>

      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Link
          href={`/vehiculos/marcas/${make.id}`}
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
