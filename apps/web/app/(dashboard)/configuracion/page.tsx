'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorMessage,
} from '@/lib/catalog-api';
import {
  getCompanySettings,
  updateCompanySettings,
} from '@/lib/cashbox-api';
import { testHubspotSync } from '@/lib/lifecycle-api';
import type { HubspotTestResultDto } from '@inventory/shared';

// Tasas se editan como porcentaje "humano" (19) y se guardan como decimal (0.1900).
const schema = z.object({
  taxRatePct: z.coerce.number().min(0).max(100),
  cardCommissionRatePct: z.coerce.number().min(0).max(100),
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

export default function ConfiguracionPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      taxRatePct: 19,
      cardCommissionRatePct: 2.5,
      defaultLeadTimeDays: 75,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        taxRatePct: rateToPct(settings.taxRate),
        cardCommissionRatePct: rateToPct(settings.cardCommissionRate),
        defaultLeadTimeDays: settings.defaultLeadTimeDays,
      });
    }
  }, [settings, form]);

  const mut = useMutation({
    mutationFn: (values: FormValues) =>
      updateCompanySettings({
        taxRate: pctToRate(values.taxRatePct),
        cardCommissionRate: pctToRate(values.cardCommissionRatePct),
        defaultLeadTimeDays: values.defaultLeadTimeDays,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'company'] });
      toast.success('Configuración actualizada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configuración</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/configuracion/categorias-gasto"
          className="rounded-md border bg-card p-4 text-sm transition-colors hover:bg-accent"
        >
          <h3 className="font-medium">Categorías de gasto</h3>
          <p className="text-muted-foreground">
            Editar las categorías disponibles al registrar un gasto manual.
          </p>
        </Link>
      </div>

      <form
        onSubmit={form.handleSubmit((v) => mut.mutate(v))}
        className="rounded-md border bg-card p-6 space-y-4 max-w-xl"
      >
        <h2 className="font-medium">Impuestos y comisiones</h2>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="taxRatePct">IVA (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="taxRatePct"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...form.register('taxRatePct')}
                  className="max-w-[160px]"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Aplicado a ventas y compras. Default Chile: 19.
              </p>
              {form.formState.errors.taxRatePct?.message && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.taxRatePct.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cardCommissionRatePct">Comisión tarjeta (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="cardCommissionRatePct"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...form.register('cardCommissionRatePct')}
                  className="max-w-[160px]"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Se descuenta automáticamente como egreso de caja al confirmar
                una venta con tarjeta.
              </p>
              {form.formState.errors.cardCommissionRatePct?.message && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.cardCommissionRatePct.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultLeadTimeDays">
                Lead time default (días)
              </Label>
              <Input
                id="defaultLeadTimeDays"
                type="number"
                step="1"
                min={1}
                max={365}
                {...form.register('defaultLeadTimeDays')}
                className="max-w-[160px]"
              />
              <p className="text-xs text-muted-foreground">
                Días de cobertura por debajo de los cuales un producto se
                marca como crítico en la proyección. Default 75. Coincide
                con el lead time de importación de 2-3 meses.
              </p>
              {form.formState.errors.defaultLeadTimeDays?.message && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.defaultLeadTimeDays.message}
                </p>
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </>
        )}
      </form>

      <SeguimientoHubspotSection />
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
        hubspotDefaultOwnerId:
          values.hubspotDefaultOwnerId.trim() || null,
        whatsappFollowUpTemplate:
          values.whatsappFollowUpTemplate.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'company'] });
      toast.success('Configuración de seguimiento actualizada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  const [testResult, setTestResult] = useState<HubspotTestResultDto | null>(
    null,
  );
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
      className="rounded-md border bg-card p-6 space-y-4 max-w-xl"
    >
      <div>
        <h2 className="font-medium">Seguimiento y HubSpot</h2>
        <p className="text-xs text-muted-foreground">
          Configurá el lifecycle automático del cliente y la integración con
          HubSpot (Fase 8.5).
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="followUpHoursDefault">
              Horas para marcar follow-up
            </Label>
            <Input
              id="followUpHoursDefault"
              type="number"
              min={1}
              max={720}
              {...form.register('followUpHoursDefault')}
              className="max-w-[160px]"
            />
            <p className="text-xs text-muted-foreground">
              Si pasan estas horas sin nuevo contacto, el cliente se mueve
              automáticamente a la bandeja de "Vencidos" en el próximo cron
              diario (00:30 hora Chile). Default 48.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsappFollowUpTemplate">
              Plantilla de mensaje WhatsApp
            </Label>
            <Textarea
              id="whatsappFollowUpTemplate"
              rows={4}
              {...form.register('whatsappFollowUpTemplate')}
              placeholder="Hola {cliente}, te paso la cotización {cotizacion} por {total}. Link: {link}"
            />
            <p className="text-xs text-muted-foreground">
              Tokens disponibles:{' '}
              <code className="font-mono">{'{cliente}'}</code>,{' '}
              <code className="font-mono">{'{cotizacion}'}</code>,{' '}
              <code className="font-mono">{'{total}'}</code>,{' '}
              <code className="font-mono">{'{link}'}</code>.
            </p>
          </div>

          <div className="border-t pt-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...form.register('hubspotEnabled')}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">
                Activar sincronización con HubSpot
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              Off por default. Cuando se prende, los cambios de lifecycle
              del cliente se empujan a HubSpot vía outbox interno. Requiere
              <code className="font-mono"> HUBSPOT_API_KEY</code> en las
              variables de entorno del server.
            </p>
          </div>

          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="hubspotDefaultOwnerId">
                  Owner ID por defecto en HubSpot
                </Label>
                <Input
                  id="hubspotDefaultOwnerId"
                  {...form.register('hubspotDefaultOwnerId')}
                  placeholder="ej: 12345678"
                  className="max-w-md"
                />
                <p className="text-xs text-muted-foreground">
                  Owner al que se asignan los contactos creados. Opcional.
                </p>
              </div>

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => testMut.mutate()}
                  disabled={testMut.isPending}
                >
                  {testMut.isPending ? 'Testeando...' : 'Test sync'}
                </Button>
                {testResult && (
                  <div
                    className={[
                      'flex items-start gap-2 rounded-md border p-3 text-sm',
                      testResult.ok
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-destructive/30 bg-destructive/5',
                    ].join(' ')}
                  >
                    {testResult.ok ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <p
                      className={
                        testResult.ok
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-destructive'
                      }
                    >
                      {testResult.message}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pt-2">
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
