'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CreditCard,
  DollarSign,
  RotateCcw,
  Send,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  createReturn,
  getReturnedQtyByPurchase,
} from '@/lib/returns-api';
import { cn } from '@/lib/utils';
import type {
  CreateReturnInput,
  PaymentMethodDto,
  PurchaseEntryDto,
  RefundModeDto,
  ReturnDto,
  ReturnItemConditionDto,
} from '@inventory/shared';

interface ItemRow {
  purchaseEntryItemId: string;
  productId: string;
  sku: string | null;
  name: string;
  unitCost: string;
  maxQty: number; // comprada - ya_devuelta (anti-doble-devolución)
  qty: number; // qty a devolver ahora (0 = no incluir)
  itemCondition: ReturnItemConditionDto;
}

interface Props {
  purchase: PurchaseEntryDto;
  onSuccess?: (ret: ReturnDto) => void;
  onCancel?: () => void;
}

/**
 * Ronda 11 — devolución a proveedor sobre una compra existente.
 *
 * Flujo:
 *  1. Operador elige modo: **Recibir dinero** o **Crédito a favor**.
 *  2. Marca items + qty parcial (validado contra qty comprada - ya devuelta).
 *  3. Por línea, marca condición:
 *      - RESELLABLE → emite RETURN_OUT (resta stock real de la bodega).
 *      - DAMAGED    → solo audit (no toca stock).
 *  4. Confirma.
 *
 * Backend (ReturnsService.create con type=SUPPLIER):
 *  - MONEY: registra ingreso de caja por el monto devuelto.
 *  - CREDIT: genera SupplierCredit que se aplica como descuento en compras
 *    futuras al mismo proveedor.
 */
