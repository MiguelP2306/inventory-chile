'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Equal, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiErrorMessage } from '@/lib/catalog-api';
import { invalidateProductCaches } from '@/lib/invalidate-product-caches';
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
      invalidateProductCaches(qc);
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
    <SoftModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Ajustar stock — ${product.name}`}
      subtitle={`Movimiento de inventario en ${warehouseName}`}
    >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4 p-5"
        >
          <div className="space-y-1 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/20 dark:text-slate-300">
            <div>
              SKU: <span className="font-mono">{product.sku}</span>
            </div>
            <div>
              Bodega:{' '}
              <span className="font-bold text-slate-800 dark:text-slate-100">{warehouseName}</span>
            </div>
            <div>
              Stock actual en esta bodega:{' '}
              <span className="font-bold text-slate-800 dark:text-slate-100">{currentQty}</span>
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

          <div className="space-y-1">
            <label htmlFor="qty" className={softLabelClass}>{inputLabel}</label>
            <input
              id="qty"
              type="number"
              min={0}
              step={1}
              autoFocus
              placeholder={inputPlaceholder}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={softInputClass}
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

          <div className="space-y-1">
            <label htmlFor="reason" className={softLabelClass}>Motivo</label>
            <input
              id="reason"
              placeholder="ej: Conteo físico, merma por inspección, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={softInputClass}
            />
          </div>

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
              disabled={!valid || mut.isPending}
              className={`${softPrimaryButtonClass} w-auto px-5`}
            >
              {mut.isPending
                ? 'Ajustando...'
                : isNoChange
                  ? 'Sin cambios'
                  : `Ajustar stock en ${warehouseName}`}
            </button>
          </div>
        </form>
      </SoftModal>
  );
}
