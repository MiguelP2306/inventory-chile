'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import { apiErrorMessage, correctProductCost } from '@/lib/catalog-api';
import { invalidateProductCaches } from '@/lib/invalidate-product-caches';

interface Props {
  product: { id: string; sku: string | null; name: string };
  /** Costo actual (el ponderado que se quiere corregir). */
  currentCost: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con el costo aplicado para refrescar el form sin recargar. */
  onCorrected?: (newCost: string) => void;
}

/**
 * Corrección manual del costo unitario (solo admin).
 *
 * El costo es normalmente autogestionado (promedio ponderado de los lotes),
 * pero cuando entró mal —típicamente por Excel— un admin lo corrige acá. El
 * backend reescribe los lotes activos al valor nuevo y audita el motivo.
 */
export function ProductCostCorrectionDialog({
  product,
  currentCost,
  open,
  onOpenChange,
  onCorrected,
}: Props) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) {
      setValue('');
      setReason('');
    }
  }, [open]);

  const num = Number(value);
  const valueValid = value !== '' && Number.isFinite(num) && num >= 0;
  const valid = valueValid && reason.trim().length >= 3;

  const fmt = (v: string | number) =>
    Number(v).toLocaleString('es-CL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const mut = useMutation({
    mutationFn: () =>
      correctProductCost(product.id, {
        unitCost: num.toFixed(2),
        reason: reason.trim(),
      }),
    onSuccess: (updated) => {
      invalidateProductCaches(qc);
      qc.invalidateQueries({ queryKey: ['product', product.id] });
      toast.success('Costo corregido');
      onCorrected?.(updated.cost ?? num.toFixed(2));
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo corregir el costo')),
  });

  return (
    <SoftModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Corregir costo — ${product.name}`}
      subtitle="Reescribe el costo de los lotes con stock disponible"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // IMPORTANTE: este <form> vive dentro de un Dialog (Radix Portal) que
          // se renderiza adentro del <form> del producto. En React los eventos
          // sintéticos burbujean por el ÁRBOL DE COMPONENTES (no el DOM), así
          // que sin este stopPropagation el submit cruzaría el portal y
          // dispararía el guardado del producto. Mismo motivo que en
          // `temporary-product-button.tsx`.
          e.stopPropagation();
          if (valid) mut.mutate();
        }}
        className="space-y-4 p-5"
      >
        <div className="space-y-1 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <div>
            SKU: <span className="font-mono">{product.sku ?? '—'}</span>
          </div>
          <div>
            Costo actual:{' '}
            <span className="font-bold text-slate-800 tabular-nums dark:text-slate-100">
              $ {fmt(currentCost)}
            </span>
          </div>
          <p className="pt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            El costo normalmente se calcula solo desde las compras. Usá esto solo
            para arreglar un costo que entró mal. No afecta ventas ya
            registradas.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="new-cost" className={softLabelClass}>
            Costo unitario corregido (CLP, bruto)
          </label>
          <input
            id="new-cost"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="ej: 31734"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={softInputClass}
          />
          {valueValid && Number(currentCost) > 0 && (
            <div className="text-xs text-muted-foreground">
              Nuevo costo:{' '}
              <span className="font-semibold text-foreground tabular-nums">
                $ {fmt(num)}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="cost-reason" className={softLabelClass}>
            Motivo
          </label>
          <input
            id="cost-reason"
            placeholder="ej: Costo cargado mal desde Excel"
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
            {mut.isPending ? 'Corrigiendo…' : 'Corregir costo'}
          </button>
        </div>
      </form>
    </SoftModal>
  );
}
