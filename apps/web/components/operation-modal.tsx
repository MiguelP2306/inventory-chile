'use client';

import { ClipboardList, Plus, ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SoftModal } from '@/components/ui/soft-modal';

interface OperationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Si se provee, se llama en lugar de navegar — el caller decide qué pasa
  // (ej. abrir un dialog inline para crear sin cambiar de pantalla).
  onPickQuotation?: () => void;
  onPickSale?: () => void;
}

export function OperationModal({
  open,
  onOpenChange,
  onPickQuotation,
  onPickSale,
}: OperationModalProps) {
  const router = useRouter();

  const handleQuotation = () => {
    onOpenChange(false);
    if (onPickQuotation) {
      onPickQuotation();
    } else {
      router.push('/cotizaciones?new=1');
    }
  };

  const handleSale = () => {
    onOpenChange(false);
    if (onPickSale) onPickSale();
  };

  const saleEnabled = !!onPickSale;

  return (
    <SoftModal
      open={open}
      onOpenChange={onOpenChange}
      title="¿Qué querés crear?"
      subtitle="Elegí el tipo de operación a registrar"
      size="xl"
    >
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleQuotation}
          className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center transition-all hover:border-[#2F6BFF]/40 hover:bg-[#2F6BFF]/5 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <ClipboardList className="h-10 w-10 text-[#2F6BFF]" />
          <div className="text-base font-black text-slate-900 dark:text-white">
            Cotización
          </div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Generá una cotización para enviarle al cliente por email o WhatsApp.
          </div>
        </button>
        {saleEnabled ? (
          <button
            type="button"
            onClick={handleSale}
            className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center transition-all hover:border-[#2F6BFF]/40 hover:bg-[#2F6BFF]/5 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <ShoppingCart className="h-10 w-10 text-[#2F6BFF]" />
            <div className="text-base font-black text-slate-900 dark:text-white">
              Venta
            </div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Registrá una venta y descontá stock automáticamente.
            </div>
          </button>
        ) : (
          <div className="flex cursor-not-allowed flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center opacity-70 dark:border-slate-800 dark:bg-slate-900/20">
            <ShoppingCart className="h-10 w-10 text-slate-400" />
            <div className="flex items-center gap-2 text-base font-bold text-slate-400">
              Venta
              <Badge variant="outline">Próximamente</Badge>
            </div>
            <div className="text-xs text-slate-400">Disponible en Fase 7.</div>
          </div>
        )}
      </div>
    </SoftModal>
  );
}

interface NewOperationButtonProps {
  label?: string;
  className?: string;
}

export function NewOperationButton({
  label = 'Nueva operación',
  className,
}: NewOperationButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className={className}>
        <Plus className="h-4 w-4" />
        {label}
      </Button>
      <OperationModal open={open} onOpenChange={setOpen} />
    </>
  );
}
