'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  apiErrorMessage,
  createVehicleModel,
  deleteVehicleModel,
  listVehicleMakes,
  listVehicleModels,
  productsByVehicle,
  updateVehicleModel,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import type { VehicleModelDto } from '@inventory/shared';

/**
 * /vehiculos/marcas/[id] — Rediseño UI (look de VehiculosView · detalle).
 *
 * SOLO UI/UX. Toda la lógica se preserva 1:1 desde page-71578ac8:
 *  · makesQ (nombre de la marca) + modelsQ (modelos de la marca).
 *  · CRUD de modelos: createVehicleModel({ makeId, name }) / updateVehicleModel /
 *    deleteVehicleModel, con sus toasts y ConfirmDialog.
 *  · productsQ = productsByVehicle({ makeId }) → productos compatibles.
 *
 * Cambios visuales (sistema compartido con Categorías / Marcas / Almacenes):
 *  · Back link + header font-black con stats (modelos · compatibles).
 *  · Card "Modelos" en sheet rounded-3xl, tabla con acciones en hover.
 *  · Card "Productos compatibles" en sheet rounded-3xl.
 *  · Modal crear/editar modelo custom con overlay blur (reemplaza <SoftModal>).
 */
export default function VehicleMakeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const makesQ = useQuery({
    queryKey: ['vehicle-makes'],
    queryFn: listVehicleMakes,
  });
  const make = (makesQ.data ?? []).find((m) => m.id === id) ?? null;

  const modelsQ = useQuery({
    queryKey: ['vehicle-models', id],
    queryFn: () => listVehicleModels(id),
    enabled: !!id,
  });
  const models = modelsQ.data ?? [];

  // Estado del dialog de crear/editar modelo.
  const [editing, setEditing] = useState<VehicleModelDto | null>(null);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [modelName, setModelName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VehicleModelDto | null>(null);

  function startCreate() {
    setEditing(null);
    setModelName('');
    setModelDialogOpen(true);
  }
  function startEdit(m: VehicleModelDto) {
    setEditing(m);
    setModelName(m.name);
    setModelDialogOpen(true);
  }

  const createMut = useMutation({
    mutationFn: () => createVehicleModel({ makeId: id, name: modelName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo creado');
      setModelDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateMut = useMutation({
    mutationFn: () => updateVehicleModel(editing!.id, { name: modelName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo actualizado');
      setModelDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const deleteMut = useMutation({
    mutationFn: (mid: string) => deleteVehicleModel(mid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo eliminado');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  // Productos compatibles con cualquier modelo de esta marca.
  const productsQ = useQuery({
    queryKey: ['products-by-vehicle', { makeId: id }],
    queryFn: () => productsByVehicle({ makeId: id }),
    enabled: !!id,
  });
  const products = productsQ.data ?? [];

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          BACK LINK
          ============================================================ */}
      <Link
        href="/vehiculos"
        className="group inline-flex w-fit items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Volver a marcas</span>
      </Link>

      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            {make?.name ?? 'Marca'}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            <span>
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {models.length}
              </strong>{' '}
              {models.length === 1 ? 'modelo' : 'modelos'}
            </span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            <span>
              <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                {products.length}
              </strong>{' '}
              {products.length === 1 ? 'producto compatible' : 'productos compatibles'}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================
          CARD — MODELOS
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
            Modelos de {make?.name ?? '—'}
          </h3>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#2F6BFF] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-[#2F6BFF]/90"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nuevo modelo</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-3 pl-6 pr-3">Modelo</th>
                <th className="w-40 py-3 pr-6 pl-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {modelsQ.isLoading && (
                <tr>
                  <td colSpan={2} className="px-6 py-4">
                    <div className="h-4 w-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </td>
                </tr>
              )}

              {!modelsQ.isLoading && models.length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="py-8 text-center text-xs font-medium italic text-slate-400"
                  >
                    Sin modelos. Usá «Nuevo modelo» arriba para agregar.
                  </td>
                </tr>
              )}

              {models.map((m) => (
                <tr
                  key={m.id}
                  className="group transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/10"
                >
                  <td className="py-4 pl-6 pr-3">
                    <Link
                      href={`/vehiculos/modelos/${m.id}`}
                      className="text-[12.5px] font-bold text-slate-800 underline-offset-2 transition-colors hover:text-[#2F6BFF] hover:underline dark:text-slate-200"
                    >
                      {m.name}
                    </Link>
                  </td>
                  <td className="py-4 pr-6 pl-3 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        title="Editar modelo"
                        className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-400 transition-all hover:bg-slate-50 hover:text-slate-600 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-slate-300"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(m)}
                        title="Eliminar modelo"
                        className="cursor-pointer rounded-xl border border-rose-100 p-2 text-rose-400 transition-all hover:bg-rose-50/50 dark:border-rose-950/20 dark:hover:bg-rose-950/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          CARD — PRODUCTOS COMPATIBLES
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/10">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
            Productos compatibles
          </h3>
          <span className="font-mono text-[10.5px] font-black uppercase tracking-wider text-slate-400">
            <strong className="font-black tabular-nums text-slate-600 dark:text-slate-300">
              {products.length}
            </strong>{' '}
            {products.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="w-32 py-3 pl-6 pr-3">SKU</th>
                <th className="py-3 px-3">Nombre</th>
                <th className="w-44 py-3 px-3">Marca producto</th>
                <th className="w-40 py-3 pr-6 pl-3 text-right">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {productsQ.isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-4">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </td>
                </tr>
              )}

              {!productsQ.isLoading && products.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-10 text-center text-xs font-medium italic text-slate-400"
                  >
                    Ningún producto del catálogo es compatible con esta marca.
                  </td>
                </tr>
              )}

              {products.map((p) => (
                <tr
                  key={p.id}
                  className="group text-xs transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/10"
                >
                  <td className="py-4 pl-6 pr-3">
                    <Link
                      href={`/productos/${p.id}`}
                      className="font-mono text-[11px] font-bold text-slate-500 underline-offset-2 transition-colors hover:text-[#2F6BFF] hover:underline dark:text-slate-400"
                    >
                      {p.sku}
                    </Link>
                  </td>
                  <td className="py-4 px-3">
                    <Link
                      href={`/productos/${p.id}`}
                      className="font-black uppercase tracking-tight text-slate-900 underline-offset-2 transition-colors hover:text-[#2F6BFF] hover:underline dark:text-white"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-4 px-3 font-bold text-slate-500 dark:text-slate-400">
                    {p.brand?.name ?? '—'}
                  </td>
                  <td className="py-4 pr-6 pl-3 text-right font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                    {formatCurrency(p.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          MODAL — crear / editar modelo (custom, reemplaza SoftModal)
          ============================================================ */}
      {modelDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-[#11151C]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {editing ? `Editar ${editing.name}` : 'Nuevo modelo'}
                </h4>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {editing
                    ? 'Actualizá el nombre del modelo'
                    : `Agregá un modelo a ${make?.name ?? 'la marca'}`}
                </p>
              </div>
              <button
                onClick={() => setModelDialogOpen(false)}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!modelName.trim()) return;
                if (editing) updateMut.mutate();
                else createMut.mutate();
              }}
              className="space-y-4 p-5"
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Nombre del modelo
                </label>
                <input
                  autoFocus
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="ej: Corolla, Hilux, S10"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModelDialogOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!modelName.trim() || saving}
                  className="rounded-xl bg-[#2F6BFF] px-5 py-2 text-xs font-black text-white shadow-md transition-colors hover:bg-opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar modelo?"
        description={
          deleteTarget
            ? `Esto eliminará el modelo "${deleteTarget.name}". Si está referenciado por productos, la operación devolverá un error.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget) await deleteMut.mutateAsync(deleteTarget.id);
        }}
      />
    </div>
  );
}
