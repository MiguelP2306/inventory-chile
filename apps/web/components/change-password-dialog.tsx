'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cp-current">Contraseña actual</Label>
            <Input
              id="cp-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-next">Nueva contraseña</Label>
            <Input
              id="cp-next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Mínimo 6 caracteres.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-confirm">Confirmar nueva contraseña</Label>
            <Input
              id="cp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mut.isPending || !current || !next || !confirm}
            >
              {mut.isPending ? 'Actualizando…' : 'Cambiar contraseña'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
