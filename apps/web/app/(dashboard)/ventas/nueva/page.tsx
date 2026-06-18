'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { SaleForm, type SaleBagItem } from '@/components/forms/sale-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createDispatchNote } from '@/lib/dispatch-api';
import { getQuotation } from '@/lib/quotations-api';
import {
  bagLineKey,
  clearProductBagItems,
  useProductBag,
} from '@/lib/use-product-bag';

/**
 * Pantalla "Nueva venta" navegada por URL.
 *
 * Casos de uso:
 *  - `/ventas/nueva` sin parámetros: form de venta vacío. (No es la entrada
 *    típica — la convención es abrir el modal SaleFormDialog desde /ventas).
 *  - `/ventas/nueva?fromQuotation=<id>`: pre-llena el form con los datos de la
 *    cotización. Al confirmar, el backend marca la cotización como CONVERTED
 *    en la misma transacción del create.
 */
export default function NuevaVentaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromQuotationId = searchParams.get('fromQuotation');
  const fromBag = searchParams.get('fromBag') === '1';
  // Ronda 9 — si llega `generateDispatch=1`, después de crear la venta se
  // dispara la creación automática de una guía con datos mínimos (sin
  // dirección custom — el operador puede editarla desde /guias/[id]).
  const generateDispatch = searchParams.get('generateDispatch') === '1';

  const bag = useProductBag();
  // `bagIds` (opcional) acota el prefill a los productos que el operador
  // seleccionó en el bolso; sin él se usan todos (compatibilidad).
  const bagIdsParam = searchParams.get('bagIds');
  const bagItems = useMemo(() => {
    if (!fromBag) return [];
    if (!bagIdsParam) return bag.items;
    const keys = new Set(bagIdsParam.split(',').map(decodeURIComponent));
    return bag.items.filter((it) => keys.has(bagLineKey(it)));
  }, [fromBag, bagIdsParam, bag.items]);
  const bagPrefill: SaleBagItem[] | undefined =
    bagItems.length > 0
      ? bagItems.map((it) => ({
          productId: it.productId,
          sku: it.sku,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          // Bodega elegida en el bolso → predefine la bodega de la venta si es
          // la misma para todos los items.
          warehouseId: it.warehouseId ?? null,
        }))
      : undefined;

  const dispatchMut = useMutation({
    mutationFn: (saleId: string) => createDispatchNote({ saleId }),
    onSuccess: (note) => {
      toast.success(`Guía ${note.number} generada`);
      router.push(`/guias/${note.id}`);
    },
    onError: () => {
      toast.error(
        'La venta se creó pero la guía no. Generá la guía desde el detalle.',
      );
    },
  });

  const quotation = useQuery({
    queryKey: ['quotation', fromQuotationId],
    queryFn: () => getQuotation(fromQuotationId!),
    enabled: !!fromQuotationId,
  });

  const prefill = useMemo(() => {
    if (!fromQuotationId || !quotation.data) return undefined;
    const q = quotation.data;
    // Si la cotización era libre (sin customerId), construimos el snapshot
    // para que SaleForm muestre el banner de "registrá al cliente". El
    // snapshot puede tener todos los campos en null si la cotización se emitió
    // sin datos — el FreeCustomerPrompt lo maneja.
    const customerSnapshot =
      !q.customerId &&
      (q.customerNameSnapshot ||
        q.customerTaxIdSnapshot ||
        q.customerEmailSnapshot ||
        q.customerPhoneSnapshot)
        ? {
            name: q.customerNameSnapshot,
            taxId: q.customerTaxIdSnapshot,
            email: q.customerEmailSnapshot,
            phone: q.customerPhoneSnapshot,
          }
        : null;
    return {
      quotationId: q.id,
      customer: q.customer ?? null,
      customerSnapshot,
      // Ronda 9 — los items temporales (productId null) no se pueden convertir
      // a venta. El backend ya valida con 409, pero los filtramos acá también
      // para no pasar entradas inválidas al SaleForm.
      items: (q.items ?? [])
        .filter((it): it is typeof it & { productId: string } => !!it.productId)
        .map((it) => ({
          productId: it.productId,
          sku: it.product?.sku ?? '',
          name: it.product?.name ?? '',
          qty: it.qty,
          unitPrice: it.unitPrice,
          discount: it.discount,
          discountPercent: it.discountPercent,
          observation: it.observation,
        })),
      notes: q.notes,
    };
  }, [fromQuotationId, quotation.data]);

  if (fromQuotationId && quotation.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href={fromQuotationId ? `/cotizaciones/${fromQuotationId}` : '/ventas'}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              {fromQuotationId && quotation.data
                ? `Nueva venta desde ${quotation.data.number}`
                : 'Nueva venta'}
            </h1>
            {fromQuotationId && quotation.data && (
              <p className="text-sm text-muted-foreground">
                Al confirmar, la cotización pasará a estado{' '}
                <strong>CONVERTIDA</strong> automáticamente.
              </p>
            )}
          </div>
        </div>
      </div>

      <SaleForm
        prefillFromQuotation={prefill}
        initialBagItems={bagPrefill}
        onSuccess={(sale) => {
          // Si la venta arrancó desde el bolso, quitamos del bolso SOLO los
          // productos que realmente quedaron en la venta creada. Así, si en el
          // formulario se quitó alguno, ese permanece en el bolso.
          if (fromBag) {
            // Limpiamos las LÍNEAS del bolso (producto+bodega) cuyo producto
            // quedó en la venta. Si un producto se quitó en el form, su línea
            // permanece en el bolso.
            const saleProductIds = new Set(
              (sale.items ?? [])
                .map((it) => it.productId)
                .filter((id): id is string => !!id),
            );
            const keys = bagItems
              .filter((it) => saleProductIds.has(it.productId))
              .map(bagLineKey);
            if (keys.length > 0) clearProductBagItems(keys);
          }
          // Ronda 9 — flujo "convertir y generar guía". Tras confirmar la
          // venta, generamos la guía con datos mínimos y redirigimos a su
          // detalle. Si falla la guía, el toast lo indica y queda la venta
          // creada (el operador puede generar la guía manualmente).
          if (generateDispatch) {
            dispatchMut.mutate(sale.id);
          } else {
            router.push(`/ventas/${sale.id}`);
          }
        }}
        onCancel={() =>
          router.push(
            fromQuotationId ? `/cotizaciones/${fromQuotationId}` : '/ventas',
          )
        }
      />
    </div>
  );
}
