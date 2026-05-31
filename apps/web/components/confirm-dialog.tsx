'use client';

import { useState } from 'react';
import {
  SoftModal,
  softDestructiveButtonClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';

/**
 * Ronda 7 — modal reutilizable para confirmaciones destructivas (eliminar,
 * desvincular, anular, etc). Reemplaza el `window.confirm()` nativo del
 * navegador, que rompía la consistencia visual y de tema (light/dark) de
 * la app.
 *
 * Uso:
 *
 *   const [open, setOpen] = useState(false);
 *   ...
 *   <Button onClick={() => setOpen(true)}>Eliminar</Button>
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="¿Eliminar categoría?"
 *     description={`La categoría "${name}" será eliminada.`}
 *     confirmLabel="Eliminar"
 *     variant="destructive"
 *     onConfirm={() => removeMut.mutate(id)}
 *   />
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => void | Promise<void>;
  /** Cuando true, el botón confirmar muestra spinner y se deshabilita. */
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  loading = false,
}: Props) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = loading || internalLoading;

  async function handleConfirm() {
    if (isLoading) return;
    try {
      setInternalLoading(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setInternalLoading(false);
    }
  }

  return (
    <SoftModal
      open={open}
      onOpenChange={(o) => !isLoading && onOpenChange(o)}
      title={title}
    >
      <div className="space-y-5 p-5">
        {description && (
          <div className="text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className={softSecondaryButtonClass}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className={
              variant === 'destructive'
                ? softDestructiveButtonClass
                : `${softPrimaryButtonClass} w-auto px-4 py-2.5`
            }
          >
            {isLoading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </SoftModal>
  );
}
