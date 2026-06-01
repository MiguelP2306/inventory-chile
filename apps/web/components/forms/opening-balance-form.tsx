'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SoftModal } from '@/components/ui/soft-modal';
import {
  createOpeningBalance,
  deleteOpeningBalance,
  listOpeningBalances,
  updateOpeningBalance,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import type { CashTransactionDto, PaymentMethodDto } from '@inventory/shared';

const METHOD_LABEL: Record<PaymentMethodDto, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Tarjeta débito',
  CARD_CREDIT: 'Tarjeta crédito',
  PAYMENT_LINK: 'Link de pago',
};

const LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';
const INPUT =
  'w-full rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-semibold text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white';
const SELECT = `${INPUT} appearance-none pr-10`;

const schema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00').refine((v) => Number(v) > 0, 'Mayor que 0'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD_DEBIT', 'CARD_CREDIT', 'PAYMENT_LINK']),
  date: z.string().min(1, 'Fecha requerida'),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OpeningBalanceDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['cashbox-opening-balance'],
    queryFn: listOpeningBalances,
    enabled: open,
  });
  const items = list.data?.transactions ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', paymentMethod: 'CASH', date: todayIso() },
  });

  // Al abrir el dialog, resetear el form a estado "nuevo".
  useEffect(() => {
    if (open) {
      setEditingId(null);
      form.reset({ amount: '', paymentMethod: 'CASH', date: todayIso() });
    }
  }, [open, form]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
    qc.invalidateQueries({ queryKey: ['cash-transactions'] });
    qc.invalidateQueries({ queryKey: ['cashbox-opening-balance'] });
  };

  const saveMut = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        amount: values.amount,
        paymentMethod: values.paymentMethod as PaymentMethodDto,
        date: values.date,
      };
      return editingId ? updateOpeningBalance(editingId, payload) : createOpeningBalance(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(editingId ? 'Capital inicial actualizado' : 'Capital inicial registrado');
      setEditingId(null);
      form.reset({ amount: '', paymentMethod: 'CASH', date: todayIso() });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar el capital inicial')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOpeningBalance(id),
    onSuccess: () => {
      invalidate();
      toast.success('Capital inicial eliminado');
      setEditingId(null);
      form.reset({ amount: '', paymentMethod: 'CASH', date: todayIso() });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar el capital inicial')),
  });

  const busy = saveMut.isPending || deleteMut.isPending;

  function startEdit(tx: CashTransactionDto) {
    setEditingId(tx.id);
    form.reset({ amount: tx.amount, paymentMethod: tx.paymentMethod, date: tx.date.slice(0, 10) });
  }

  function cancelEdit() {
    setEditingId(null);
    form.reset({ amount: '', paymentMethod: 'CASH', date: todayIso() });
  }

  return (
    <SoftModal
      open={open}
      onOpenChange={(v) => (v ? null : onClose())}
      title="Capitales iniciales"
      subtitle="Montos con los que arranca la empresa (capital propio, aporte de socio, crédito, etc.)"
      size="xl"
    >
      <div className="space-y-5 p-5">
        {/* ---------- Form ---------- */}
        <form
          onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
          className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/40 p-4 dark:border-slate-850 dark:bg-slate-900/20"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {editingId ? 'Editar capital inicial' : 'Nuevo capital inicial'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-50 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar edición
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Monto" error={form.formState.errors.amount?.message}>
              <input {...form.register('amount')} placeholder="0.00" inputMode="decimal" className={INPUT} />
            </Field>
            <Field label="Método de pago" error={form.formState.errors.paymentMethod?.message}>
              <Controller
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <div className="relative">
                    <select value={field.value} onChange={(e) => field.onChange(e.target.value)} className={SELECT}>
                      <option value="CASH">Efectivo</option>
                      <option value="TRANSFER">Transferencia (banco)</option>
                      <option value="CARD_DEBIT">Tarjeta de débito</option>
                      <option value="CARD_CREDIT">Tarjeta de crédito</option>
                      <option value="PAYMENT_LINK">Link de pago</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                )}
              />
            </Field>
            <Field label="Fecha" error={form.formState.errors.date?.message}>
              <input type="date" {...form.register('date')} className={INPUT} />
            </Field>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveMut.isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar'}
            </button>
          </div>
        </form>

        {/* ---------- Listado ---------- */}
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Capitales registrados
          </h3>

          {list.isLoading && (
            <div className="space-y-2">
              <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          )}

          {!list.isLoading && items.length === 0 && (
            <p className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-center text-xs font-semibold text-slate-400 dark:border-slate-850 dark:bg-slate-900/20">
              Todavía no hay capitales iniciales cargados.
            </p>
          )}

          {!list.isLoading && items.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-2xl border border-slate-100 dark:border-slate-850">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {items.map((tx) => (
                    <tr key={tx.id} className={editingId === tx.id ? 'bg-[#2F6BFF]/5' : 'transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10'}>
                      <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">
                        {new Date(tx.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{METHOD_LABEL[tx.paymentMethod]}</td>
                      <td className="px-4 py-3 text-right font-mono font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(tx)}
                            disabled={busy}
                            title="Editar"
                            className="cursor-pointer p-1.5 text-slate-400 transition-colors hover:text-[#2F6BFF] disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('¿Eliminar este capital inicial?')) deleteMut.mutate(tx.id);
                            }}
                            disabled={busy}
                            title="Eliminar"
                            className="cursor-pointer p-1.5 text-slate-400 transition-colors hover:text-rose-500 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Cerrar
          </button>
        </div>
      </div>
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
