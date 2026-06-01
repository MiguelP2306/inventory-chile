'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Paperclip, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SoftModal } from '@/components/ui/soft-modal';
import {
  createExpense,
  listExpenseCategories,
  publicDocumentUrl,
  updateExpense,
  uploadExpenseReceipt,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import type { ExpenseDto, PaymentMethodDto } from '@inventory/shared';

const ACCEPTED_DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

const LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';
const INPUT =
  'w-full rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-semibold text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white';
const SELECT = `${INPUT} appearance-none pr-10`;

const schema = z.object({
  date: z.string().min(1, 'Fecha requerida'),
  categoryId: z.string().uuid('Elegí una categoría'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00').refine((v) => Number(v) > 0, 'Mayor que 0'),
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
    <SoftModal
      open={open}
      onOpenChange={(v) => (v ? null : onClose())}
      title={expense ? 'Editar gasto' : 'Nuevo gasto'}
      subtitle="Registrá un egreso. Impacta el saldo de caja del método elegido."
    >
      <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Fecha" error={form.formState.errors.date?.message}>
            <input type="date" {...form.register('date')} className={INPUT} />
          </Field>
          <Field label="Monto" error={form.formState.errors.amount?.message}>
            <input {...form.register('amount')} placeholder="0.00" inputMode="decimal" className={INPUT} />
          </Field>
          <Field label="Categoría" error={form.formState.errors.categoryId?.message}>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <div className="relative">
                  <select value={field.value} onChange={(e) => field.onChange(e.target.value)} className={SELECT}>
                    <option value="" disabled>Elegí una categoría</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.isSystem ? ' (sistema)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              )}
            />
          </Field>
          <Field label="Método de pago" error={form.formState.errors.paymentMethod?.message}>
            <Controller
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <div className="relative">
                  <select value={field.value} onChange={(e) => field.onChange(e.target.value)} className={SELECT}>
                    <option value="CASH">Efectivo</option>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="CARD_DEBIT">Tarjeta de débito</option>
                    <option value="CARD_CREDIT">Tarjeta de crédito</option>
                    <option value="PAYMENT_LINK">Link de pago</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              )}
            />
          </Field>
        </div>

        <Field label="Descripción" error={form.formState.errors.description?.message}>
          <input {...form.register('description')} placeholder="ej: Arriendo local mayo, sueldos quincena" className={INPUT} />
        </Field>

        <div className="space-y-1.5">
          <span className={LABEL}>Comprobante (opcional)</span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onSelectFile(e.target.files?.[0])}
          />
          {receiptUrl ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-850 dark:bg-slate-900/50">
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
              <a
                href={publicDocumentUrl(receiptUrl) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate font-bold text-slate-600 hover:underline dark:text-slate-300"
              >
                Ver comprobante
              </a>
              <button
                type="button"
                onClick={() => form.setValue('receiptUrl', null, { shouldDirty: true })}
                className="shrink-0 cursor-pointer p-1 text-slate-400 transition-colors hover:text-rose-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-3 text-xs font-bold text-slate-500 transition-all hover:border-[#2F6BFF]/55 hover:bg-slate-50/50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/10"
            >
              <Upload className="h-4 w-4 text-slate-400" />
              {uploading ? 'Subiendo…' : 'Subir comprobante (PDF / imagen)'}
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={mut.isPending || uploading}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mut.isPending ? 'Guardando…' : expense ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </SoftModal>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className={LABEL}>{label}</span>
      {children}
      {error && <p className="text-[11px] font-bold text-rose-500">{error}</p>}
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
