'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { QuotationFormDialog } from '@/components/forms/quotation-form-dialog';
import { SaleFormDialog } from '@/components/forms/sale-form-dialog';
import { OperationModal } from '@/components/operation-modal';
import { Button } from '@/components/ui/button';

// Ronda 8 — el botón de nueva operación dejó de ser FAB flotante y vive
// en el header junto al ThemeToggle. El cliente reportaba que el FAB
// tapaba contenedores de totales en "nueva entrada de mercadería" (y
// otras vistas con bloques al pie). El comportamiento sigue siendo el
// mismo: abre el modal de elección Venta/Cotización.

// Oculto en pantallas públicas y login (no aplica acción).
const HIDDEN_PREFIXES = ['/p/', '/login'];

export function OperationButton() {
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
      <Button
        size="sm"
        onClick={() => setChooserOpen(true)}
        aria-label="Nueva operación"
        title="Nueva operación"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Nuevo</span>
      </Button>

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
