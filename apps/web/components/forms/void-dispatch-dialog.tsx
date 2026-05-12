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
import { voidDispatchNote } from '@/lib/dispatch-api';
import type { DispatchNoteDto } from '@inventory/shared';

interface Props {
  note: DispatchNoteDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Anula una guía de despacho. La anulación NO toca stock ni caja (las guías
 * son documentos operativos, no contables). Tras anular, la venta vuelve a
 * permitir generar una nueva guía.
 */
export function VoidDispatchDialog({ note, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  const mut = useMutation({
    mutationFn: () => voidDispatchNote(note.id, { reason: reason.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch-notes'] });
      qc.invalidateQueries({ queryKey: ['dispatch-note', note.id] });
      qc.invalidateQueries({
        queryKey: ['active-dispatch-by-sale', note.saleId],
      });
      toast.success('Guía anulada. Podés generar una nueva para esta venta.');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo anular')),
  });

  const valid = reason.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular guía {note.number}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            La guía pasará a estado <strong>Anulada</strong> y queda en el historial
            con el motivo. La venta podrá generar una nueva guía. <strong>No</strong>{' '}
            afecta stock ni caja.
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (obligatorio, mín 5 chars)</Label>
            <Textarea
              id="reason"
              rows={4}
              autoFocus
              placeholder="Ej: Transportista mal cargado, dirección incorrecta, error en el N° de tracking"
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
              {mut.isPending ? 'Anulando...' : 'Anular guía'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
