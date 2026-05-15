'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  apiErrorMessage,
} from '@/lib/catalog-api';
import {
  getCompanySettings,
  updateCompanySettings,
} from '@/lib/cashbox-api';

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
    </div>
  );
}
