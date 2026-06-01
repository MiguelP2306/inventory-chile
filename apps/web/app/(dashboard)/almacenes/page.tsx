'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, X, Zap, ZapOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Portal } from '@/components/ui/portal';
import { apiErrorMessage } from '@/lib/catalog-api';
import {
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  updateWarehouse,
} from '@/lib/warehouses-api';
import type { WarehouseDto } from '@inventory/shared';

/**
 * /almacenes — Rediseño UI (look de WarehouseList).
 *
 * SOLO UI/UX. La lógica es idéntica a la versión previa:
 *  · useQuery(['warehouses','all']) → todas (activas + inactivas).
 *  · createMut / updateMut / toggleMut / removeMut con sus toasts.
 *  · ConfirmDialog para borrado (soft-delete si tiene movimientos).
 *  · El form solo maneja name + address (los únicos campos del DTO).
 *
 * Cambios visuales: tabla en "sheet" rounded-3xl, badges de estado,
 * botones de acción con borde redondeado, modal custom con overlay
 * blur y acento #2F6BFF.
 *
 * NOTA: el mock incluía selects "Tipo" y "Estado inicial" en el modal,
 * pero no existen en el DTO (createWarehouse/updateWarehouse solo aceptan
 * name + address). Los omití para no exponer controles sin lógica. Si más
 * adelante el backend los soporta, se agregan acá. El estado se cambia por
 * fila con el botón de rayo (toggleMut), igual que antes.
 */
export default function AlmacenesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseDto | null>(null);
  const [form, setForm] = useState({ name: '', address: '' });
  const [deleteTarget, setDeleteTarget] = useState<WarehouseDto | null>(null);

  const list = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses(),
  });
  const items = (Array.isArray(list.data) ? list.data : list.data?.items ?? []) as WarehouseDto[];

  const createMut = useMutation({
    mutationFn: () =>
      createWarehouse({
        name: form.name.trim(),
        address: form.address.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Bodega creada');
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name, address }: { id: string; name: string; address: string }) =>
      updateWarehouse(id, {
        name: name.trim(),
        address: address.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Bodega actualizada');
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateWarehouse(id, { isActive }),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(w.isActive ? `${w.name} reactivada` : `${w.name} desactivada`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(
        res.softDeleted
          ? 'Bodega desactivada (tenía movimientos asociados)'
          : 'Bodega eliminada',
      );
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function startCreate() {
    setEditing(null);
    setForm({ name: '', address: '' });
    setOpen(true);
  }

  function startEdit(w: WarehouseDto) {
    setEditing(w);
    setForm({ name: w.name, address: w.address ?? '' });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setEditing(null);
    setForm({ name: '', address: '' });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      updateMut.mutate({ id: editing.id, name: form.name, address: form.address });
    } else {
      createMut.mutate();
    }
  }

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, address: editing.address ?? '' });
    }
  }, [editing]);

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Almacenes
          </h1>
          <p className="max-w-2xl text-xs font-medium text-slate-500">
            Bodegas físicas o virtuales donde se almacena stock. Las inactivas no aparecen
            en selectores de venta o transferencia, pero siguen preservando su historial.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90 sm:self-auto"
        >
          <Plus className="h-[18px] w-[18px]" />
          <span>Nueva bodega</span>
        </button>
      </div>

      {/* ============================================================
          TABLE SHEET
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="w-1/3 py-4 pl-6">Nombre</th>
                <th className="w-1/3 py-4">Dirección</th>
                <th className="py-4 text-left">Estado</th>
                <th className="w-1/6 py-4 pr-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={4} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-xs font-bold text-slate-400">
                    Sin bodegas. Cargá la primera con “Nueva bodega”.
                  </td>
                </tr>
              )}

              {items.map((w) => {
                const isInactive = !w.isActive;
                return (
                  <tr
                    key={w.id}
                    className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                  >
                    {/* Nombre — click navega al detalle */}
                    <td className="py-5 pl-6 font-semibold">
                      <Link
                        href={`/almacenes/${w.id}`}
                        className={`text-[13px] font-bold hover:underline ${
                          isInactive
                            ? 'font-semibold text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {w.name}
                      </Link>
                    </td>

                    {/* Dirección */}
                    <td className="py-5">
                      <span
                        className={`text-[12px] font-semibold ${
                          isInactive ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {w.address ?? '—'}
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="py-5">
                      {w.isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Inactiva
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-5 pr-6 text-right">
                      <div className="flex items-center justify-end gap-3.5">
                        {/* Activar / desactivar (toggleMut) */}
                        <button
                          onClick={() => toggleMut.mutate({ id: w.id, isActive: !w.isActive })}
                          title={w.isActive ? 'Desactivar bodega' : 'Activar bodega'}
                          className={`cursor-pointer rounded-xl border p-2 transition-all ${
                            w.isActive
                              ? 'border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-300'
                              : 'border-emerald-100 bg-emerald-50/20 text-emerald-500 hover:bg-emerald-50/40 dark:border-emerald-950/20 dark:text-emerald-400'
                          }`}
                        >
                          {w.isActive ? (
                            <ZapOff className="h-4 w-4 text-slate-400" />
                          ) : (
                            <Zap className="h-4 w-4 text-emerald-500" />
                          )}
                        </button>

                        {/* Editar */}
                        <button
                          onClick={() => startEdit(w)}
                          title="Editar"
                          className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-600 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        {/* Eliminar */}
                        <button
                          onClick={() => setDeleteTarget(w)}
                          title="Eliminar"
                          className="cursor-pointer rounded-xl border border-rose-100 p-2 text-rose-400 transition-all hover:bg-rose-50/50 dark:border-rose-950/20 dark:hover:bg-rose-950/15"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          MODAL crear / editar (custom)
          ============================================================ */}
      {open && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-100 bg-white shadow-xl animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-[#11151C]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {editing ? 'Editar Bodega' : 'Nueva Bodega'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {editing
                    ? 'Actualizar coordenadas e información del almacén'
                    : 'Crear una sucursal o bodega e incluir en el sistema'}
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ej: Principal, Mercado Libre Full…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Dirección (opcional)
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="ej: Av. Providencia 1234, Santiago"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={!form.name.trim() || saving}
                className="mt-2 w-full rounded-2xl bg-[#2F6BFF] py-3.5 text-center text-xs font-black text-white shadow-md transition-colors hover:bg-opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Guardando…' : editing ? 'Guardar Cambios' : 'Registrar Bodega'}
              </button>
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
        title="¿Eliminar bodega?"
        description={
          deleteTarget ? (
            <>
              Se intentará eliminar <strong>{deleteTarget.name}</strong>. Si tiene movimientos
              de inventario asociados, quedará <strong>desactivada</strong> en lugar de borrarse
              para preservar el historial.
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
