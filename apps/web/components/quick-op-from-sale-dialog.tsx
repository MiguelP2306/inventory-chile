'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PurchaseSearchCombobox } from '@/components/purchase-search-combobox';
import { SaleSearchCombobox } from '@/components/sale-search-combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

/**
 * Ronda 9 — dialog reusable para crear devoluciones / garantías / guías
 * sin tener que entrar al detalle primero.
 *
 * Ronda 11 — `action='return'` ofrece 2 tabs (Cliente / Proveedor) para
 * cubrir tanto devoluciones desde ventas como desde compras. Las otras
 * acciones (warranty, dispatch) siguen siendo solo de ventas.
 */
export function QuickOpFromSaleDialog({ action, open, onOpenChange }: Props) {
  const router = useRouter();
  const copy = COPY[action];
  const param = QUERY_PARAM[action];
  const supportsSupplier = action === 'return';
  const [tab, setTab] = useState<'sale' | 'purchase'>('sale');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {supportsSupplier ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'sale' | 'purchase')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sale">Cliente (desde venta)</TabsTrigger>
              <TabsTrigger value="purchase">Proveedor (desde compra)</TabsTrigger>
            </TabsList>
            <TabsContent value="sale" className="mt-3">
              <SaleSearchCombobox
                onPick={(s) => {
                  onOpenChange(false);
                  router.push(`/ventas/${s.id}?${param}=1`);
                }}
              />
            </TabsContent>
            <TabsContent value="purchase" className="mt-3">
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
      </DialogContent>
    </Dialog>
  );
}
