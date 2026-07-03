'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CommuneSelect } from '@/components/commune-select';
import { CustomerCombobox } from '@/components/customer-combobox';
import { ProductPicker } from '@/components/product-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/catalog-api';
import {
  createIndependentDispatchNote,
  listRecentCarriers,
} from '@/lib/dispatch-api';
import { todayIso } from '@/lib/format';
import { getAvailableStock, type AvailableStockRow } from '@/lib/sales-api';
import { listWarehouses } from '@/lib/warehouses-api';
import type { CustomerDto, WarehouseDto } from '@inventory/shared';

const CARD =
  'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const LABEL =
  'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';

interface ItemRow {
  productId: string;
  sku: string | null;
  name: string;
  qty: number;
}

/**
 * /guias/nueva — Crear una guía de despacho INDEPENDIENTE (sin venta previa).
 * Lleva su propio cliente y sus propios items (producto + cantidad, sin
 * precios). Desde el detalle de la guía se puede después "Convertir a venta".
 * El stock NO se mueve acá; baja al convertir.
 */
export default function NuevaGuiaPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [dispatchedAt, setDispatchedAt] = useState<string>(todayIso());
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [communeId, setCommuneId] = useState<string | null>(null);
  const [addressNotes, setAddressNotes] = useState('');
  const [notes, setNotes] = useState('');

  // Al elegir cliente, pre-llenamos la dirección con la suya (solo si los
  // campos siguen vacíos — no pisamos lo que el operador ya tipeó).
  useEffect(() => {
    if (!customer) return;
    setAddressStreet((prev) => prev || customer.addressStreet || '');
    setAddressNumber((prev) => prev || customer.addressNumber || '');
    setCommuneId((prev) => prev || customer.communeId || null);
  }, [customer]);

  const carriers = useQuery({
    queryKey: ['dispatch-recent-carriers'],
    queryFn: () => listRecentCarriers(),
  });

  // Bodega desde la que se descuenta el stock. Default = 'Tienda' si existe,
  // sino la primera activa (mismo criterio que la venta).
  const warehouses = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ active: 'true' }),
  });
  const activeWarehouses = (
    Array.isArray(warehouses.data) ? warehouses.data : warehouses.data?.items ?? []
  ) as WarehouseDto[];
  useEffect(() => {
    if (warehouseId || activeWarehouses.length === 0) return;
    const preferred = activeWarehouses.find((w) => w.name === 'Tienda');
    setWarehouseId((preferred ?? activeWarehouses[0]!).id);
  }, [warehouseId, activeWarehouses]);

  // Stock disponible en la bodega elegida para los productos cargados.
  const productIds = items.map((it) => it.productId);
  const stockQuery = useQuery({
    queryKey: ['dispatch-available-stock', warehouseId, productIds.join(',')],
    queryFn: () => getAvailableStock(productIds, warehouseId),
    enabled: !!warehouseId && productIds.length > 0,
  });
  const stockMap = new Map<string, number>();
  for (const row of stockQuery.data ?? ([] as AvailableStockRow[])) {
    stockMap.set(row.productId, row.quantity);
  }
  const shortages = items.filter((it) => {
    const available = stockMap.get(it.productId);
    return available != null && it.qty > available;
  });

  const mut = useMutation({
    mutationFn: () =>
      createIndependentDispatchNote({
        customerId: customer!.id,
        warehouseId,
        items: items.map((it) => ({ productId: it.productId, qty: it.qty })),
        dispatchedAt: dispatchedAt || undefined,
        carrier: carrier.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        addressStreet: addressStreet.trim() || null,
        addressNumber: addressNumber.trim() || null,
        communeId: communeId ?? null,
        addressNotes: addressNotes.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ['dispatch-notes'] });
      qc.invalidateQueries({ queryKey: ['dispatch-recent-carriers'] });
      toast.success(`Guía ${note.number} creada`);
      router.push(`/guias/${note.id}`);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo crear la guía')),
  });

  const canSubmit =
    !!customer &&
    !!warehouseId &&
    items.length > 0 &&
    shortages.length === 0 &&
    !mut.isPending;

  function updateQty(idx: number, qty: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, qty: Math.max(1, qty) } : it)),
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex items-start gap-4">
        <Link
          href="/guias"
          title="Volver"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Nueva guía de despacho
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Guía independiente (sin venta previa). Podés convertirla en venta
            más tarde desde su detalle. El stock se descuenta al convertir.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!customer) {
            toast.error('Elegí un cliente');
            return;
          }
          if (items.length === 0) {
            toast.error('Agregá al menos un producto');
            return;
          }
          if (!warehouseId) {
            toast.error('Elegí la bodega');
            return;
          }
          if (shortages.length > 0) {
            toast.error('Hay productos que exceden el stock disponible');
            return;
          }
          mut.mutate();
        }}
        className="space-y-5"
      >
        {/* CLIENTE + FECHA */}
        <div className={`space-y-4 ${CARD}`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label className={LABEL}>Cliente</Label>
              <CustomerCombobox
                value={customer?.id ?? null}
                onChange={setCustomer}
                initialCustomer={customer}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dispatchedAt" className={LABEL}>
                Fecha de despacho
              </Label>
              <Input
                id="dispatchedAt"
                type="date"
                value={dispatchedAt}
                onChange={(e) => setDispatchedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className={LABEL}>Bodega (de dónde sale el stock)</Label>
            <Select
              value={warehouseId}
              onValueChange={setWarehouseId}
              disabled={activeWarehouses.length === 0}
            >
              <SelectTrigger className="md:max-w-xs">
                <SelectValue placeholder="Seleccioná bodega" />
              </SelectTrigger>
              <SelectContent>
                {activeWarehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              El stock se descuenta de esta bodega al crear la guía. La venta que
              la convierta quedará fijada a esta misma bodega.
            </p>
          </div>
        </div>

        {/* ITEMS */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-850">
            <h2 className={LABEL}>Productos a despachar</h2>
            <ProductPicker
              buttonLabel="Agregar producto"
              onPick={(p) => {
                if (items.some((i) => i.productId === p.id)) {
                  toast.info('El producto ya está en la lista');
                  return;
                }
                setItems((prev) => [
                  ...prev,
                  { productId: p.id, sku: p.sku, name: p.name, qty: 1 },
                ]);
              }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/30 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
                  <th className="w-[20%] py-3 pl-6">SKU</th>
                  <th className="py-3">Producto</th>
                  <th className="w-[120px] py-3 text-right">Cantidad</th>
                  <th className="w-[60px] py-3 pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-850">
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-10 text-center font-bold text-slate-400"
                    >
                      Agregá al menos un producto.
                    </td>
                  </tr>
                )}
                {items.map((it, idx) => {
                  const available = stockMap.get(it.productId);
                  const exceeds = available != null && it.qty > available;
                  return (
                  <tr key={it.productId} className={exceeds ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''}>
                    <td className="py-3 pl-6 font-mono text-slate-500 dark:text-slate-400">
                      {it.sku ?? '—'}
                    </td>
                    <td className="max-w-[280px] truncate py-3 font-bold text-slate-950 dark:text-white">
                      {it.name}
                    </td>
                    <td className="py-3 text-right">
                      <Input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) =>
                          updateQty(idx, Number(e.target.value) || 1)
                        }
                        className={`ml-auto w-24 text-right ${exceeds ? 'border-rose-400' : ''}`}
                      />
                      {available != null && (
                        <div
                          className={`mt-1 text-[11px] tabular-nums ${
                            exceeds ? 'font-bold text-rose-500' : 'text-slate-400'
                          }`}
                        >
                          Stock: {available}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-6 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                        title="Quitar producto"
                        className="cursor-pointer p-1.5 text-slate-400 transition-colors hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* DIRECCIÓN DE ENTREGA */}
        <div className={`space-y-4 ${CARD}`}>
          <div>
            <h2 className={LABEL}>Dirección de entrega</h2>
            <p className="mt-1 text-xs text-slate-400">
              Se pre-llena con la del cliente. Editala si el envío es a otra
              dirección.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="addressStreet">Calle</Label>
              <Input
                id="addressStreet"
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                placeholder="Av. Providencia"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressNumber">Número</Label>
              <Input
                id="addressNumber"
                value={addressNumber}
                onChange={(e) => setAddressNumber(e.target.value)}
                placeholder="1234"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Comuna</Label>
            <CommuneSelect value={communeId} onChange={setCommuneId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressNotes">
              Referencias / indicaciones (opcional)
            </Label>
            <Input
              id="addressNotes"
              value={addressNotes}
              onChange={(e) => setAddressNotes(e.target.value)}
              placeholder="Depto 304, edificio azul, llamar al timbre"
              maxLength={255}
            />
          </div>
        </div>

        {/* TRANSPORTE */}
        <div className={`space-y-4 ${CARD}`}>
          <h2 className={LABEL}>Transporte</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="carrier">Transportista</Label>
              <Input
                id="carrier"
                list="recent-carriers"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="ej: Chilexpress, Starken, propio"
                maxLength={120}
              />
              <datalist id="recent-carriers">
                {(carriers.data ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trackingNumber">
                N° de seguimiento (opcional)
              </Label>
              <Input
                id="trackingNumber"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="ej: 1234567890"
                maxLength={120}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observaciones (opcional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instrucciones especiales del despacho"
            />
          </div>
        </div>

        {shortages.length > 0 && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-3 text-xs font-semibold text-rose-500 dark:border-rose-950/30 dark:bg-rose-950/10 dark:text-rose-400">
            Hay productos que exceden el stock disponible en la bodega elegida.
            Ajustá las cantidades, cambiá de bodega o quitá esas líneas antes de
            crear la guía.
          </div>
        )}

        {/* ACCIONES */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-850">
          <Link
            href="/guias"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Truck className="h-4 w-4" />
            {mut.isPending ? 'Creando…' : 'Crear guía'}
          </button>
        </div>
      </form>
    </div>
  );
}
