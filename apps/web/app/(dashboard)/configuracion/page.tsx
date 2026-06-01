'use client';

/* ============================================================================
 *  ConfiguracionPage — REESTILIZADO con el sistema visual del rediseño
 *  (Inventario / Caja / Gastos). Solo UI/UX.
 *
 *  TODA LA LÓGICA SE CONSERVA 1:1 del original:
 *   · schema/zod + react-hook-form (taxRatePct, comisiones, leadTime).
 *   · pctToRate / rateToPct, getCompanySettings / updateCompanySettings.
 *   · SeguimientoHubspotSection: followUp + HubSpot + testHubspotSync.
 *   · Tabs Comercial / Seguimiento / Categorías (ahora pills locales).
 * ========================================================================== */

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Percent, Tags, Workflow, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiErrorMessage } from '@/lib/catalog-api';
import { getCompanySettings, updateCompanySettings } from '@/lib/cashbox-api';
import { testHubspotSync } from '@/lib/lifecycle-api';
import { cn } from '@/lib/utils';
import type { HubspotTestResultDto } from '@inventory/shared';

const LABEL = 'block text-[10px] font-extrabold uppercase tracking-wider text-slate-400';
const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900 dark:text-white';
const HINT = 'text-[11px] font-medium leading-relaxed text-slate-400';
const ERR = 'text-[11px] font-bold text-rose-500';
const PRIMARY_BTN =
  'inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BTN =
  'inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900';

// Tasas se editan como porcentaje "humano" (19) y se guardan como decimal (0.1900).
const schema = z.object({
  taxRatePct: z.coerce.number().min(0).max(100),
  cardDebitCommissionRatePct: z.coerce.number().min(0).max(100),
  cardCreditCommissionRatePct: z.coerce.number().min(0).max(100),
  paymentLinkCommissionRatePct: z.coerce.number().min(0).max(100),
  // Días de lead time default usados por la proyección de stock (Fase 8).
  defaultLeadTimeDays: z.coerce.number().int().min(1).max(365),
});
type FormValues = z.infer<typeof schema>;

function pctToRate(pct: number): string {
  return (pct / 100).toFixed(4);
}
function rateToPct(rate: string): number {
  return Number((Number(rate) * 100).toFixed(4));
}

type Tab = 'comercial' | 'seguimiento' | 'categorias';

