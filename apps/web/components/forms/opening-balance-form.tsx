'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  deleteOpeningBalance,
  setOpeningBalance,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import type {
  CashTransactionDto,
  PaymentMethodDto,
} from '@inventory/shared';

const schema = z.object({
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00')
    .refine((v) => Number(v) > 0, 'Mayor que 0'),
  paymentMethod: z.enum([
    'CASH',
    'TRANSFER',
    'CARD_DEBIT',
    'CARD_CREDIT',
    'PAYMENT_LINK',
  ]),
  date: z.string().min(1, 'Fecha requerida'),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  existing: CashTransactionDto | null;
  onClose: () => void;
}

export function OpeningBalanceDialog({ open, existing, onClose }: Props) {
  const qc = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
      paymentMethod: 'CASH',
      date: todayIso(),
    },
  });

  useEffect(() => {
    if (!open) return;
    if (existing) {
      form.reset({
        amount: existing.amount,
        paymentMethod: existing.paymentMethod,
        date: existing.date.slice(0, 10),
      });
    } else {
      form.reset({
        amount: '',
        paymentMethod: 'CASH',
        date: todayIso(),
      });
    }
  }, [open, existing, form]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
    qc.invalidateQueries({ queryKey: ['cash-transactions'] });
    qc.invalidateQueries({ queryKey: ['cashbox-opening-balance'] });
  };

  const saveMut = useMutation({
    mutationFn: (values: FormValues) =>
      setOpeningBalance({
        amount: values.amount,
        paymentMethod: values.paymentMethod as PaymentMethodDto,
        date: values.date,
      }),
    onSuccess: () => {
      invalidate();
      toast.success(
        existing ? 'Capital inicial actualizado' : 'Capital inicial registrado',
      );
      onClose();
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo guardar el capital inicial')),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteOpeningBalance(),
    onSuccess: () => {
      invalidate();
      toast.success('Capital inicial eliminado');
      onClose();
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo eliminar el capital inicial')),
  });

  const busy = saveMut.isPending || deleteMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Editar capital inicial' : 'Registrar capital inicial'}
          </DialogTitle>
          <DialogDescription>
            Monto con el que arranca tu empresa en el sistema. Se carga una sola
            vez y solo puede editarse mientras no haya otros movimientos.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
          className="space-y-4"
        >
          <Field label="Monto" error={form.formState.errors.amount?.message}>
            <Input
              {...form.register('amount')}
              placeholder="0.00"
              inputMode="decimal"
              autoFocus
            />
          </Field>

          <Field
            label="Método de pago"
            error={form.formState.errors.paymentMethod?.message}
          >
            <Controller
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Efectivo</SelectItem>
                    <SelectItem value="TRANSFER">Transferencia (banco)</SelectItem>
                    <SelectItem value="CARD_DEBIT">Tarjeta de débito</SelectItem>
                    <SelectItem value="CARD_CREDIT">Tarjeta de crédito</SelectItem>
                    <SelectItem value="PAYMENT_LINK">Link de pago</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Fecha" error={form.formState.errors.date?.message}>
            <Input type="date" {...form.register('date')} />
          </Field>

          <DialogFooter className="gap-2">
            {existing && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (confirm('¿Eliminar el capital inicial?')) {
                    deleteMut.mutate();
                  }
                }}
                disabled={busy}
                className="sm:mr-auto"
              >
                Eliminar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {saveMut.isPending ? 'Guardando...' : existing ? 'Guardar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
