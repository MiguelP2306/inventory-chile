'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { QuotationForm, type QuotationBagItem } from '@/components/forms/quotation-form';
import type { QuotationDto } from '@inventory/shared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialData?: QuotationDto;
  /**
   * Items provenientes del bolso (localStorage) para prellenar el form en
   * modo create. Tienen prioridad sobre `initialData?.items`.
   */
  initialBagItems?: QuotationBagItem[];
  onSaved?: (q: QuotationDto) => void;
}

export function QuotationFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  initialBagItems,
  onSaved,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit'
              ? `Editar cotización${initialData ? ` ${initialData.number}` : ''}`
              : 'Nueva cotización'}
          </DialogTitle>
        </DialogHeader>
        {/* key fuerza un remount limpio cada vez que se abre el modal con
            distinto target (create vs edit X) */}
        <QuotationForm
          key={`${mode}:${initialData?.id ?? 'new'}:${open ? '1' : '0'}`}
          mode={mode}
          initialData={initialData}
          initialBagItems={initialBagItems}
          embedded
          onSuccess={(saved) => {
            onSaved?.(saved);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
