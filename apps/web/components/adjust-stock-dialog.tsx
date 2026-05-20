'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Equal, Minus, Plus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiErrorMessage } from '@/lib/catalog-api';
import { adjustStock } from '@/lib/inventory-api';

type Mode = 'increase' | 'decrease' | 'set';

interface Props {
  // Ronda 9 — sku puede ser null para productos creados sin SKU manual.
  product: { id: string; sku: string | null; name: string };
  currentQty: number;
  // Bodega contextual heredada de la pantalla `/inventario` (Ronda 7). Es
  // obligatoria para que el ajuste vaya a la bodega que el usuario está
  // viendo, no a la default del backend. Si por algún motivo viene null
  // (caso patológico), el dialog rechaza el submit.
  warehouseId: string;
  warehouseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdjustStockDialog({
  product,
  currentQty,
  warehouseId,
  warehouseName,
  open,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('increase');
  const [qty, setQty] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Reset al cerrar para no mantener estado de la apertura anterior.
  useEffect(() => {
    if (!open) {
      setMode('increase');
      setQty('');
      setReason('');
    }
  }, [open]);

  const qtyNum = Number(qty);
  const qtyValid =
    qty !== '' && Number.isInteger(qtyNum) && qtyNum >= 0;

  // Delta firmado que se envía al backend según el modo elegido.
  const signedDelta = (() => {
    if (!qtyValid) return 0;
    if (mode === 'increase') return qtyNum;
    if (mode === 'decrease') return -qtyNum;
    return qtyNum - currentQty;
  })();

  const resultingQty = currentQty + signedDelta;
  const isNoChange = qtyValid && signedDelta === 0;
  const isNegativeResult = resultingQty < 0;
  const valid =
    qtyValid && !isNoChange && !isNegativeResult && reason.trim().length > 0;

  const mut = useMutation({
    mutationFn: () =>
      adjustStock({
        productId: product.id,
        warehouseId,
        qty: signedDelta,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      toast.success(`Stock ajustado en ${warehouseName}`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo ajustar')),
  });

  const inputLabel =
    mode === 'increase'
      ? 'Cantidad a agregar'
      : mode === 'decrease'
        ? 'Cantidad a restar'
        : 'Cantidad final tras el conteo';

  const inputPlaceholder =
    mode === 'set' ? 'ej: 42' : 'ej: 10';

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
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <div>
              SKU: <span className="font-mono">{product.sku}</span>
            </div>
            <div>
              Bodega:{' '}
              <span className="font-semibold">{warehouseName}</span>
            </div>
            <div>
              Stock actual en esta bodega:{' '}
              <span className="font-semibold">{currentQty}</span>
            </div>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="increase">
                <Plus className="h-4 w-4" />
                Aumentar
              </TabsTrigger>
              <TabsTrigger value="decrease">
                <Minus className="h-4 w-4" />
                Disminuir
              </TabsTrigger>
              <TabsTrigger value="set">
                <Equal className="h-4 w-4" />
                Establecer
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="qty">{inputLabel}</Label>
            <Input
              id="qty"
              type="number"
              min={0}
              step={1}
              autoFocus
              placeholder={inputPlaceholder}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            {qtyValid && (
              <div className="text-sm">
                {mode === 'set' && (
                  <span className="text-muted-foreground">
                    Variación calculada:{' '}
                    <span className="font-medium text-foreground tabular-nums">
                      {signedDelta > 0 ? '+' : ''}
                      {signedDelta}
                    </span>
                    {' · '}
                  </span>
                )}
                <span className="text-muted-foreground">
                  Stock resultante:{' '}
                </span>
                <span
                  className={
                    isNegativeResult
                      ? 'font-semibold text-destructive tabular-nums'
                      : 'font-semibold tabular-nums'
                  }
                >
                  {resultingQty}
                </span>
                {isNegativeResult && (
                  <span className="ml-1 text-destructive">(no permitido)</span>
                )}
                {isNoChange && (
                  <span className="ml-1 text-muted-foreground">(sin cambios)</span>
                )}
              </div>
            )}
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
              {mut.isPending
                ? 'Ajustando...'
                : isNoChange
                  ? 'Sin cambios'
                  : `Ajustar stock en ${warehouseName}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
