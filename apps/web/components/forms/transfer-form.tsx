'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductPicker } from '@/components/product-picker';
import { apiErrorMessage } from '@/lib/catalog-api';
import { getAvailableStock, type AvailableStockRow } from '@/lib/sales-api';
import { createTransfer } from '@/lib/transfers-api';
import { cn } from '@/lib/utils';
import { listWarehouses } from '@/lib/warehouses-api';
import type {
  CreateTransferInput,
  TransferDto,
  WarehouseDto,
} from '@inventory/shared';

interface ItemRow {
  productId: string;
  // Ronda 9 — sku puede ser null (productos con SKU auto-generado).
  sku: string | null;
  name: string;
  qty: number;
}

interface Props {
  onSuccess?: (transfer: TransferDto) => void;
  onCancel?: () => void;
}

/* Tokens de estilo del rediseño (look compras/nuevo). */
const CARD =
  'rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const LABEL =
  'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';
const SELECT =
  'w-full appearance-none rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 pr-10 text-xs font-semibold text-slate-850 transition-all focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white';
const BTN_OUTLINE =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900';
const BTN_PRIMARY =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Form de nueva transferencia entre bodegas (Fase 7.5). Mismo patrón que
 * SaleForm: selecciona bodega origen + destino, agrega productos del catálogo
 * con cantidad, valida stock disponible en la bodega origen (bloqueante).
 *
 * SOLO UI/UX (look compras/nuevo): cards rounded-2xl, selects nativos con
 * chevron, tabla de ítems en "sheet", inputs soft y botones azul/outline. La
 * lógica (validación de stock, mutación, etc.) es idéntica.
 *
 * Decisiones:
 *  - El stock se chequea en la bodega ORIGEN (no destino — el destino solo
 *    recibe).
 *  - Bodegas origen y destino deben ser distintas, ambas activas.
 *  - Solo bodegas activas aparecen en los selectores.
 *  - Backend hace el applyMovement TRANSFER_OUT/IN en una transacción atómica.
 */
