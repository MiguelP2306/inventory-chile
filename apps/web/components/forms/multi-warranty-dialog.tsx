'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/catalog-api';
import { createWarrantyClaim } from '@/lib/warranties-api';
import type { SaleDto } from '@inventory/shared';

interface Props {
  sale: SaleDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Ronda 9 — dialog para abrir garantías sobre uno o más items de una venta.
 *
 * UX:
 *  - Lista los items de la venta con checkbox por fila.
 *  - Campo de notas compartido (la misma descripción se aplica a todos los
 *    reclamos creados en esta operación).
 *  - Al confirmar, crea N `WarrantyClaim` en paralelo (uno por saleItem
 *    seleccionado). Errors individuales no abortan los demás — se reporta
 *    el resultado agregado en el toast.
 */
export function MultiWarrantyDialog({ sale, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setNotes('');
    }
  }, [open]);

  function toggle(saleItemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(saleItemId)) next.delete(saleItemId);
      else next.add(saleItemId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === (sale.items?.length ?? 0)) {
      setSelected(new Set());
    } else {
      setSelected(new Set((sale.items ?? []).map((it) => it.id)));
    }
  }

  const mut = useMutation({
    mutationFn: async () => {
      // Disparamos los N creates en paralelo. Si alguno falla, capturamos
      // su error pero seguimos con los otros. Devolvemos el resumen.
      const ids = Array.from(selected);
      const results = await Promise.allSettled(
        ids.map((saleItemId) =>
          createWarrantyClaim({
            saleItemId,
            notes: notes.trim() || null,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      qc.invalidateQueries({ queryKey: ['warranty-claims'] });
      if (fail === 0) {
        toast.success(
          `${ok} reclamo${ok === 1 ? '' : 's'} de garantía abierto${ok === 1 ? '' : 's'}`,
        );
      } else {
        toast.warning(
          `${ok} reclamo(s) abierto(s) · ${fail} falló(aron). Revisá la pantalla de garantías.`,
        );
      }
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudieron abrir los reclamos')),
  });

  const itemCount = sale.items?.length ?? 0;
  const allSelected = selected.size === itemCount && itemCount > 0;
  const valid = selected.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Crear garantías · Venta {sale.number}
          </DialogTitle>
          <DialogDescription>
            Marcá los items sobre los que querés abrir reclamo. Se creará un
            reclamo independiente por cada item seleccionado. Las garantías
            no afectan stock.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4"
                    />
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemCount === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      La venta no tiene items.
                    </TableCell>
                  </TableRow>
                )}
                {(sale.items ?? []).map((it) => (
                  <TableRow
                    key={it.id}
                    onClick={() => toggle(it.id)}
                    className="cursor-pointer hover:bg-accent/50"
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={() => toggle(it.id)}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {it.product?.name ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        SKU: {it.product?.sku ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.qty}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2">
            <Label htmlFor="warranty-notes">
              Descripción del problema (opcional, compartida)
            </Label>
            <Textarea
              id="warranty-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Cliente reporta que dejaron de funcionar tras 2 semanas de uso"
            />
            <p className="text-xs text-muted-foreground">
              Si abrís garantías sobre varios items, todos comparten esta
              descripción inicial. Después podés editar cada reclamo por
              separado.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mut.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || mut.isPending}>
              {mut.isPending
                ? 'Abriendo…'
                : selected.size === 0
                  ? 'Seleccioná items'
                  : `Abrir ${selected.size} reclamo${selected.size === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
