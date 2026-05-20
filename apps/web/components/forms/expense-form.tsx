'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
  createExpense,
  listExpenseCategories,
  publicDocumentUrl,
  updateExpense,
  uploadExpenseReceipt,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import type { ExpenseDto, PaymentMethodDto } from '@inventory/shared';

const ACCEPTED_DOC_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

const schema = z.object({
  date: z.string().min(1, 'Fecha requerida'),
  categoryId: z.string().uuid('Elegí una categoría'),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00')
    .refine((v) => Number(v) > 0, 'Mayor que 0'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD_DEBIT', 'CARD_CREDIT', 'PAYMENT_LINK']),
  description: z.string().min(1, 'Descripción requerida').max(255),
  receiptUrl: z.string().nullable().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  expense?: ExpenseDto | null;
  onClose: () => void;
}

export function ExpenseFormDialog({ open, expense, onClose }: Props) {
  const qc = useQueryClient();
  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => listExpenseCategories(),
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayIso(),
      categoryId: '',
      amount: '',
      paymentMethod: 'CASH',
      description: '',
      receiptUrl: null,
    },
  });

  useEffect(() => {
    if (open) {
      if (expense) {
        form.reset({
          date: expense.date.slice(0, 10),
          categoryId: expense.categoryId,
          amount: expense.amount,
          paymentMethod: expense.paymentMethod,
          description: expense.description,
          receiptUrl: expense.receiptUrl ?? null,
        });
      } else {
        form.reset({
          date: todayIso(),
          categoryId: '',
          amount: '',
          paymentMethod: 'CASH',
          description: '',
          receiptUrl: null,
        });
      }
    }
  }, [open, expense, form]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const receiptUrl = form.watch('receiptUrl');

  async function onSelectFile(file?: File | null) {
    if (!file) return;
    if (!ACCEPTED_DOC_MIMES.includes(file.type)) {
      toast.error('Formato no permitido. PDF, JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      toast.error('Archivo supera 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadExpenseReceipt(file);
      form.setValue('receiptUrl', result.url, { shouldDirty: true });
      toast.success('Comprobante subido');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo subir el archivo'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const mut = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        date: values.date,
        categoryId: values.categoryId,
        amount: values.amount,
        paymentMethod: values.paymentMethod as PaymentMethodDto,
        description: values.description,
        receiptUrl: values.receiptUrl ?? null,
      };
      return expense ? updateExpense(expense.id, payload) : createExpense(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      toast.success(expense ? 'Gasto actualizado' : 'Gasto registrado');
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mut.mutate(v))}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Fecha" error={form.formState.errors.date?.message}>
              <Input type="date" {...form.register('date')} />
            </Field>
            <Field
              label="Monto"
              error={form.formState.errors.amount?.message}
            >
              <Input
                {...form.register('amount')}
                placeholder="0.00"
                inputMode="decimal"
              />
            </Field>
            <Field
              label="Categoría"
              error={form.formState.errors.categoryId?.message}
            >
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.isSystem ? ' (sistema)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
                      <SelectItem value="TRANSFER">Transferencia</SelectItem>
                      <SelectItem value="CARD_DEBIT">Tarjeta de débito</SelectItem>
                      <SelectItem value="CARD_CREDIT">Tarjeta de crédito</SelectItem>
                      <SelectItem value="PAYMENT_LINK">Link de pago</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Field
            label="Descripción"
            error={form.formState.errors.description?.message}
          >
            <Input
              {...form.register('description')}
              placeholder="ej: Arriendo local mayo, sueldos quincena"
            />
          </Field>

          <div className="space-y-2">
            <Label>Comprobante (opcional)</Label>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onSelectFile(e.target.files?.[0])}
            />
            {receiptUrl ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
                <Paperclip className="h-4 w-4" />
                <a
                  href={publicDocumentUrl(receiptUrl) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-muted-foreground hover:underline"
                >
                  Ver comprobante
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    form.setValue('receiptUrl', null, { shouldDirty: true })
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="w-full justify-start"
              >
                <Upload className="h-4 w-4" />
                {uploading ? 'Subiendo...' : 'Subir comprobante (PDF / imagen)'}
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending || uploading}>
              {mut.isPending ? 'Guardando...' : expense ? 'Guardar' : 'Crear'}
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
