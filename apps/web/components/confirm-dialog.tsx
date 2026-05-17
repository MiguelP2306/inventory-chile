'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
    <Dialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className="pt-2">{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Procesando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
