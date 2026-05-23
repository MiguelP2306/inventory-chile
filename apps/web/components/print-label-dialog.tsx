'use client';

import { Printer } from 'lucide-react';
import { useState } from 'react';
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
import { getProductLabelUrl } from '@/lib/catalog-api';

interface PrintLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  /** Nombre visible del producto (sólo para el copy del dialog). */
  productName: string;
  /**
   * Si se pasa, el footer de la etiqueta incluye el `Stock.locationCode` de
   * esa bodega. Útil cuando el dialog se abre desde `/inventario` con una
   * bodega seleccionada. Sin esta prop, el dialog no muestra el toggle y la
   * etiqueta sale solo con precio en el footer.
   */
  warehouseId?: string;
}

/**
 * Fase 11 — Dialog para imprimir etiquetas térmicas 50×30mm.
 *
 * UX:
 *  - Input "Cantidad de copias" (default 1, max 100).
 *  - Checkbox "Incluir ubicación" si el caller pasó un `warehouseId`.
 *  - Botón "Imprimir" → abre el PDF en una pestaña nueva. El operador usa el
 *    diálogo de impresión del browser para mandar a la térmica.
 */
export function PrintLabelDialog({
  open,
  onOpenChange,
  productId,
  productName,
  warehouseId,
}: PrintLabelDialogProps) {
  const [qty, setQty] = useState(1);
  const [includeLocation, setIncludeLocation] = useState(true);

  const handlePrint = () => {
    const url = getProductLabelUrl(productId, {
      qty,
      warehouseId: includeLocation && warehouseId ? warehouseId : undefined,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Imprimir etiqueta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generá una etiqueta térmica 50×30 mm para{' '}
            <strong className="text-foreground">{productName}</strong> con
            código de barras CODE128, SKU y precio.
          </p>

          <div className="space-y-2">
            <Label htmlFor="label-qty">Cantidad de copias</Label>
            <Input
              id="label-qty"
              type="number"
              min={1}
              max={100}
              value={qty}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  setQty(Math.min(Math.max(Math.floor(n), 1), 100));
                }
              }}
              className="max-w-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Cada copia ocupa una página del PDF para que la impresora térmica
              las corte una por una. Máximo 100.
            </p>
          </div>

          {warehouseId && (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={includeLocation}
                onChange={(e) => setIncludeLocation(e.target.checked)}
              />
              <div className="text-sm">
                <span className="font-medium">
                  Incluir ubicación de la bodega activa
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Si el producto tiene un código de ubicación definido para
                  esta bodega, aparecerá en el pie de la etiqueta (ej. "LOC:
                  A-12"). Si no tiene, la etiqueta sale igual.
                </p>
              </div>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Imprimir {qty > 1 ? `${qty} copias` : 'etiqueta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
