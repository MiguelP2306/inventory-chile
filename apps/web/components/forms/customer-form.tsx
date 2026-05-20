'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CommuneSelect } from '@/components/commune-select';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { MarkLostDialog } from '@/components/mark-lost-dialog';
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
  apiErrorMessage,
} from '@/lib/catalog-api';
import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
  type CustomerInput,
} from '@/lib/customers-api';
import { isValidPhone, normalizePhone } from '@/lib/validators/phone';
import { isValidRut, normalizeRut } from '@/lib/validators/rut';
import type { CustomerDto, CustomerSourceDto } from '@inventory/shared';

const CUSTOMER_SOURCES: { value: CustomerSourceDto; label: string }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Teléfono' },
  { value: 'IN_PERSON', label: 'En persona' },
  { value: 'OTHER', label: 'Otro' },
];

const schema = z.object({
  name: z.string().min(1, 'Nombre obligatorio').max(180),
  // Ronda 9 — RUT opcional. Permite clientes "lite" sólo con WhatsApp.
  // El sistema bloquea facturar ventas a clientes sin RUT (validado en
  // SalesService.create del backend) — el operador debe completarlo antes
  // de emitir la nota de venta.
  taxId: z
    .string()
    .refine(
      (v) => v === '' || isValidRut(v),
      'RUT inválido (formato 12345678-9)',
    )
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .email('Email inválido')
    .or(z.literal(''))
    .optional()
    .nullable(),
  phone: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => !v || v.trim() === '' || isValidPhone(v),
      'Teléfono inválido (ej: +56 9 1234 5678)',
    ),
  addressStreet: z.string().max(200).optional().or(z.literal('')),
  addressNumber: z.string().max(20).optional().or(z.literal('')),
  communeId: z.string().uuid().optional().nullable(),
  internalNotes: z.string().optional().or(z.literal('')),
  // Fase 8.5
  source: z
    .enum(['WHATSAPP', 'EMAIL', 'PHONE', 'IN_PERSON', 'OTHER'])
    .default('OTHER'),
  whatsappPhone: z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => !v || v.trim() === '' || isValidPhone(v),
      'WhatsApp inválido (ej: +56 9 1234 5678)',
    ),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  customer?: CustomerDto;
}

