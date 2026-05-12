'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, RotateCcw, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { formatCurrency } from '@/lib/format';
import { createReturn, getReturnedQtyBySale } from '@/lib/returns-api';
import { cn } from '@/lib/utils';
import type {
  CreateReturnInput,
  PaymentMethodDto,
  ReturnDto,
  ReturnItemConditionDto,
  SaleDto,
} from '@inventory/shared';

interface ItemRow {
  saleItemId: string;
  productId: string;
  sku: string;
  name: string;
  maxQty: number; // qty original - qty ya devuelto
  qty: number; // qty a devolver ahora (0 = no incluir)
  unitPrice: string;
  itemCondition: ReturnItemConditionDto;
}

interface Props {
  sale: SaleDto;
  onSuccess?: (ret: ReturnDto) => void;
  onCancel?: () => void;
}

/**
 * Form para registrar una devolución de un cliente sobre una venta existente.
 * El operador:
 *  - Marca qué ítems se devuelven y en qué cantidad (max = vendido - ya devuelto).
 *  - Elige condición: RESELLABLE (vuelve a stock) o DAMAGED (pérdida, no restock).
 *  - Elige método de reembolso (default = método de la venta).
 *  - Anota motivo + notas opcionales.
 *
 * El backend valida anti-doble-devolución (la suma de qty devueltas no excede
 * lo vendido). El form replica esa validación en cliente para mejor UX.
 */
export function CustomerReturnForm({ sale, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();

  // Carga el "cuánto ya se devolvió por saleItem" para limitar el máximo.
  const returnedQuery = useQuery({
    queryKey: ['returned-qty-by-sale', sale.id],
    queryFn: () => getReturnedQtyBySale(sale.id),
  });
  const returnedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of returnedQuery.data ?? []) {
      m.set(r.saleItemId, r.qty);
    }
    return m;
  }, [returnedQuery.data]);

  // Rows: una por cada item de la venta. qty arranca en 0 (no incluido).
  const [rows, setRows] = useState<ItemRow[]>(() =>
    (sale.items ?? []).map((it) => ({
      saleItemId: it.id,
      productId: it.productId,
      sku: it.product?.sku ?? '',
      name: it.product?.name ?? '',
      maxQty: it.qty, // se actualiza cuando lleguen los devueltos
      qty: 0,
      unitPrice: it.unitPrice,
      itemCondition: 'RESELLABLE' as ReturnItemConditionDto,
    })),
  );

  // Actualizar maxQty cuando lleguen los datos de retornos previos. Side
  // effect → useEffect (no useMemo).
  useEffect(() => {
    if (!returnedQuery.data) return;
    setRows((prev) =>
      prev.map((r) => {
        const sold = (sale.items ?? []).find((si) => si.id === r.saleItemId)?.qty ?? 0;
        const already = returnedMap.get(r.saleItemId) ?? 0;
        return { ...r, maxQty: Math.max(0, sold - already) };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedQuery.data]);

  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDto>(
    sale.paymentMethod,
  );

  const itemsToReturn = rows.filter((r) => r.qty > 0);
  const refundAmount = itemsToReturn.reduce(
    (acc, r) => acc + r.qty * parseFloat(r.unitPrice),
    0,
  );

  const hasOverflow = rows.some((r) => r.qty > r.maxQty);
  const valid =
    itemsToReturn.length > 0 &&
    reason.trim().length >= 3 &&
    !hasOverflow;

  const createMut = useMutation({
    mutationFn: (input: CreateReturnInput) => createReturn(input),
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      qc.invalidateQueries({ queryKey: ['returned-qty-by-sale', sale.id] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      toast.success(`Devolución ${ret.number} registrada`);
      onSuccess?.(ret);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo registrar la devolución')),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    createMut.mutate({
      type: 'CUSTOMER',
      saleId: sale.id,
      reason: reason.trim(),
      notes: notes.trim() || null,
      paymentMethod,
      items: itemsToReturn.map((r) => ({
        productId: r.productId,
        saleItemId: r.saleItemId,
        qty: r.qty,
        unitPrice: r.unitPrice,
        itemCondition: r.itemCondition,
      })),
    });
  }

  function setRow(idx: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-md border bg-card p-4 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Devolviendo sobre venta: </span>
          <span className="font-mono font-medium">{sale.number}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Cliente: </span>
          {sale.customer?.name ?? '—'}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Items a devolver</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Marcá cantidad &gt; 0 para incluir el ítem. El máximo que podés
            devolver es lo vendido menos lo ya devuelto en devoluciones previas.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="w-[140px] text-right">Cant. a devolver</TableHead>
              <TableHead className="w-[160px]">Estado</TableHead>
              <TableHead className="w-[140px] text-right">P. Unit</TableHead>
              <TableHead className="w-[140px] text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => {
              const exceeds = r.qty > r.maxQty;
              return (
                <TableRow
                  key={r.saleItemId}
                  className={exceeds ? 'bg-destructive/5' : ''}
                >
                  <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="space-y-1">
                      <Input
                        type="number"
                        min={0}
                        max={r.maxQty}
                        value={r.qty}
                        onChange={(e) =>
                          setRow(idx, {
                            qty: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className={cn(
                          'text-right',
                          exceeds && 'border-destructive',
                        )}
                        disabled={r.maxQty === 0}
                      />
                      <div className="text-xs tabular-nums text-muted-foreground">
                        Máx: {r.maxQty}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.itemCondition}
                      onValueChange={(v) =>
                        setRow(idx, { itemCondition: v as ReturnItemConditionDto })
                      }
                      disabled={r.qty === 0}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RESELLABLE">
                          Vendible (vuelve a stock)
                        </SelectItem>
                        <SelectItem value="DAMAGED">
                          Dañado (no se restockea)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {r.qty > 0
                      ? formatCurrency((r.qty * parseFloat(r.unitPrice)).toFixed(2))
                      : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="reason">Motivo (obligatorio)</Label>
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Producto equivocado, defecto, cambio de opinión"
            minLength={3}
          />
        </div>
        <div className="space-y-2">
          <Label>Método de reembolso</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'TRANSFER', 'CARD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMethod(m)}
                className={cn(
                  'flex items-center gap-2 rounded-md border p-3 text-left text-sm',
                  paymentMethod === m
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-accent',
                )}
              >
                {m === 'CASH' && <Banknote className="h-4 w-4" />}
                {m === 'TRANSFER' && <Send className="h-4 w-4" />}
                {m === 'CARD' && <CreditCard className="h-4 w-4" />}
                <span>
                  {m === 'CASH'
                    ? 'Efectivo'
                    : m === 'TRANSFER'
                      ? 'Transfer.'
                      : 'Tarjeta'}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Default: mismo método de la venta original (
            {sale.paymentMethod}).
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones adicionales sobre la devolución"
        />
      </div>

      <div className="ml-auto max-w-md rounded-md border bg-card p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Items a devolver</span>
          <span className="tabular-nums">{itemsToReturn.length}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Monto a reembolsar</span>
          <span className="tabular-nums">{formatCurrency(refundAmount.toFixed(2))}</span>
        </div>
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
        <Button type="submit" disabled={!valid || createMut.isPending}>
          <RotateCcw className="h-4 w-4" />
          {createMut.isPending ? 'Registrando...' : 'Registrar devolución'}
        </Button>
      </div>
    </form>
  );
}
