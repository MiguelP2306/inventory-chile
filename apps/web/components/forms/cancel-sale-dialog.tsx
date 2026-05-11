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
import { cancelSale } from '@/lib/sales-api';
import type { SaleDto } from '@inventory/shared';

interface Props {
  sale: SaleDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Confirma cancelación pidiendo motivo obligatorio (min 5 chars). Al guardar:
 * backend revierte stock + anula caja + marca venta CANCELLED en una sola
 * transacción atómica. UI se actualiza vía invalidación de queries.
 */
export function CancelSaleDialog({ sale, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const mut = useMutation({
    mutationFn: () => cancelSale(sale.id, { reason: reason.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sale', sale.id] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      toast.success('Venta cancelada. Stock y caja revertidos.');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cancelar')),
  });

  const trimmed = reason.trim();
  const valid = trimmed.length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar venta {sale.number}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Esta acción revierte el stock de cada item y anula las transacciones
            de caja vinculadas. La venta queda en estado <strong>CANCELLED</strong>
            y no se puede reactivar.
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (obligatorio)</Label>
            <Textarea
              id="reason"
              rows={4}
              autoFocus
              placeholder="Ej: Error de carga, cliente devolvió el producto antes del despacho, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo 5 caracteres. Queda guardado en el registro de la venta.
            </p>
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
              {mut.isPending ? 'Cancelando...' : 'Cancelar venta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
