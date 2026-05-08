'use client';

import { ClipboardList, Plus, ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>¿Qué querés crear?</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleQuotation}
            className="flex flex-col items-center gap-3 rounded-md border bg-card p-6 text-center transition-colors hover:bg-accent"
          >
            <ClipboardList className="h-10 w-10 text-primary" />
            <div className="text-base font-semibold">Cotización</div>
            <div className="text-xs text-muted-foreground">
              Generá una cotización para enviarle al cliente por email o WhatsApp.
            </div>
          </button>
          {saleEnabled ? (
            <button
              type="button"
              onClick={handleSale}
              className="flex flex-col items-center gap-3 rounded-md border bg-card p-6 text-center transition-colors hover:bg-accent"
            >
              <ShoppingCart className="h-10 w-10 text-primary" />
              <div className="text-base font-semibold">Venta</div>
              <div className="text-xs text-muted-foreground">
                Registrá una venta y descontá stock automáticamente.
              </div>
            </button>
          ) : (
            <div className="flex cursor-not-allowed flex-col items-center gap-3 rounded-md border bg-muted/30 p-6 text-center opacity-70">
              <ShoppingCart className="h-10 w-10 text-muted-foreground" />
              <div className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
                Venta
                <Badge variant="outline">Próximamente</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Disponible en Fase 7.
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
