'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Car, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
 * /vehiculos — Rediseño UI (look de VehiculosView).
 *
 * SOLO UI/UX. La lógica de datos es idéntica a la versión previa
 * (page-82d60319): `listVehicleMakesPaginated({ q, page, pageSize })` con
 * filtros en URL, CRUD vía createVehicleMake/updateVehicleMake/deleteVehicleMake,
 * ConfirmDialog para borrado y toasts con apiErrorMessage. Los modelos viven
 * dentro del detalle de cada marca (`/vehiculos/marcas/[id]`).
 *
 * Cambios visuales (sistema compartido con Categorías / Marcas / Almacenes):
 *  · Header font-black + subtítulo con stats.
 *  · "Sheet" rounded-3xl con tabla; fila con Car azul, nombre uppercase black,
 *    "Abrir" + acciones editar/eliminar en hover.
 *  · Search rounded-2xl con foco azul.
 *  · Modal crear/editar custom con overlay blur (reemplaza <SoftModal>).
 *  · <ConfirmDialog> se conserva tal cual (misma lógica de borrado).
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
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
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

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Marcas de vehículo
          </h1>
          <p className="mt-1 text-xs font-bold text-slate-400 dark:text-slate-500">
            <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
              {total}
            </strong>{' '}
            {total === 1 ? 'marca registrada' : 'marcas registradas'}
            {totalPages > 1 && (
              <span className="text-slate-400">
                {' · '}página {page} de {totalPages}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={startCreate}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90 sm:self-auto"
        >
          <Plus className="h-[18px] w-[18px]" />
          <span>Nueva marca</span>
        </button>
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          placeholder="Buscar por nombre…"
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

      {/* ============================================================
          LIST SHEET
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-3.5 pl-6 pr-3">Nombre</th>
                <th className="w-44 py-3.5 pr-6 pl-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {query.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={2} className="px-6 py-5">
                      <div className="h-4 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!query.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-14 text-center">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      {debouncedQ
                        ? 'Sin resultados para tu búsqueda'
                        : 'No hay marcas de vehículo cargadas'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {debouncedQ ? (
                        <button
                          type="button"
                          onClick={() => search.setValue('')}
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
                          Crear la primera marca
                        </button>
                      )}
                    </p>
                  </td>
                </tr>
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
            </tbody>
          </table>
        </div>

        {!query.isLoading && total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3.5 text-[11.5px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-400">
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
          MODAL crear / editar (custom — reemplaza SoftModal)
          ============================================================ */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-[#11151C]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {editing ? `Editar "${editing.name}"` : 'Nueva marca de vehículo'}
                </h4>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {editing
                    ? 'Actualizá el nombre de la marca'
                    : 'Registrá una nueva marca de vehículo'}
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
                  placeholder="ej: Toyota"
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
                  {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear marca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          CONFIRMACIÓN DE BORRADO (sin cambios de lógica)
          ============================================================ */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar marca de vehículo?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si tiene modelos o
              compatibilidades de productos asociadas, la operación va a fallar —
              primero eliminá los modelos / reasigná las compatibilidades.
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
   MakeRow — fila con Car, nombre uppercase black y acciones hover
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
    <tr className="group transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/10">
      <td className="py-4 pl-6 pr-3">
        <Link
          href={`/vehiculos/marcas/${make.id}`}
          className="inline-flex items-center gap-2.5"
        >
          <Car className="h-4 w-4 shrink-0 text-[#2F6BFF] transition-transform group-hover:scale-105 dark:text-blue-400" />
          <span className="text-[12.5px] font-black uppercase tracking-tight text-slate-800 transition-colors group-hover:text-[#2F6BFF] dark:text-slate-100 dark:group-hover:text-blue-400">
            {make.name}
          </span>
        </Link>
      </td>

      <td className="py-4 pr-6 pl-3 text-right">
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Link
            href={`/vehiculos/marcas/${make.id}`}
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
