'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CommuneSelect } from '@/components/commune-select';
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
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/catalog-api';
import { getCustomer } from '@/lib/customers-api';
import {
  createDispatchNote,
  listRecentCarriers,
} from '@/lib/dispatch-api';
import type { SaleDto } from '@inventory/shared';

interface Props {
  sale: SaleDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Form modal para generar una guía de despacho a partir de una venta.
 *
 * Pre-llena la dirección de entrega con la del cliente catalogado, editable.
 * El campo `carrier` es texto libre con sugerencias de transportistas
 * usados recientemente (datalist HTML).
 */
export function GenerateDispatchDialog({ sale, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const router = useRouter();

  // Carga datos del cliente para pre-llenar dirección. Solo cuando se abre.
  const customer = useQuery({
    queryKey: ['customer', sale.customerId],
    queryFn: () => getCustomer(sale.customerId),
    enabled: open && !!sale.customerId,
  });

  // Lista de transportistas recientes (para datalist autocompletable).
  const carriers = useQuery({
    queryKey: ['dispatch-recent-carriers'],
    queryFn: () => listRecentCarriers(),
    enabled: open,
  });

  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [communeId, setCommuneId] = useState<string | null>(null);
  const [addressNotes, setAddressNotes] = useState('');
  const [notes, setNotes] = useState('');

  // Pre-llenar con datos del cliente cuando se cargan. Solo si los campos
  // están vacíos (no pisamos lo que el operador ya tipeó).
  useEffect(() => {
    if (!open) return;
    const c = customer.data;
    if (!c) return;
    setAddressStreet((prev) => prev || c.addressStreet || '');
    setAddressNumber((prev) => prev || c.addressNumber || '');
    setCommuneId((prev) => prev || c.communeId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.data, open]);

  // Resetear el form al cerrar.
  useEffect(() => {
    if (!open) {
      setCarrier('');
      setTrackingNumber('');
      setAddressStreet('');
      setAddressNumber('');
      setCommuneId(null);
      setAddressNotes('');
      setNotes('');
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () =>
      createDispatchNote({
        saleId: sale.id,
        carrier: carrier.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        addressStreet: addressStreet.trim() || null,
        addressNumber: addressNumber.trim() || null,
        communeId: communeId ?? null,
        addressNotes: addressNotes.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ['dispatch-notes'] });
      qc.invalidateQueries({ queryKey: ['active-dispatch-by-sale', sale.id] });
      qc.invalidateQueries({ queryKey: ['dispatch-recent-carriers'] });
      toast.success(`Guía ${note.number} generada`);
      onOpenChange(false);
      router.push(`/guias/${note.id}`);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo generar la guía')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Generar guía de despacho · Venta {sale.number}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="rounded-md bg-muted p-3 text-sm">
            <div>
              Cliente: <span className="font-medium">{sale.customer?.name ?? '—'}</span>
            </div>
            <div>
              Items: <span className="font-medium">{sale.items?.length ?? 0}</span>
            </div>
          </div>

          <fieldset className="space-y-3 rounded-md border p-4">
            <legend className="px-1 text-sm font-semibold">
              Dirección de entrega
            </legend>
            <p className="-mt-2 text-xs text-muted-foreground">
              Pre-llenada con la del cliente. Editala si el envío es a otra dirección.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="addressStreet">Calle</Label>
                <Input
                  id="addressStreet"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  placeholder="Av. Providencia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressNumber">Número</Label>
                <Input
                  id="addressNumber"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                  placeholder="1234"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Comuna</Label>
              <CommuneSelect value={communeId} onChange={setCommuneId} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressNotes">
                Referencias / indicaciones (opcional)
              </Label>
              <Input
                id="addressNotes"
                value={addressNotes}
                onChange={(e) => setAddressNotes(e.target.value)}
                placeholder="Depto 304, edificio azul, llamar al timbre"
                maxLength={255}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-md border p-4">
            <legend className="px-1 text-sm font-semibold">
              Transporte
            </legend>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="carrier">Transportista</Label>
                <Input
                  id="carrier"
                  list="recent-carriers"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder="ej: Chilexpress, Starken, propio"
                  maxLength={120}
                />
                <datalist id="recent-carriers">
                  {(carriers.data ?? []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trackingNumber">
                  N° de seguimiento (opcional)
                </Label>
                <Input
                  id="trackingNumber"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="ej: 1234567890"
                  maxLength={120}
                />
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="notes">Observaciones (opcional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instrucciones especiales del despacho"
            />
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
              <Truck className="h-4 w-4" />
              {mut.isPending ? 'Generando...' : 'Generar guía'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