export function SupplierReturnForm({ purchase, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();

  // Cantidades ya devueltas por purchaseItemId (anti-doble-devolución).
  const returnedQ = useQuery({
    queryKey: ['returned-qty-by-purchase', purchase.id],
    queryFn: () => getReturnedQtyByPurchase(purchase.id),
  });
  const returnedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of returnedQ.data ?? []) {
      m.set(r.purchaseEntryItemId, r.qty);
    }
    return m;
  }, [returnedQ.data]);

  // Filas iniciales — qty=0 (no incluir hasta que el operador edite).
  const [rows, setRows] = useState<ItemRow[]>(() =>
    (purchase.items ?? []).map((it) => ({
      purchaseEntryItemId: it.id,
      productId: it.productId,
      sku: it.product?.sku ?? null,
      name: it.product?.name ?? '—',
      unitCost: it.unitCost,
      maxQty: it.qty, // se actualiza al cargar returnedQ
      qty: 0,
      itemCondition: 'RESELLABLE' as ReturnItemConditionDto,
    })),
  );

  useEffect(() => {
    if (!returnedQ.data) return;
    setRows((prev) =>
      prev.map((r) => {
        const bought =
          (purchase.items ?? []).find(
            (pi) => pi.id === r.purchaseEntryItemId,
          )?.qty ?? 0;
        const already = returnedMap.get(r.purchaseEntryItemId) ?? 0;
        return { ...r, maxQty: Math.max(0, bought - already) };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedQ.data]);

  const [refundMode, setRefundMode] = useState<RefundModeDto>('MONEY');
  // El método de pago aplica solo cuando refundMode=MONEY. Default = TRANSFER
  // (lo típico para reintegros de proveedor).
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodDto>('TRANSFER');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const itemsToReturn = rows.filter((r) => r.qty > 0);
  const refundAmount = itemsToReturn.reduce(
    (acc, r) => acc + r.qty * parseFloat(r.unitCost),
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
      qc.invalidateQueries({
        queryKey: ['returned-qty-by-purchase', purchase.id],
      });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({
        queryKey: ['supplier-credits', 'available', purchase.supplierId],
      });
      toast.success(
        refundMode === 'CREDIT'
          ? `Devolución ${ret.number} registrada · crédito generado a favor del proveedor`
          : `Devolución ${ret.number} registrada`,
      );
      onSuccess?.(ret);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo registrar la devolución')),
  });

  function setRow(idx: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    createMut.mutate({
      type: 'SUPPLIER',
      purchaseEntryId: purchase.id,
      reason: reason.trim(),
      notes: notes.trim() || null,
      paymentMethod,
      refundMode,
      items: itemsToReturn.map((r) => ({
        productId: r.productId,
        purchaseEntryItemId: r.purchaseEntryItemId,
        qty: r.qty,
        // El backend usa `unitPrice` para calcular el refundAmount.
        // Para devoluciones a proveedor usamos el costo de la compra original.
        unitPrice: r.unitCost,
        itemCondition: r.itemCondition,
      })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-md border bg-card p-4 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Devolviendo sobre compra a: </span>
          <span className="font-medium">{purchase.supplier?.name ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Fecha de compra: </span>
          {new Date(purchase.date).toLocaleDateString('es-CL', {
            dateStyle: 'long',
          })}
        </div>
        <div>
          <span className="text-muted-foreground">Bodega de origen del stock: </span>
          {purchase.warehouse?.name ?? '—'}{' '}
          <span className="text-xs text-muted-foreground">
            (el stock se descuenta de esta bodega)
          </span>
        </div>
      </div>

      {/* Modo de reembolso */}
      <div className="space-y-2">
        <Label>Modo de devolución</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setRefundMode('MONEY')}
            className={cn(
              'flex items-start gap-3 rounded-md border p-4 text-left',
              refundMode === 'MONEY'
                ? 'border-primary bg-primary/5'
                : 'hover:bg-accent',
            )}
          >
            <DollarSign className="mt-0.5 h-5 w-5" />
            <div>
              <div className="font-medium">Recibir dinero</div>
              <div className="text-xs text-muted-foreground">
                El proveedor reintegra el monto. Se registra un ingreso de
                caja por el total de la devolución.
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setRefundMode('CREDIT')}
            className={cn(
              'flex items-start gap-3 rounded-md border p-4 text-left',
              refundMode === 'CREDIT'
                ? 'border-primary bg-primary/5'
                : 'hover:bg-accent',
            )}
          >
            <Wallet className="mt-0.5 h-5 w-5" />
            <div>
              <div className="font-medium">Crédito a favor</div>
              <div className="text-xs text-muted-foreground">
                Genera un saldo a favor con el proveedor. Aplicable como
                descuento en futuras compras. Sin movimiento de caja.
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Tabla de items */}
      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Items a devolver</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Marcá cantidad &gt; 0 para incluir el ítem. El máximo es la
            cantidad comprada menos lo ya devuelto en devoluciones previas.
            Marcá <strong>Dañado</strong> si el producto vino defectuoso y no
            llegó a estar disponible para venta (no descuenta stock).
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="w-[120px] text-right">Comprada</TableHead>
              <TableHead className="w-[140px] text-right">Devolver</TableHead>
              <TableHead className="w-[160px]">Condición</TableHead>
              <TableHead className="w-[140px] text-right">Costo unit.</TableHead>
              <TableHead className="w-[140px] text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => {
              const overflow = r.qty > r.maxQty;
              return (
                <TableRow
                  key={r.purchaseEntryItemId}
                  className={overflow ? 'bg-destructive/5' : ''}
                >
                  <TableCell className="font-mono text-xs">
                    {r.sku ?? '—'}
                  </TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.maxQty}
                    {(purchase.items ?? []).find(
                      (pi) => pi.id === r.purchaseEntryItemId,
                    )?.qty !== r.maxQty && (
                      <div
                        className="text-xs text-muted-foreground"
                        title="Disponible para devolver tras descontar devoluciones previas"
                      >
                        de{' '}
                        {
                          (purchase.items ?? []).find(
                            (pi) => pi.id === r.purchaseEntryItemId,
                          )?.qty
                        }
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
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
                        'ml-auto w-24 text-right',
                        overflow && 'border-destructive',
                      )}
                      disabled={r.maxQty === 0}
                    />
                    {overflow && (
                      <div className="text-xs text-destructive">
                        Máximo {r.maxQty}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setRow(idx, { itemCondition: 'RESELLABLE' })
                        }
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs',
                          r.itemCondition === 'RESELLABLE'
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent',
                        )}
                        disabled={r.qty === 0}
                      >
                        Vendible
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRow(idx, { itemCondition: 'DAMAGED' })
                        }
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs',
                          r.itemCondition === 'DAMAGED'
                            ? 'border-destructive bg-destructive/10 text-destructive'
                            : 'hover:bg-accent',
                        )}
                        disabled={r.qty === 0}
                        title="No descuenta stock"
                      >
                        Dañado
                      </button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(r.unitCost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {r.qty > 0
                      ? formatCurrency(
                          (r.qty * parseFloat(r.unitCost)).toFixed(2),
                        )
                      : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Motivo + método de pago + notas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="supp-return-reason">Motivo (obligatorio)</Label>
          <Input
            id="supp-return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Producto equivocado, defectos de fabricación, exceso de stock"
            minLength={3}
          />
        </div>
        {refundMode === 'MONEY' && (
          <div className="space-y-2">
            <Label>Método de cobro</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  'CASH',
                  'TRANSFER',
                  'CARD_DEBIT',
                  'CARD_CREDIT',
                  'PAYMENT_LINK',
                ] as const
              ).map((m) => (
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
                  {(m === 'CARD_DEBIT' || m === 'CARD_CREDIT') && (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {m === 'PAYMENT_LINK' && <Send className="h-4 w-4" />}
                  <span>
                    {m === 'CASH'
                      ? 'Efectivo'
                      : m === 'TRANSFER'
                        ? 'Transfer.'
                        : m === 'CARD_DEBIT'
                          ? 'Débito'
                          : m === 'CARD_CREDIT'
                            ? 'Crédito'
                            : 'Link pago'}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cómo recibe el reintegro del proveedor. Default: Transferencia.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="supp-return-notes">Notas (opcional)</Label>
        <Textarea
          id="supp-return-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones adicionales sobre la devolución"
        />
      </div>

      {/* Summary */}
      <div className="ml-auto max-w-md rounded-md border bg-card p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Items a devolver</span>
          <span className="tabular-nums">{itemsToReturn.length}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>
            {refundMode === 'CREDIT'
              ? 'Crédito a favor del proveedor'
              : 'Monto a recibir'}
          </span>
          <span className="tabular-nums">
            {formatCurrency(refundAmount.toFixed(2))}
          </span>
        </div>
        {refundMode === 'CREDIT' && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Aplicable como descuento en futuras compras al mismo proveedor.
          </p>
        )}
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
