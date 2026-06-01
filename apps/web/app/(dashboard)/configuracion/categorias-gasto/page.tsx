'use client';

/* ============================================================================
 *  CategoriasGastoPage — REESTILIZADO con el sistema visual del rediseño
 *  (Inventario / Caja / Gastos) + modal SoftModal. Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · listExpenseCategories + create/update/deleteExpenseCategory.
 *   · El mismo dialog crea/edita según `editing`; onSubmit con name.trim().
 *   · Las categorías `isSystem` no se editan ni eliminan.
 *   · ConfirmDialog para borrar (ya usaba SoftModal).
 * ========================================================================== */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SoftModal, softInputClass, softLabelClass } from '@/components/ui/soft-modal';
import {
  createExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { cn } from '@/lib/utils';
import type { ExpenseCategoryDto } from '@inventory/shared';

const CANCEL_BTN =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900';
const SUBMIT_BTN =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

export default function CategoriasGastoPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => listExpenseCategories(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategoryDto | null>(null);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExpenseCategoryDto | null>(
    null,
  );

  const createMut = useMutation({
    mutationFn: (n: string) => createExpenseCategory({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría creada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      updateExpenseCategory(id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría actualizada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteExpenseCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría eliminada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setName('');
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) updateMut.mutate({ id: editing.id, n: trimmed });
    else createMut.mutate(trimmed);
  }

  const items = list.data ?? [];
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-slate-800 dark:text-slate-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Link
            href="/configuracion"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 transition-colors hover:text-[#2F6BFF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Configuración
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Categorías de gasto
          </h1>
          <p className="mt-1 max-w-[70ch] text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            Las categorías marcadas como{' '}
            <strong className="font-extrabold text-slate-700 dark:text-slate-200">
              sistema
            </strong>{' '}
            son referenciadas por la lógica automática (IVA, comisión tarjeta) y
            no se pueden modificar.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setName('');
            setOpen(true);
          }}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nueva categoría
        </button>
      </div>

      {/* TABLA */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Nombre</th>
                <th className="w-[120px] py-4 pr-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={2} className="px-6 py-5">
                      <div className="h-5 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={2}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <Tags className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        Sin categorías cargadas
                      </p>
                      <p className="max-w-[40ch] text-xs font-medium text-slate-400">
                        Creá la primera categoría para clasificar tus gastos.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!list.isLoading &&
                items.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                  >
                    <td className="py-4 pl-6">
                      <div className="flex items-center gap-2.5">
                        <span className="font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
                          {c.name}
                        </span>
                        {c.isSystem && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            <Lock className="h-2.5 w-2.5" />
                            sistema
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-6">
                      {!c.isSystem ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => {
                              setEditing(c);
                              setName(c.name);
                              setOpen(true);
                            }}
                            className="cursor-pointer p-2 text-slate-400 transition-colors hover:text-[#2F6BFF]"
                          >
                            <Pencil className="h-[17px] w-[17px]" />
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => setDeleteTarget(c)}
                            className="cursor-pointer p-2 text-slate-400 transition-colors hover:text-rose-500"
                          >
                            <Trash2 className="h-[17px] w-[17px]" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end pr-2">
                          <span className="font-mono text-slate-300 dark:text-slate-600">
                            —
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR */}
      <SoftModal
        open={open}
        onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
        subtitle={
          editing
            ? 'Actualizá el nombre de la categoría.'
            : 'Creá una categoría para clasificar tus gastos.'
        }
        icon={editing ? <Pencil className="h-[18px] w-[18px]" /> : <Tags className="h-[18px] w-[18px]" />}
      >
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label htmlFor="name" className={softLabelClass}>
              Nombre
            </label>
            <input
              id="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: Arriendo, Sueldos, Marketing…"
              className={softInputClass}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={closeDialog} className={CANCEL_BTN}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className={cn(SUBMIT_BTN)}
            >
              {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear categoría'}
            </button>
          </div>
        </form>
      </SoftModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar categoría de gasto?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si hay gastos
              vinculados a esta categoría la operación va a fallar.
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