export default function ConfiguracionPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('comercial');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      taxRatePct: 19,
      cardDebitCommissionRatePct: 1.5,
      cardCreditCommissionRatePct: 2.5,
      paymentLinkCommissionRatePct: 3.5,
      defaultLeadTimeDays: 75,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        taxRatePct: rateToPct(settings.taxRate),
        cardDebitCommissionRatePct: rateToPct(settings.cardDebitCommissionRate),
        cardCreditCommissionRatePct: rateToPct(settings.cardCreditCommissionRate),
        paymentLinkCommissionRatePct: rateToPct(settings.paymentLinkCommissionRate),
        defaultLeadTimeDays: settings.defaultLeadTimeDays,
      });
    }
  }, [settings, form]);

  const mut = useMutation({
    mutationFn: (values: FormValues) =>
      updateCompanySettings({
        taxRate: pctToRate(values.taxRatePct),
        cardDebitCommissionRate: pctToRate(values.cardDebitCommissionRatePct),
        cardCreditCommissionRate: pctToRate(values.cardCreditCommissionRatePct),
        paymentLinkCommissionRate: pctToRate(values.paymentLinkCommissionRatePct),
        defaultLeadTimeDays: values.defaultLeadTimeDays,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'company'] });
      toast.success('Configuración actualizada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-slate-800 dark:text-slate-200">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Configuración
        </h1>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Parámetros comerciales, seguimiento de clientes y categorías de gasto.
        </p>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap items-center gap-2">
        <TabPill
          active={tab === 'comercial'}
          onClick={() => setTab('comercial')}
          icon={<Percent className="h-3.5 w-3.5" />}
        >
          Comercial
        </TabPill>
        <TabPill
          active={tab === 'seguimiento'}
          onClick={() => setTab('seguimiento')}
          icon={<Workflow className="h-3.5 w-3.5" />}
        >
          Seguimiento y HubSpot
        </TabPill>
        <TabPill
          active={tab === 'categorias'}
          onClick={() => setTab('categorias')}
          icon={<Tags className="h-3.5 w-3.5" />}
        >
          Categorías de gasto
        </TabPill>
      </div>

      {/* COMERCIAL */}
      {tab === 'comercial' && (
        <form
          onSubmit={form.handleSubmit((v) => mut.mutate(v))}
          className="max-w-2xl space-y-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]"
        >
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              Impuestos y comisiones
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              Tasas aplicadas automáticamente a ventas, compras y caja.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="taxRatePct" className={LABEL}>
                  IVA (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="taxRatePct"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    {...form.register('taxRatePct')}
                    className={cn(INPUT, 'max-w-[160px] font-mono')}
                  />
                  <span className="text-xs font-bold text-slate-400">%</span>
                </div>
                <p className={HINT}>
                  Aplicado a ventas y compras. Default Chile: 19.
                </p>
                {form.formState.errors.taxRatePct?.message && (
                  <p className={ERR}>{form.formState.errors.taxRatePct.message}</p>
                )}
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div>
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">
                    Comisiones por método de pago
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-slate-400">
                    Al confirmar una venta con uno de estos métodos, el sistema
                    descuenta automáticamente la comisión como egreso de caja.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <CommissionField
                    id="cardDebitCommissionRatePct"
                    label="Débito (%)"
                    register={form.register('cardDebitCommissionRatePct')}
                    error={form.formState.errors.cardDebitCommissionRatePct?.message}
                  />
                  <CommissionField
                    id="cardCreditCommissionRatePct"
                    label="Crédito (%)"
                    register={form.register('cardCreditCommissionRatePct')}
                    error={form.formState.errors.cardCreditCommissionRatePct?.message}
                  />
                  <CommissionField
                    id="paymentLinkCommissionRatePct"
                    label="Link de pago (%)"
                    register={form.register('paymentLinkCommissionRatePct')}
                    error={
                      form.formState.errors.paymentLinkCommissionRatePct?.message
                    }
                  />
                </div>
                <p className="text-[11px] font-medium text-slate-400">
                  Defaults Chile: Débito 1.5% · Crédito 2.5% · Link 3.5%. Efectivo
                  y transferencia no tienen comisión.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="defaultLeadTimeDays" className={LABEL}>
                  Lead time default (días)
                </label>
                <input
                  id="defaultLeadTimeDays"
                  type="number"
                  step="1"
                  min={1}
                  max={365}
                  {...form.register('defaultLeadTimeDays')}
                  className={cn(INPUT, 'max-w-[160px] font-mono')}
                />
                <p className={HINT}>
                  Días de cobertura por debajo de los cuales un producto se marca
                  como crítico en la proyección. Default 75. Coincide con el lead
                  time de importación de 2-3 meses.
                </p>
                {form.formState.errors.defaultLeadTimeDays?.message && (
                  <p className={ERR}>
                    {form.formState.errors.defaultLeadTimeDays.message}
                  </p>
                )}
              </div>

              <div className="pt-1">
                <button type="submit" disabled={mut.isPending} className={PRIMARY_BTN}>
                  {mut.isPending ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* SEGUIMIENTO */}
      {tab === 'seguimiento' && <SeguimientoHubspotSection />}

      {/* CATEGORÍAS */}
      {tab === 'categorias' && (
        <Link
          href="/configuracion/categorias-gasto"
          className="group flex max-w-2xl items-center gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-colors hover:bg-slate-50/60 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-900/40"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2F6BFF]/10 text-[#2F6BFF] dark:bg-[#2F6BFF]/15">
            <Tags className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Editar categorías de gasto
            </h3>
            <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-400">
              Definí las categorías disponibles al registrar un gasto manual
              (/gastos). Las categorías marcadas como sistema no se pueden borrar.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#2F6BFF]" />
        </Link>
      )}
    </div>
  );
}

/* ============================================================
   TAB PILL
   ============================================================ */
function TabPill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-[11.5px] font-bold transition-all',
        active
          ? 'bg-[#2F6BFF] text-white shadow-md'
          : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ============================================================
   COMMISSION FIELD
   ============================================================ */
function CommissionField({
  id,
  label,
  register,
  error,
}: {
  id: string;
  label: string;
  register: ReturnType<ReturnType<typeof useForm<FormValues>>['register']>;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          step="0.01"
          min={0}
          max={100}
          {...register}
          className={cn(INPUT, 'font-mono')}
        />
        <span className="text-xs font-bold text-slate-400">%</span>
      </div>
      {error && <p className={ERR}>{error}</p>}
    </div>
  );
}

// ---------- Seguimiento y HubSpot (Fase 8.5) ----------

const followUpSchema = z.object({
  followUpHoursDefault: z.coerce.number().int().min(1).max(720),
  hubspotEnabled: z.boolean(),
  hubspotDefaultOwnerId: z.string().max(64).or(z.literal('')),
  whatsappFollowUpTemplate: z.string().max(2000).or(z.literal('')),
});
type FollowUpValues = z.infer<typeof followUpSchema>;

function SeguimientoHubspotSection() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
  });

  const form = useForm<FollowUpValues>({
    resolver: zodResolver(followUpSchema),
    defaultValues: {
      followUpHoursDefault: 48,
      hubspotEnabled: false,
      hubspotDefaultOwnerId: '',
      whatsappFollowUpTemplate: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        followUpHoursDefault: settings.followUpHoursDefault,
        hubspotEnabled: settings.hubspotEnabled,
        hubspotDefaultOwnerId: settings.hubspotDefaultOwnerId ?? '',
        whatsappFollowUpTemplate: settings.whatsappFollowUpTemplate ?? '',
      });
    }
  }, [settings, form]);

  const mut = useMutation({
    mutationFn: (values: FollowUpValues) =>
      updateCompanySettings({
        followUpHoursDefault: values.followUpHoursDefault,
        hubspotEnabled: values.hubspotEnabled,
        hubspotDefaultOwnerId: values.hubspotDefaultOwnerId.trim() || null,
        whatsappFollowUpTemplate: values.whatsappFollowUpTemplate.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'company'] });
      toast.success('Configuración de seguimiento actualizada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  const [testResult, setTestResult] = useState<HubspotTestResultDto | null>(null);
  const testMut = useMutation({
    mutationFn: () => testHubspotSync(),
    onSuccess: (r) => {
      setTestResult(r);
      if (r.ok) toast.success('Test sync OK');
      else toast.error(r.message);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo testear')),
  });

  const enabled = form.watch('hubspotEnabled');

  return (
    <form
      onSubmit={form.handleSubmit((v) => mut.mutate(v))}
      className="max-w-2xl space-y-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]"
    >
      <div>
        <h2 className="text-sm font-black text-slate-900 dark:text-white">
          Seguimiento y HubSpot
        </h2>
        <p className="mt-0.5 text-xs font-medium text-slate-400">
          Configurá el lifecycle automático del cliente y la integración con
          HubSpot (Fase 8.5).
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="followUpHoursDefault" className={LABEL}>
              Horas para marcar follow-up
            </label>
            <input
              id="followUpHoursDefault"
              type="number"
              min={1}
              max={720}
              {...form.register('followUpHoursDefault')}
              className={cn(INPUT, 'max-w-[160px] font-mono')}
            />
            <p className={HINT}>
              Si pasan estas horas sin nuevo contacto, el cliente se mueve
              automáticamente a la bandeja de "Vencidos" en el próximo cron diario
              (00:30 hora Chile). Default 48.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="whatsappFollowUpTemplate" className={LABEL}>
              Plantilla de mensaje WhatsApp
            </label>
            <textarea
              id="whatsappFollowUpTemplate"
              rows={4}
              {...form.register('whatsappFollowUpTemplate')}
              placeholder="Hola {cliente}, te paso la cotización {cotizacion} por {total}. Link: {link}"
              className={cn(INPUT, 'resize-y leading-relaxed')}
            />
            <p className={HINT}>
              Tokens disponibles:{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                {'{cliente}'}
              </code>{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                {'{cotizacion}'}
              </code>{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                {'{total}'}
              </code>{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                {'{link}'}
              </code>
              .
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/30">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                {...form.register('hubspotEnabled')}
                className="h-4 w-4 rounded border-slate-300 accent-[#2F6BFF] dark:border-slate-700"
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Activar sincronización con HubSpot
              </span>
            </label>
            <p className="text-[11px] font-medium leading-relaxed text-slate-400">
              Off por default. Cuando se prende, los cambios de lifecycle del
              cliente se empujan a HubSpot vía outbox interno. Requiere{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                HUBSPOT_API_KEY
              </code>{' '}
              en las variables de entorno del server.
            </p>

            {enabled && (
              <div className="space-y-4 border-t border-slate-200/70 pt-4 dark:border-slate-800">
                <div className="space-y-1.5">
                  <label htmlFor="hubspotDefaultOwnerId" className={LABEL}>
                    Owner ID por defecto en HubSpot
                  </label>
                  <input
                    id="hubspotDefaultOwnerId"
                    {...form.register('hubspotDefaultOwnerId')}
                    placeholder="ej: 12345678"
                    className={cn(INPUT, 'max-w-md')}
                  />
                  <p className={HINT}>
                    Owner al que se asignan los contactos creados. Opcional.
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => testMut.mutate()}
                    disabled={testMut.isPending}
                    className={SECONDARY_BTN}
                  >
                    {testMut.isPending ? 'Testeando…' : 'Test sync'}
                  </button>
                  {testResult && (
                    <div
                      className={cn(
                        'flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold',
                        testResult.ok
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300'
                          : 'border-rose-500/30 bg-rose-500/5 text-rose-500',
                      )}
                    >
                      {testResult.ok ? (
                        <Check className="h-4 w-4 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 shrink-0" />
                      )}
                      <p>{testResult.message}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-1">
            <button type="submit" disabled={mut.isPending} className={PRIMARY_BTN}>
              {mut.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
