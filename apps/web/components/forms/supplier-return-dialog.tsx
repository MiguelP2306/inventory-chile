'use client';

import { useRouter } from 'next/navigation';
import { SupplierReturnForm } from '@/components/forms/supplier-return-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PurchaseEntryDto } from '@inventory/shared';

interface Props {
  purchase: PurchaseEntryDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Ronda 11 — wrapper en Dialog del SupplierReturnForm. Análogo a
 * CustomerReturnDialog: al guardar con éxito, redirige al detalle de
 * la devolución creada.
 */
export function SupplierReturnDialog({
  purchase,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nueva devolución a {purchase.supplier?.name ?? 'proveedor'}
          </DialogTitle>
        </DialogHeader>
        <SupplierReturnForm
          key={`${purchase.id}:${open ? '1' : '0'}`}
          purchase={purchase}
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
