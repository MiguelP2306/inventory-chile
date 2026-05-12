'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { createWarrantyClaim } from '@/lib/warranties-api';
import type { SaleItemDto } from '@inventory/shared';

interface Props {
  saleItem: SaleItemDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Abre un reclamo de garantía sobre un saleItem específico. El operador
 * escribe una nota inicial (qué reporta el cliente, qué se vio). Al guardar
 * navega al detalle del reclamo para gestionar transiciones de estado.
 */
export function OpenWarrantyDialog({ saleItem, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const router = useRouter();
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) setNotes('');
  }, [open]);

  const mut = useMutation({
    mutationFn: () =>
      createWarrantyClaim({
        saleItemId: saleItem.id,
        notes: notes.trim() || null,
      }),
    onSuccess: (claim) => {
      qc.invalidateQueries({ queryKey: ['warranty-claims'] });
      toast.success(`Reclamo ${claim.number} abierto`);
      onOpenChange(false);
      router.push(`/garantias/${claim.id}`);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo abrir el reclamo')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Abrir reclamo de garantía
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <div>
              Producto:{' '}
              <span className="font-medium">{saleItem.product?.name ?? '—'}</span>
            </div>
            <div>
              SKU: <span className="font-mono text-xs">{saleItem.product?.sku ?? '—'}</span>
            </div>
            <div>
              Cantidad vendida:{' '}
              <span className="font-medium tabular-nums">{saleItem.qty}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Descripción del problema (opcional)</Label>
            <Textarea
              id="notes"
              rows={4}
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Cliente reporta que el producto dejó de funcionar tras 2 semanas de uso"
            />
            <p className="text-xs text-muted-foreground">
              El reclamo se crea en estado <strong>Abierto</strong>. Desde el detalle
              podés moverlo a En revisión → Aprobado/Rechazado → Resuelto.
              No afecta stock automáticamente.
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
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Abriendo...' : 'Abrir reclamo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
