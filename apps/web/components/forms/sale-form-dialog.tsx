'use client';

import { SoftModal, softFormFieldsClass } from '@/components/ui/soft-modal';
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
    // Snapshot de cliente libre. Si está presente, el SaleForm muestra el
    // banner "registrá al cliente para continuar" en el tab Cliente y pago.
    customerSnapshot?: {
      name: string | null;
      taxId: string | null;
      email: string | null;
      phone: string | null;
    } | null;
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
    <SoftModal
      open={open}
      onOpenChange={onOpenChange}
      title={prefillFromQuotation ? 'Nueva venta · desde cotización' : 'Nueva venta'}
      subtitle="Registrá una venta y descontá stock automáticamente"
      size="4xl"
    >
      <div className={`p-5 ${softFormFieldsClass}`}>
        <SaleForm
          key={`new:${prefillFromQuotation?.quotationId ?? 'fresh'}:${open ? '1' : '0'}`}
          prefillFromQuotation={prefillFromQuotation}
          onSuccess={(sale) => {
            onSaved?.(sale);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </div>
    </SoftModal>
  );
}
