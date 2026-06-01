'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import { apiErrorMessage } from '@/lib/catalog-api';
import { changeOwnPassword } from '@/lib/users-api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog para que el usuario cambie su propia contraseña.
 * Pide la contraseña actual + nueva (con confirmación). El backend valida
 * la actual antes de aceptar el cambio.
 *
 * Solo UI (look SoftModal de la web). La lógica es idéntica: valida largo
 * mínimo + confirmación en el front y delega en `changeOwnPassword`
 * (PATCH /users/me/password), que valida la contraseña actual en el backend.
 */
export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const mut = useMutation({
    mutationFn: () => changeOwnPassword(current, next),
    onSuccess: () => {
      toast.success('Contraseña actualizada');
      reset();
      onOpenChange(false);
    },
    onError: (err) =>
      setError(apiErrorMessage(err, 'No se pudo actualizar la contraseña')),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (next !== confirm) {
      setError('La confirmación no coincide con la nueva contraseña');
      return;
    }
    mut.mutate();
  }

  return (
    <SoftModal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Cambiar mi contraseña"
      subtitle="Confirmá tu contraseña actual y elegí una nueva"
    >
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="space-y-1">
          <label htmlFor="cp-current" className={softLabelClass}>
            Contraseña actual
          </label>
          <input
            id="cp-current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
            className={softInputClass}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="cp-next" className={softLabelClass}>
            Nueva contraseña
          </label>
          <input
            id="cp-next"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            className={softInputClass}
          />
          <p className="text-[11px] text-slate-400">Mínimo 6 caracteres.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="cp-confirm" className={softLabelClass}>
            Confirmar nueva contraseña
          </label>
          <input
            id="cp-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            className={softInputClass}
          />
        </div>

        {error && (
          <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-[11px] font-semibold text-rose-600 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={softSecondaryButtonClass}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mut.isPending || !current || !next || !confirm}
            className={`${softPrimaryButtonClass} w-auto px-5`}
          >
            {mut.isPending ? 'Actualizando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </SoftModal>
  );
}
