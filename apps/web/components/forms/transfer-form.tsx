'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductPicker } from '@/components/product-picker';
import { Button } from '@/components/ui/button';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
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
  sku: string;
  name: string;
  qty: number;
}

interface Props {
  onSuccess?: (transfer: TransferDto) => void;
  onCancel?: () => void;
}

/**
 * Form de nueva transferencia entre bodegas (Fase 7.5). Mismo patrón que
 * SaleForm: selecciona bodega origen + destino, agrega productos del catálogo
 * con cantidad, valida stock disponible en la bodega origen (bloqueante).
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
      <div className="rounded-md border bg-card p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <Label>Bodega origen</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná origen" />
              </SelectTrigger>
              <SelectContent>
                {activeWarehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id} disabled={w.id === toId}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end pb-2 text-muted-foreground">
            <ArrowRight className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <Label>Bodega destino</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná destino" />
              </SelectTrigger>
              <SelectContent>
                {activeWarehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id} disabled={w.id === fromId}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {activeWarehouses.length < 2 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Necesitás al menos 2 bodegas activas para hacer una transferencia.
            Activá una desde <a href="/almacenes" className="underline">Almacenes</a>.
          </p>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-medium">Productos a transferir</h2>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="w-[160px] text-right">Cant. / Stock origen</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Agregá al menos un producto.
                </TableCell>
              </TableRow>
            )}
            {items.map((it, idx) => {
              const available = stockMap.get(it.productId);
              const stockLoaded = available != null;
              const exceeds = stockLoaded && it.qty > available;
              return (
                <TableRow
                  key={`${it.productId}-${idx}`}
                  className={exceeds ? 'bg-destructive/5' : ''}
                >
                  <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{it.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(idx, {
                              qty: Math.max(1, Number(e.target.value) || 0),
                            })
                          }
                          className={cn(
                            'text-right',
                            exceeds && 'border-destructive',
                          )}
                        />
                        {/* Ronda 7 — botón Max autocompleta con el stock
                            disponible en la bodega origen. Si todavía no se
                            cargó (loading) o el stock es 0, queda deshabilitado. */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0 px-2 text-xs"
                          disabled={!stockLoaded || (available ?? 0) <= 0}
                          onClick={() =>
                            stockLoaded &&
                            available > 0 &&
                            updateItem(idx, { qty: available })
                          }
                          title="Llenar con el stock disponible en la bodega origen"
                        >
                          Max
                        </Button>
                      </div>
                      {stockLoaded && (
                        <div
                          className={cn(
                            'text-xs tabular-nums',
                            exceeds
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          Stock origen: {available}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {stockShortages.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Hay items que exceden el stock disponible en la bodega origen. Ajustá
          las cantidades antes de confirmar.
        </div>
      )}

      <div className="rounded-md border bg-card p-6 space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Motivo de la transferencia, número de remito, etc."
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onCancel?.()}
          disabled={createMut.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={!formValid || createMut.isPending}>
          <Send className="h-4 w-4" />
          {createMut.isPending ? 'Registrando...' : 'Confirmar transferencia'}
        </Button>
      </div>
    </form>
  );
}
