'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PurchaseSearchCombobox } from '@/components/purchase-search-combobox';
import { SaleSearchCombobox } from '@/components/sale-search-combobox';
import { SoftModal } from '@/components/ui/soft-modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type QuickOpAction = 'return' | 'warranty' | 'dispatch';

interface Props {
  action: QuickOpAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COPY: Record<QuickOpAction, { title: string; description: string }> = {
  return: {
    title: 'Nueva devolución',
    description:
      'Elegí la venta o compra sobre la que querés registrar la devolución. Vas a poder marcar items y modo de reembolso en el siguiente paso.',
  },
  warranty: {
    title: 'Nueva garantía',
    description:
      'Elegí la venta sobre la que querés abrir el reclamo de garantía. Podés cubrir uno o varios items en una sola operación.',
  },
  dispatch: {
    title: 'Nueva guía de despacho',
    description:
      'Elegí la venta para la que querés generar la guía de despacho. Vas a poder cargar dirección y transportista en el siguiente paso.',
  },
};

const QUERY_PARAM: Record<QuickOpAction, string> = {
  return: 'return',
  warranty: 'warranty',
  dispatch: 'dispatch',
};

const PILL_TRIGGER =
  'rounded-xl px-4 py-2 text-[11.5px] font-bold text-slate-500 transition-all data-[state=active]:bg-[#2F6BFF] data-[state=active]:font-black data-[state=active]:text-white data-[state=active]:shadow-md dark:text-slate-400';

/**
 * Dialog reusable para crear devoluciones / garantías / guías sin entrar al
 * detalle primero. `action='return'` ofrece 2 tabs (Cliente desde venta /
 * Proveedor desde compra). Los comboboxes muestran una lista paginada (4 por
 * página) por defecto.
 *
 * Solo UI (look SoftModal de la web). La navegación al detalle con el query
 * param de la op es idéntica.
 */
export function QuickOpFromSaleDialog({ action, open, onOpenChange }: Props) {
  const router = useRouter();
  const copy = COPY[action];
  const param = QUERY_PARAM[action];
  const supportsSupplier = action === 'return';
  const [tab, setTab] = useState<'sale' | 'purchase'>('sale');

  return (
    <SoftModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      subtitle={copy.description}
      size="xl"
    >
      <div className="space-y-4 p-5">
        {supportsSupplier ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'sale' | 'purchase')}>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <TabsTrigger value="sale" className={PILL_TRIGGER}>
                Cliente (desde venta)
              </TabsTrigger>
              <TabsTrigger value="purchase" className={PILL_TRIGGER}>
                Proveedor (desde compra)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sale" className="mt-4">
              <SaleSearchCombobox
                onPick={(s) => {
                  onOpenChange(false);
                  router.push(`/ventas/${s.id}?${param}=1`);
                }}
              />
            </TabsContent>
            <TabsContent value="purchase" className="mt-4">
              <PurchaseSearchCombobox
                onPick={(p) => {
                  onOpenChange(false);
                  // El detalle de la compra abre el SupplierReturnDialog
                  // automáticamente cuando ve `?return=1`.
                  router.push(`/compras/${p.id}?return=1`);
                }}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <SaleSearchCombobox
            onPick={(s) => {
              onOpenChange(false);
              router.push(`/ventas/${s.id}?${param}=1`);
            }}
          />
        )}
      </div>
    </SoftModal>
  );
}
