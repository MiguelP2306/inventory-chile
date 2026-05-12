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
import { cancelReturn } from '@/lib/returns-api';
import type { ReturnDto } from '@inventory/shared';

interface Props {
  ret: ReturnDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelReturnDialog({ ret, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const mut = useMutation({
    mutationFn: () => cancelReturn(ret.id, { reason: reason.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['return', ret.id] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      if (ret.saleId) {
        qc.invalidateQueries({ queryKey: ['returned-qty-by-sale', ret.saleId] });
      }
      toast.success('Devolución cancelada. Stock y caja revertidos.');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cancelar')),
  });

  const valid = reason.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar devolución {ret.number}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Esta acción revierte los movimientos de stock (devuelve a la condición
            previa) y anula el reembolso de caja con compensación. Si el stock ya
            se consumió por otra operación, la cancelación falla con 409.
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (obligatorio, min 5 chars)</Label>
            <Textarea
              id="reason"
              rows={4}
              autoFocus
              placeholder="Ej: Error al registrar items, cliente desistió de la devolución"
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
            <Button
              type="submit"
              variant="destructive"
              disabled={!valid || mut.isPending}
            >
              {mut.isPending ? 'Cancelando...' : 'Cancelar devolución'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
