'use client';

import { useRouter } from 'next/navigation';
import { CustomerReturnForm } from '@/components/forms/customer-return-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SaleDto } from '@inventory/shared';

interface Props {
  sale: SaleDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Wrapper en Dialog para abrir el form de devolución sin navegar. Al guardar
 * con éxito, redirige al detalle de la devolución creada.
 */
export function CustomerReturnDialog({ sale, open, onOpenChange }: Props) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva devolución · Venta {sale.number}</DialogTitle>
        </DialogHeader>
        <CustomerReturnForm
          key={`${sale.id}:${open ? '1' : '0'}`}
          sale={sale}
          onSuccess={(ret) => {
            onOpenChange(false);
            router.push(`/devoluciones/${ret.id}`);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
