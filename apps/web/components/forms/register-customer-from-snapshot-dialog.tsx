'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { apiErrorMessage } from '@/lib/catalog-api';
import {
  createCustomer,
  listCustomers,
  type CustomerInput,
} from '@/lib/customers-api';
import { isValidPhone, normalizePhone } from '@/lib/validators/phone';
import { isValidRut, normalizeRut } from '@/lib/validators/rut';
import type { CustomerDto } from '@inventory/shared';

const schema = z.object({
  name: z.string().min(1, 'Nombre obligatorio').max(180),
  taxId: z
    .string()
    .min(1, 'RUT obligatorio')
    .refine((v) => isValidRut(v), 'RUT inválido (formato 12345678-9)'),
  email: z.string().email('Email inválido').or(z.literal('')).optional().nullable(),
  phone: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => !v || v.trim() === '' || isValidPhone(v),
      'Teléfono inválido (ej: +56 9 1234 5678)',
    ),
});

type FormValues = z.infer<typeof schema>;

export interface CustomerSnapshot {
  name: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: CustomerSnapshot;
  // Se llama tras registrar (o reusar) un cliente del catálogo. El caller
  // suele setearlo como el `customer` del SaleForm.
  onResolved: (customer: CustomerDto) => void;
}

/**
 * Dialog que registra (o linkea con uno existente) un cliente del catálogo
 * a partir del snapshot de una cotización libre. Flujo:
 *
 *  1. Pre-llena el form con los datos del snapshot. Todos editables.
 *  2. Si el snapshot trae un RUT válido, consulta `/customers?q=<rut>` y
 *     filtra por taxId exacto para detectar duplicados ANTES de crear.
 *  3. Si encuentra un duplicado, muestra un banner con dos opciones:
 *     "Usar este cliente" (resolve directo, no crea) o "Crear uno nuevo"
 *     (sigue con la creación — útil si el operador detecta que el match
 *     no era correcto).
 *  4. Al guardar, `createCustomer` normaliza RUT y teléfono.
 *
 * El backend tiene índice único en `customers.taxId`, así que la validación
 * de duplicado del paso 2 es defensa de UX — si pasa, el 409 final igual
 * lo atrapa.
 */
export function RegisterCustomerFromSnapshotDialog({
  open,
  onOpenChange,
  snapshot,
  onResolved,
}: Props) {
  const qc = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: snapshot.name ?? '',
      taxId: snapshot.taxId ?? '',
      email: snapshot.email ?? '',
      phone: snapshot.phone ?? '',
    },
  });

  // Re-llenar el form si cambia el snapshot mientras el dialog está montado
  // (caso raro pero contemplado para que `key` no sea estrictamente necesario).
  useEffect(() => {
    if (open) {
      form.reset({
        name: snapshot.name ?? '',
        taxId: snapshot.taxId ?? '',
        email: snapshot.email ?? '',
        phone: snapshot.phone ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snapshot.taxId, snapshot.name, snapshot.email, snapshot.phone]);

  const watchedRut = form.watch('taxId');
  const normalizedRut =
    watchedRut && isValidRut(watchedRut) ? normalizeRut(watchedRut) : null;

  // Búsqueda silenciosa de duplicados por RUT. Solo dispara cuando el RUT
  // es válido para no spamear el backend con cada keystroke.
  const dupQuery = useQuery({
    queryKey: ['customers-dup-check', normalizedRut],
    queryFn: async () => {
      if (!normalizedRut) return null;
      const res = await listCustomers({ q: normalizedRut, page: 1, pageSize: 5 });
      const items = Array.isArray(res) ? res : res.items;
      return (
        items.find((c) => c.taxId && normalizeRut(c.taxId) === normalizedRut) ??
        null
      );
    },
    enabled: open && !!normalizedRut,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input),
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers-picker'] });
      toast.success(`Cliente ${customer.name} registrado`);
      onResolved(customer);
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo registrar')),
  });

  function onSubmit(values: FormValues) {
    const trimmed = (v: string | null | undefined) =>
      v && v.trim() !== '' ? v.trim() : null;
    createMut.mutate({
      name: values.name.trim(),
      taxId: normalizeRut(values.taxId),
      email: trimmed(values.email),
      phone: values.phone && values.phone.trim() !== ''
        ? normalizePhone(values.phone)
        : null,
    });
  }

  function useExisting(customer: CustomerDto) {
    toast.success(`Cliente existente seleccionado: ${customer.name}`);
    onResolved(customer);
    onOpenChange(false);
  }

  const duplicate = dupQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Registrar cliente
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Estos datos vienen del snapshot de la cotización. Editalos si hace falta
          y guardá para registrar al cliente en el catálogo.
        </p>

        {duplicate && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">
                  Ya existe un cliente con este RUT
                </div>
                <div className="mt-1 text-xs">
                  <strong>{duplicate.name}</strong>
                  {duplicate.email ? ` · ${duplicate.email}` : ''}
                  {duplicate.phone ? ` · ${duplicate.phone}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => useExisting(duplicate)}
                  >
                    Usar este cliente
                  </Button>
                  <span className="text-xs text-muted-foreground self-center">
                    O completá el form abajo para crear uno nuevo.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* stopPropagation: este form vive dentro de un Dialog (Radix Portal)
            renderizado adentro del <form> de la venta. En React los eventos
            burbujean por el árbol de componentes (no el DOM), así que sin esto
            el submit cruzaría el portal y dispararía el guardado de la venta. */}
        <form
          onSubmit={(e) => {
            e.stopPropagation();
            void form.handleSubmit(onSubmit)(e);
          }}
          className="space-y-3"
        >
          <Field label="Nombre o razón social" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} autoFocus />
          </Field>
          <Field label="RUT" error={form.formState.errors.taxId?.message}>
            <Input {...form.register('taxId')} placeholder="12.345.678-9" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email (opcional)" error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register('email')} placeholder="cliente@correo.cl" />
            </Field>
            <Field label="Teléfono (opcional)" error={form.formState.errors.phone?.message}>
              <Input {...form.register('phone')} placeholder="+56 9 1234 5678" />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMut.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Registrando...' : 'Registrar y continuar'}
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