export function CustomerForm({ customer }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [markLostOpen, setMarkLostOpen] = useState(false);

  // El botón "Marcar perdido" solo se ofrece para clientes en el embudo
  // comercial — no tiene sentido para WON (ya compraron) ni LOST (ya están
  // perdidos). Si el cliente vuelve a comprar, el lifecycle se mueve a WON
  // automáticamente y el botón reaparece si vuelve a QUOTED.
  const canMarkLost =
    !!customer &&
    (customer.lifecycleStatus === 'QUOTED' ||
      customer.lifecycleStatus === 'FOLLOW_UP' ||
      customer.lifecycleStatus === 'NEW');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customer?.name ?? '',
      taxId: customer?.taxId ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      addressStreet: customer?.addressStreet ?? '',
      addressNumber: customer?.addressNumber ?? '',
      communeId: customer?.communeId ?? null,
      internalNotes: customer?.internalNotes ?? '',
      source: customer?.source ?? 'OTHER',
      whatsappPhone: customer?.whatsappPhone ?? '',
    },
  });

  const mut = useMutation({
    mutationFn: (input: CustomerInput) =>
      customer ? updateCustomer(customer.id, input) : createCustomer(input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(customer ? 'Cliente actualizado' : 'Cliente creado');
      router.push(`/clientes/${saved.id}`);
      router.refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  const removeMut = useMutation({
    mutationFn: () =>
      customer ? deleteCustomer(customer.id) : Promise.reject('no customer'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Cliente eliminado');
      router.push('/clientes');
      router.refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function onSubmit(values: FormValues) {
    if (mut.isPending) return;
    const input: CustomerInput = {
      name: values.name.trim(),
      // Ronda 9 — RUT opcional. Normalizamos sólo si vino con contenido.
      taxId: values.taxId?.trim() ? normalizeRut(values.taxId) : null,
      email: values.email?.trim() || null,
      phone: values.phone?.trim() ? normalizePhone(values.phone) : null,
      addressStreet: values.addressStreet?.trim() || null,
      addressNumber: values.addressNumber?.trim() || null,
      communeId: values.communeId || null,
      internalNotes: values.internalNotes?.trim() || null,
      source: values.source,
      whatsappPhone: values.whatsappPhone?.trim()
        ? normalizePhone(values.whatsappPhone)
        : null,
    };
    mut.mutate(input);
  }

  const errors = form.formState.errors;
  const submitting = mut.isPending || form.formState.isSubmitting;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">
            {customer ? 'Editar cliente' : 'Nuevo cliente'}
          </h1>
          {customer && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LifecycleBadge status={customer.lifecycleStatus} />
              {customer.lastContactAt && (
                <span>
                  Último contacto:{' '}
                  {new Date(customer.lastContactAt).toLocaleDateString('es-CL', {
                    dateStyle: 'medium',
                  })}
                </span>
              )}
              {customer.lifecycleStatus === 'LOST' && customer.lostReason && (
                <span>
                  · Motivo:{' '}
                  <em className="text-foreground">{customer.lostReason}</em>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {canMarkLost && (
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setMarkLostOpen(true)}
              disabled={submitting}
            >
              <X className="h-4 w-4" />
              Marcar perdido
            </Button>
          )}
          {customer && (
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDelete(true)}
              disabled={submitting || removeMut.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : customer ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-md border bg-card p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nombre o razón social" error={errors.name?.message}>
            <Input
              {...form.register('name')}
              autoFocus
              placeholder="ej: Juan Pérez / Distribuidora ABC"
            />
          </Field>
          <Field
            label="RUT (opcional)"
            error={errors.taxId?.message}
            hint="Requerido para emitir notas de venta. Podés crear el cliente sin RUT y completarlo después."
          >
            <Input
              {...form.register('taxId')}
              placeholder="12.345.678-9"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) return;
                form.setValue('taxId', normalizeRut(v), {
                  shouldValidate: true,
                });
              }}
            />
          </Field>
          <Field label="Correo (opcional)" error={errors.email?.message}>
            <Input
              type="email"
              {...form.register('email')}
              placeholder="cliente@correo.cl"
            />
          </Field>
          <Field label="Teléfono (opcional)" error={errors.phone?.message}>
            <Input
              {...form.register('phone')}
              placeholder="+56 9 1234 5678"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) return;
                if (isValidPhone(v)) {
                  form.setValue('phone', normalizePhone(v), {
                    shouldValidate: true,
                  });
                }
              }}
            />
          </Field>
          <Field
            label="WhatsApp (opcional)"
            error={errors.whatsappPhone?.message}
          >
            <Input
              {...form.register('whatsappPhone')}
              placeholder="+56 9 1234 5678"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) return;
                if (isValidPhone(v)) {
                  form.setValue('whatsappPhone', normalizePhone(v), {
                    shouldValidate: true,
                  });
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Si el WhatsApp es distinto al teléfono general. Lo usa la
              bandeja de seguimiento para construir los enlaces wa.me.
            </p>
          </Field>
          <Field label="Canal de origen">
            <Controller
              control={form.control}
              name="source"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Dirección (opcional)</Label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-5">
              <Input
                {...form.register('addressStreet')}
                placeholder="Calle"
              />
            </div>
            <div className="md:col-span-2">
              <Input
                {...form.register('addressNumber')}
                placeholder="Número"
              />
            </div>
            <div className="md:col-span-5">
              <Controller
                control={form.control}
                name="communeId"
                render={({ field }) => (
                  <CommuneSelect
                    value={field.value ?? null}
                    onChange={(id) => field.onChange(id)}
                    initialCommune={customer?.commune ?? null}
                  />
                )}
              />
            </div>
          </div>
        </div>

        <Field label="Notas internas">
          <textarea
            {...form.register('internalNotes')}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Texto libre solo visible para el equipo (no se imprime en cotizaciones ni ventas)."
          />
        </Field>
      </div>

      <MarkLostDialog
        customer={
          customer ? { id: customer.id, name: customer.name } : null
        }
        open={markLostOpen}
        onOpenChange={setMarkLostOpen}
        invalidateKeys={[['customers'], ['customer'], ['follow-ups']]}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar cliente?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción es permanente. El cliente &ldquo;{customer?.name}&rdquo; se eliminará.
            Si tiene cotizaciones o ventas asociadas (cuando esos módulos existan), no podrá
            eliminarse.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={removeMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => removeMut.mutate()}
              disabled={removeMut.isPending}
            >
              {removeMut.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
