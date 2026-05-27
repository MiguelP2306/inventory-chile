'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  createOpeningBalance,
  deleteOpeningBalance,
  listOpeningBalances,
  updateOpeningBalance,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import type {
  CashTransactionDto,
  PaymentMethodDto,
} from '@inventory/shared';

const METHOD_LABEL: Record<PaymentMethodDto, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Tarjeta débito',
  CARD_CREDIT: 'Tarjeta crédito',
  PAYMENT_LINK: 'Link de pago',
};

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
    defaultValues: {
      amount: '',
      paymentMethod: 'CASH',
      date: todayIso(),
    },
  });

  // Al abrir el dialog, resetear el form a estado "nuevo".
  useEffect(() => {
    if (open) {
      setEditingId(null);
      form.reset({
        amount: '',
        paymentMethod: 'CASH',
        date: todayIso(),
      });
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
      return editingId
        ? updateOpeningBalance(editingId, payload)
        : createOpeningBalance(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(
        editingId ? 'Capital inicial actualizado' : 'Capital inicial registrado',
      );
      setEditingId(null);
      form.reset({
        amount: '',
        paymentMethod: 'CASH',
        date: todayIso(),
      });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo guardar el capital inicial')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOpeningBalance(id),
    onSuccess: () => {
      invalidate();
      toast.success('Capital inicial eliminado');
      // Si estábamos editando justo el que se borró, salir del modo edición.
      setEditingId(null);
      form.reset({
        amount: '',
        paymentMethod: 'CASH',
        date: todayIso(),
      });
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo eliminar el capital inicial')),
  });

  const busy = saveMut.isPending || deleteMut.isPending;

  function startEdit(tx: CashTransactionDto) {
    setEditingId(tx.id);
    form.reset({
      amount: tx.amount,
      paymentMethod: tx.paymentMethod,
      date: tx.date.slice(0, 10),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    form.reset({
      amount: '',
      paymentMethod: 'CASH',
      date: todayIso(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Capitales iniciales</DialogTitle>
          <DialogDescription>
            Montos con los que arranca la empresa en el sistema. Podés cargar
            tantos como necesites (capital propio, aporte de socio, crédito,
            etc.) y editarlos o eliminarlos individualmente.
          </DialogDescription>
        </DialogHeader>

        {/* ---------- Form ---------- */}
        <form
          onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
          className="space-y-4 rounded-md border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {editingId ? 'Editar capital inicial' : 'Nuevo capital inicial'}
            </h3>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelEdit}
                disabled={busy}
              >
                <X className="h-4 w-4" />
                Cancelar edición
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Monto" error={form.formState.errors.amount?.message}>
              <Input
                {...form.register('amount')}
                placeholder="0.00"
                inputMode="decimal"
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
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {saveMut.isPending
                ? 'Guardando...'
                : editingId
                  ? 'Guardar cambios'
                  : 'Agregar'}
            </Button>
          </div>
        </form>

        {/* ---------- Listado ---------- */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Capitales registrados</h3>

          {list.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!list.isLoading && items.length === 0 && (
            <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Todavía no hay capitales iniciales cargados.
            </p>
          )}

          {!list.isLoading && items.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Método</th>
                    <th className="px-3 py-2 text-right font-medium">Monto</th>
                    <th className="px-3 py-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((tx) => (
                    <tr
                      key={tx.id}
                      className={
                        editingId === tx.id
                          ? 'bg-primary/5'
                          : 'border-t hover:bg-muted/30'
                      }
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {new Date(tx.date).toLocaleDateString('es-CL', {
                          dateStyle: 'short',
                        })}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {METHOD_LABEL[tx.paymentMethod]}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-stock-ok">
                        +{formatCurrency(tx.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit(tx)}
                            disabled={busy}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('¿Eliminar este capital inicial?')) {
                                deleteMut.mutate(tx.id);
                              }
                            }}
                            disabled={busy}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
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
