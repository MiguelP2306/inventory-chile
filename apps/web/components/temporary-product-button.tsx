'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface TemporaryProductInput {
  name: string;
  sku: string | null;
  partNumber: string | null;
  unitPrice: string;
}

interface Props {
  onAdd: (input: TemporaryProductInput) => void;
  buttonLabel?: string;
}

/**
 * Botón "+ Producto temporal" (Ronda 9). Se usa en QuotationForm al lado
 * del ProductPicker para que el operador cargue productos que NO existen
 * en el catálogo (cotizaciones de partes que se van a importar, ítems
 * únicos, etc.) sin contaminar la base de productos.
 *
 * Los productos temporales:
 *  - NO descuentan stock al cotizar.
 *  - NO se pueden convertir a venta hasta que se registren en el catálogo
 *    (la conversión bloquea con 409 explicativo).
 *  - Quedan persistidos en `quotation_items` con `productId=null` y los
 *    campos snapshot (`tempProductName`, etc.).
 */
export function TemporaryProductButton({
  onAdd,
  buttonLabel = '+ Producto temporal',
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  function reset() {
    setName('');
    setSku('');
    setPartNumber('');
    setUnitPrice('');
  }

  const valid = name.trim().length > 0 && parseFloat(unitPrice) > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onAdd({
      name: name.trim(),
      sku: sku.trim() || null,
      partNumber: partNumber.trim() || null,
      unitPrice,
    });
    reset();
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-dashed"
      >
        <Sparkles className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo producto temporal</DialogTitle>
            <DialogDescription>
              Sólo existe dentro de esta cotización. No descuenta stock ni
              queda en el catálogo. Para convertir la cotización a venta,
              registralo formalmente o quitalo.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="temp-name">Nombre *</Label>
              <Input
                id="temp-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Bujía equivalente importada"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="temp-sku">SKU (opcional)</Label>
                <Input
                  id="temp-sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="ej: TMP-001"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="temp-part">N° de parte (opcional)</Label>
                <Input
                  id="temp-part"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  placeholder="ej: IFR6T11-EQ"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="temp-price">Precio unitario bruto *</Label>
              <Input
                id="temp-price"
                type="text"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!valid}>
                Agregar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
