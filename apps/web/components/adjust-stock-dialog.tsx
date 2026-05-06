'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { adjustStock } from '@/lib/inventory-api';

interface Props {
  product: { id: string; sku: string; name: string };
  currentQty: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdjustStockDialog({ product, currentQty, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [qty, setQty] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const mut = useMutation({
    mutationFn: () =>
      adjustStock({
        productId: product.id,
        qty: Number(qty),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      toast.success('Stock ajustado');
      onOpenChange(false);
      setQty('');
      setReason('');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo ajustar')),
  });

  const qtyNum = Number(qty);
  const valid = !!qty && Number.isInteger(qtyNum) && qtyNum !== 0 && reason.trim().length > 0;
  const resultingQty = currentQty + (Number.isFinite(qtyNum) ? qtyNum : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock — {product.name}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md bg-muted p-3 text-sm">
            <div>
              SKU: <span className="font-mono">{product.sku}</span>
            </div>
            <div>
              Stock actual: <span className="font-semibold">{currentQty}</span>
            </div>
            {qty && Number.isFinite(qtyNum) && (
              <div>
                Stock resultante:{' '}
                <span
                  className={
                    resultingQty < 0
                      ? 'font-semibold text-destructive'
                      : 'font-semibold'
                  }
                >
                  {resultingQty}
                </span>
                {resultingQty < 0 && ' (no permitido)'}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Cantidad (signada)</Label>
            <Input
              id="qty"
              type="number"
              autoFocus
              placeholder="Positivo entra, negativo sale (ej: -5)"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo</Label>
            <Input
              id="reason"
              placeholder="ej: Conteo físico, merma por inspección, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || mut.isPending}>
              {mut.isPending ? 'Ajustando...' : 'Ajustar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
