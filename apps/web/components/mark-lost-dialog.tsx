'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/catalog-api';
import { markCustomerLost } from '@/lib/lifecycle-api';

interface Props {
  customer: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Llave a invalidar al cerrar — la pasa el padre para refrescar su lista.
  invalidateKeys?: string[][];
}

/**
 * Diálogo "Marcar como perdido". Único cambio manual de lifecycle (excepto
 * touch). Pide motivo obligatorio (min 5 caracteres) y dispara el endpoint
 * /customers/:id/mark-lost. Compartido entre la bandeja `/seguimiento` y el
 * detalle del cliente.
 */
export function MarkLostDialog({
  customer,
  open,
  onOpenChange,
  invalidateKeys = [['follow-ups'], ['customer']],
}: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const valid = reason.trim().length >= 5;

  const mut = useMutation({
    mutationFn: () =>
      customer
        ? markCustomerLost(customer.id, reason.trim())
        : Promise.reject('no customer'),
    onSuccess: () => {
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
      toast.success('Cliente marcado como perdido');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo marcar')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como perdido</DialogTitle>
          <DialogDescription>
            {customer
              ? `Cerrá el ciclo comercial de "${customer.name}" con un motivo registrado.`
              : 'Cliente'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-muted-foreground">
              El cliente sale de la bandeja de seguimiento. Queda como
              perdido hasta que confirme una nueva venta — ahí vuelve a WON
              automáticamente.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lostReason">Motivo (mínimo 5 caracteres)</Label>
            <Textarea
              id="lostReason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ej: Compró a la competencia, presupuesto cancelado, etc."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Volver
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!valid || mut.isPending}
            >
              {mut.isPending ? 'Marcando...' : 'Marcar como perdido'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
