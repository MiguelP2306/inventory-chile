'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CommuneSelect } from '@/components/commune-select';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { MarkLostDialog } from '@/components/mark-lost-dialog';
import { apiErrorMessage } from '@/lib/catalog-api';
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

/* Tokens de estilo del rediseño (look compras/nuevo). */
const CARD =
  'rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const LABEL =
  'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';
const INPUT =
  'w-full rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-semibold text-slate-850 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white';
const SELECT = `${INPUT} appearance-none pr-10`;
const BTN_OUTLINE =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900';
const BTN_DANGER =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-3 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400';
const BTN_PRIMARY =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

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
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white md:text-2xl">
            {customer ? 'Editar cliente' : 'Nuevo cliente'}
          </h1>
          {customer && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
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
                  <em className="text-slate-700 dark:text-slate-200">
                    {customer.lostReason}
                  </em>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canMarkLost && (
            <button
              type="button"
              className={BTN_DANGER}
              onClick={() => setMarkLostOpen(true)}
              disabled={submitting}
            >
              <X className="h-4 w-4" />
              Marcar perdido
            </button>
          )}
          {customer && (
            <button
              type="button"
              className={BTN_DANGER}
              onClick={() => setConfirmDelete(true)}
              disabled={submitting || removeMut.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          )}
          <button
            type="button"
            className={BTN_OUTLINE}
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={submitting}>
            {submitting ? 'Guardando…' : customer ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>

      {/* ============================================================
          CARD: datos
          ============================================================ */}
      <div className={`space-y-6 ${CARD}`}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Nombre o razón social" error={errors.name?.message}>
            <input
              {...form.register('name')}
              autoFocus
              placeholder="ej: Juan Pérez / Distribuidora ABC"
              className={INPUT}
            />
          </Field>
          <Field
            label="RUT (opcional)"
            error={errors.taxId?.message}
            hint="Requerido para emitir notas de venta. Podés crear el cliente sin RUT y completarlo después."
          >
            <input
              {...form.register('taxId')}
              placeholder="12.345.678-9"
              className={INPUT}
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
            <input
              type="email"
              {...form.register('email')}
              placeholder="cliente@correo.cl"
              className={INPUT}
            />
          </Field>
          <Field label="Teléfono (opcional)" error={errors.phone?.message}>
            <input
              {...form.register('phone')}
              placeholder="+56 9 1234 5678"
              className={INPUT}
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
          <Field label="WhatsApp (opcional)" error={errors.whatsappPhone?.message}>
            <input
              {...form.register('whatsappPhone')}
              placeholder="+56 9 1234 5678"
              className={INPUT}
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
            <p className="text-[11px] text-slate-400">
              Si el WhatsApp es distinto al teléfono general. Lo usa la bandeja de
              seguimiento para construir los enlaces wa.me.
            </p>
          </Field>
          <Field label="Canal de origen">
            <Controller
              control={form.control}
              name="source"
              render={({ field }) => (
                <div className="relative">
                  <select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className={SELECT}
                  >
                    {CUSTOMER_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              )}
            />
          </Field>
        </div>

        {/* Dirección */}
        <div className="space-y-1.5">
          <span className={LABEL}>Dirección (opcional)</span>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-5">
              <input
                {...form.register('addressStreet')}
                placeholder="Calle"
                className={INPUT}
              />
            </div>
            <div className="md:col-span-2">
              <input
                {...form.register('addressNumber')}
                placeholder="Número"
                className={INPUT}
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

        {/* Notas */}
        <Field label="Notas internas">
          <textarea
            {...form.register('internalNotes')}
            rows={3}
            className="w-full rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white"
            placeholder="Texto libre solo visible para el equipo (no se imprime en cotizaciones ni ventas)."
          />
        </Field>
      </div>

      <MarkLostDialog
        customer={customer ? { id: customer.id, name: customer.name } : null}
        open={markLostOpen}
        onOpenChange={setMarkLostOpen}
        invalidateKeys={[['customers'], ['customer'], ['follow-ups']]}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar cliente?"
        description={
          <>
            Esta acción es permanente. El cliente{' '}
            <strong>{customer?.name}</strong> se eliminará. Si tiene cotizaciones
            o ventas asociadas, no podrá eliminarse.
          </>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          await removeMut.mutateAsync();
        }}
      />
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
    <div className="space-y-1.5">
      <span className={LABEL}>{label}</span>
      {children}
      {hint && !error && <p className="text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="text-[11px] font-bold text-rose-500">{error}</p>}
    </div>
  );
}
