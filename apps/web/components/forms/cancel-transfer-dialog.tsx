'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/catalog-api';
import { cancelTransfer } from '@/lib/transfers-api';
import type { TransferDto } from '@inventory/shared';

interface Props {
  transfer: TransferDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirma la cancelación pidiendo motivo (min 5 chars). El backend hace la
 * reversión atómica de movimientos: devuelve stock al origen y lo saca del
 * destino. Si el stock destino ya se consumió por una venta posterior, el
 * backend falla con 409 (correcto — la cancelación no puede dejar stock
 * negativo silenciosamente).
 */
export function CancelTransferDialog({ transfer, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const mut = useMutation({
    mutationFn: () => cancelTransfer(transfer.id, { reason: reason.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfer', transfer.id] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      toast.success('Transferencia cancelada. Stock revertido.');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cancelar')),
  });

  const valid = reason.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar transferencia {transfer.number}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Esta acción devuelve el stock a <strong>{transfer.fromWarehouse?.name}</strong>
            {' '}y lo quita de <strong>{transfer.toWarehouse?.name}</strong>. Si el
            stock destino ya se usó en otra operación, la cancelación falla.
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (obligatorio, min 5 chars)</Label>
            <Textarea
              id="reason"
              rows={4}
              autoFocus
              placeholder="Ej: Error en cantidad, producto equivocado, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mut.isPending}
            >
              Volver
            </Button>
            <Button type="submit" variant="destructive" disabled={!valid || mut.isPending}>
              {mut.isPending ? 'Cancelando...' : 'Cancelar transferencia'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
