'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { QuotationFormDialog } from '@/components/forms/quotation-form-dialog';
import { SaleFormDialog } from '@/components/forms/sale-form-dialog';
import { OperationModal } from '@/components/operation-modal';
import { cn } from '@/lib/utils';

// El FAB está oculto cuando el operador está en la pantalla pública o en
// pantallas donde la acción ya está embebida (no agrega valor).
const HIDDEN_PREFIXES = ['/p/', '/login'];

export function OperationFab() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);

  if (pathname && HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Nueva operación"
        title="Nueva operación"
        onClick={() => setChooserOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-40',
          'flex h-14 w-14 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg shadow-black/20',
          'transition-transform hover:scale-105 hover:shadow-xl active:scale-95',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <Plus className="h-6 w-6" />
      </button>

      <OperationModal
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        onPickQuotation={() => setQuotationOpen(true)}
        onPickSale={() => setSaleOpen(true)}
      />

      <QuotationFormDialog
        open={quotationOpen}
        onOpenChange={setQuotationOpen}
        mode="create"
        onSaved={(saved) => {
          qc.invalidateQueries({ queryKey: ['quotations'] });
          toast.success(`Cotización ${saved.number} creada`, {
            action: {
              label: 'Ver detalle',
              onClick: () => router.push(`/cotizaciones/${saved.id}`),
            },
          });
        }}
      />

      <SaleFormDialog
        open={saleOpen}
        onOpenChange={setSaleOpen}
        onSaved={(saved) => {
          qc.invalidateQueries({ queryKey: ['sales'] });
          qc.invalidateQueries({ queryKey: ['stock'] });
          qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
          toast.success(`Venta ${saved.number} registrada`, {
            action: {
              label: 'Ver detalle',
              onClick: () => router.push(`/ventas/${saved.id}`),
            },
          });
        }}
      />
    </>
  );
}
