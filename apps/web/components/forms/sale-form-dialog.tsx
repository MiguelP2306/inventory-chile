'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SaleForm } from '@/components/forms/sale-form';
import type { CustomerDto, SaleDto } from '@inventory/shared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Si se pasa, prefilea el form con datos de la cotización. El SaleForm
  // manda `quotationId` al backend para que la cotización se marque
  // CONVERTED en la misma transacción.
  prefillFromQuotation?: {
    quotationId: string;
    customer: CustomerDto | null;
    items: Array<{
      productId: string;
      sku: string;
      name: string;
      qty: number;
      unitPrice: string;
      discount: string;
      discountPercent: string | null;
    }>;
    notes: string | null;
  };
  onSaved?: (sale: SaleDto) => void;
}

export function SaleFormDialog({
  open,
  onOpenChange,
  prefillFromQuotation,
  onSaved,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {prefillFromQuotation
              ? `Nueva venta · desde cotización`
              : 'Nueva venta'}
          </DialogTitle>
        </DialogHeader>
        <SaleForm
          key={`new:${prefillFromQuotation?.quotationId ?? 'fresh'}:${open ? '1' : '0'}`}
          prefillFromQuotation={prefillFromQuotation}
          onSuccess={(sale) => {
            onSaved?.(sale);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