export function TransferForm({ onSuccess, onCancel }: Props) {
  const qc = useQueryClient();

  const [fromId, setFromId] = useState<string>('');
  const [toId, setToId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<ItemRow[]>([]);

  // Bodegas activas — únicas elegibles para una nueva transferencia.
  const warehouses = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ active: 'true' }),
  });
  const activeWarehouses =
    (Array.isArray(warehouses.data)
      ? warehouses.data
      : warehouses.data?.items ?? []) as WarehouseDto[];

  // Stock disponible en la BODEGA ORIGEN — se reconsulta cuando cambian los
  // items o cuando cambia la bodega origen.
  const productIds = useMemo(
    () => items.map((it) => it.productId).filter(Boolean),
    [items],
  );
  const stockQuery = useQuery({
    queryKey: ['transfer-stock', fromId, productIds.join(',')],
    queryFn: () => getAvailableStock(productIds, fromId),
    enabled: !!fromId && productIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of stockQuery.data ?? ([] as AvailableStockRow[])) {
      m.set(row.productId, row.quantity);
    }
    return m;
  }, [stockQuery.data]);

  const stockShortages = items
    .map((it, idx) => {
      const available = stockMap.get(it.productId);
      if (available == null) return null;
      if (it.qty > available) return { idx, available, requested: it.qty };
      return null;
    })
    .filter((x): x is { idx: number; available: number; requested: number } => x !== null);

  const formValid =
    !!fromId &&
    !!toId &&
    fromId !== toId &&
    items.length > 0 &&
    items.every((it) => it.qty >= 1) &&
    stockShortages.length === 0;

  const createMut = useMutation({
    mutationFn: (payload: CreateTransferInput) => createTransfer(payload),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      toast.success(`Transferencia ${t.number} registrada`);
      onSuccess?.(t);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo registrar la transferencia')),
  });

  function handleConfirm() {
    if (!formValid) return;
    createMut.mutate({
      fromWarehouseId: fromId,
      toWarehouseId: toId,
      notes: notes.trim() || null,
      items: items.map((it) => ({ productId: it.productId, qty: it.qty })),
    });
  }

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleConfirm();
      }}
      className="space-y-6"
    >
      {/* ============================================================
          ORIGEN → DESTINO
          ============================================================ */}
      <div className={`space-y-4 p-6 ${CARD}`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1.5">
            <span className={LABEL}>Bodega origen</span>
            <div className="relative">
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className={SELECT}
              >
                <option value="">Seleccioná origen</option>
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.id === toId}>
                    {w.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <div className="flex items-end justify-center pb-3 text-slate-300 dark:text-slate-600">
            <ArrowRight className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <span className={LABEL}>Bodega destino</span>
            <div className="relative">
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className={SELECT}
              >
                <option value="">Seleccioná destino</option>
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.id === fromId}>
                    {w.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        {activeWarehouses.length < 2 && (
          <p className="rounded-xl border border-amber-100 bg-amber-50/60 px-3.5 py-2.5 text-[11px] font-semibold text-amber-600 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-400">
            Necesitás al menos 2 bodegas activas para hacer una transferencia.
            Activá una desde{' '}
            <a href="/almacenes" className="underline">
              Almacenes
            </a>
            .
          </p>
        )}
      </div>

      {/* ============================================================
          PRODUCTOS
          ============================================================ */}
      <div className={`overflow-hidden ${CARD}`}>
        <div className="flex select-none items-center justify-between border-b border-slate-100 p-5 dark:border-slate-850">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Productos a transferir
          </h3>
          <ProductPicker
            buttonLabel="Agregar producto"
            onPick={(p) => {
              if (!fromId) {
                toast.error('Elegí primero la bodega origen');
                return;
              }
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
          <table className="w-full min-w-[600px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
                <th className="w-[18%] py-3 pl-6">SKU</th>
                <th className="py-3">Producto</th>
                <th className="w-[210px] py-3 text-right">Cant. / Stock origen</th>
                <th className="w-[70px] py-3 pr-6 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-850">
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="select-none py-12 text-center text-xs font-bold text-slate-400">
                    Agregá al menos un producto.
                  </td>
                </tr>
              )}
              {items.map((it, idx) => {
                const available = stockMap.get(it.productId);
                const stockLoaded = available != null;
                const exceeds = stockLoaded && it.qty > available;
                return (
                  <tr
                    key={`${it.productId}-${idx}`}
                    className={cn(
                      'transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-900/10',
                      exceeds && 'bg-rose-50/40 dark:bg-rose-950/5',
                    )}
                  >
                    <td className="py-4 pl-6 font-mono text-slate-500 dark:text-slate-400">
                      {it.sku ?? '—'}
                    </td>
                    <td className="max-w-[300px] truncate py-4 font-bold text-slate-950 dark:text-white">
                      {it.name}
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            value={it.qty}
                            onChange={(e) =>
                              updateItem(idx, {
                                qty: Math.max(1, Number(e.target.value) || 0),
                              })
                            }
                            className={cn(
                              'w-20 rounded-lg border bg-white px-2 py-1.5 text-right font-mono text-xs font-bold focus:border-[#2F6BFF] focus:outline-none dark:bg-slate-900',
                              exceeds
                                ? 'border-rose-300 dark:border-rose-800'
                                : 'border-slate-200 dark:border-slate-800',
                            )}
                          />
                          {/* Ronda 7 — botón Max autocompleta con el stock
                              disponible en la bodega origen. */}
                          <button
                            type="button"
                            disabled={!stockLoaded || (available ?? 0) <= 0}
                            onClick={() =>
                              stockLoaded &&
                              available > 0 &&
                              updateItem(idx, { qty: available })
                            }
                            title="Llenar con el stock disponible en la bodega origen"
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                          >
                            Max
                          </button>
                        </div>
                        {stockLoaded && (
                          <div
                            className={cn(
                              'font-mono text-[11px] tabular-nums',
                              exceeds ? 'font-bold text-rose-500' : 'text-slate-400',
                            )}
                          >
                            Stock origen: {available}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-6 text-center">
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

      {stockShortages.length > 0 && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-3 text-xs font-semibold text-rose-500 dark:border-rose-950/30 dark:bg-rose-950/10 dark:text-rose-400">
          Hay items que exceden el stock disponible en la bodega origen. Ajustá
          las cantidades antes de confirmar.
        </div>
      )}

      {/* ============================================================
          NOTAS
          ============================================================ */}
      <div className={`space-y-1.5 p-6 ${CARD}`}>
        <span className={LABEL}>Notas (opcional)</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Motivo de la transferencia, número de remito, etc."
          className="w-full rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white"
        />
      </div>

      {/* ============================================================
          ACCIONES
          ============================================================ */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={BTN_OUTLINE}
          onClick={() => onCancel?.()}
          disabled={createMut.isPending}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className={BTN_PRIMARY}
          disabled={!formValid || createMut.isPending}
        >
          <Send className="h-4 w-4" />
          {createMut.isPending ? 'Registrando…' : 'Confirmar transferencia'}
        </button>
      </div>
    </form>
  );
}
