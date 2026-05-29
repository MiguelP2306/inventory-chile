'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  DollarSign,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { formatCurrency } from '@/lib/format';
import { createReturn, getReturnedQtyBySale } from '@/lib/returns-api';
import { cn } from '@/lib/utils';
import type {
  CreateReturnInput,
  PaymentMethodDto,
  RefundModeDto,
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

// Ronda 9 — items de reemplazo cuando refundMode = EXCHANGE.
interface ReplacementRow {
  productId: string;
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: string; // monto bruto unitario
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
    sale.paymentMethod ?? 'CASH',
  );

  // Ronda 9 — modo de reembolso. CUSTOMER soporta MONEY o EXCHANGE (no CREDIT).
  const [refundMode, setRefundMode] = useState<RefundModeDto>('MONEY');
  const [replacements, setReplacements] = useState<ReplacementRow[]>([]);

  const itemsToReturn = rows.filter((r) => r.qty > 0);
  const refundAmount = itemsToReturn.reduce(
    (acc, r) => acc + r.qty * parseFloat(r.unitPrice),
    0,
  );

  // Suma bruta de los replacement items y diferencia con el refundAmount.
  // > 0  cliente paga la diferencia.
  // < 0  el sistema le devuelve la diferencia.
  // = 0  cambio sin movimiento de caja.
  const replacementTotal = replacements.reduce(
    (acc, r) => acc + r.qty * parseFloat(r.unitPrice || '0'),
    0,
  );
  const exchangeDifference =
    refundMode === 'EXCHANGE' ? replacementTotal - refundAmount : 0;

  const replacementsValid =
    refundMode !== 'EXCHANGE' ||
    (replacements.length > 0 &&
      replacements.every((r) => r.qty > 0 && parseFloat(r.unitPrice) > 0));

  const hasOverflow = rows.some((r) => r.qty > r.maxQty);
  const valid =
    itemsToReturn.length > 0 &&
    reason.trim().length >= 3 &&
    !hasOverflow &&
    replacementsValid;

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
      refundMode,
      items: itemsToReturn.map((r) => ({
        productId: r.productId,
        saleItemId: r.saleItemId,
        qty: r.qty,
        unitPrice: r.unitPrice,
        itemCondition: r.itemCondition,
      })),
      replacementItems:
        refundMode === 'EXCHANGE'
          ? replacements.map((r) => ({
              productId: r.productId,
              qty: r.qty,
              unitPrice: r.unitPrice,
            }))
          : undefined,
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

      {/* Ronda 9 — selector de modo de reembolso. CUSTOMER soporta MONEY o
          EXCHANGE. La opción se muestra antes de marcar los items porque
          afecta qué sub-form se renderiza abajo. */}
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
              <div className="font-medium">Devolver dinero</div>
              <div className="text-xs text-muted-foreground">
                Reembolso al cliente por el monto de los ítems devueltos. Se
                registra como egreso de caja con el método elegido.
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setRefundMode('EXCHANGE')}
            className={cn(
              'flex items-start gap-3 rounded-md border p-4 text-left',
              refundMode === 'EXCHANGE'
                ? 'border-primary bg-primary/5'
                : 'hover:bg-accent',
            )}
          >
            <ArrowLeftRight className="mt-0.5 h-5 w-5" />
            <div>
              <div className="font-medium">Cambio por otros productos</div>
              <div className="text-xs text-muted-foreground">
                El cliente se lleva otros productos. Si hay diferencia bruta,
                se cobra o se devuelve automáticamente.
              </div>
            </div>
          </button>
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

      {/* Ronda 9 — sub-form de productos de reemplazo cuando EXCHANGE. */}
      {refundMode === 'EXCHANGE' && (
        <div className="rounded-md border bg-card">
          <div className="border-b p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Productos de reemplazo</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Productos que el cliente se lleva a cambio. El sistema
                  descontará stock en la misma transacción. La diferencia
                  bruta con lo devuelto se cobra o reembolsa.
                </p>
              </div>
              <ProductPicker
                buttonLabel="Agregar reemplazo"
                onPick={(p) => {
                  setReplacements((prev) => [
                    ...prev,
                    {
                      productId: p.id,
                      sku: p.sku,
                      name: p.name,
                      qty: 1,
                      unitPrice: p.price,
                    },
                  ]);
                }}
              />
            </div>
          </div>
          {replacements.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Aún no agregaste reemplazos. Usá «Agregar reemplazo» arriba.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[120px] text-right">Cantidad</TableHead>
                  <TableHead className="w-[160px] text-right">P. unitario</TableHead>
                  <TableHead className="w-[140px] text-right">Subtotal</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {replacements.map((r, idx) => (
                  <TableRow key={`${r.productId}-${idx}`}>
                    <TableCell>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.sku ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={(e) => {
                          const v = Math.max(1, Number(e.target.value) || 1);
                          setReplacements((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, qty: v } : row,
                            ),
                          );
                        }}
                        className="ml-auto w-24 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={r.unitPrice}
                        onChange={(e) =>
                          setReplacements((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? { ...row, unitPrice: e.target.value }
                                : row,
                            ),
                          )
                        }
                        className="ml-auto w-32 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        (r.qty * parseFloat(r.unitPrice || '0')).toFixed(2),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setReplacements((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

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
          {/* Ronda 9 — 5 métodos (split CARD → débito/crédito/link). */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              ['CASH', 'TRANSFER', 'CARD_DEBIT', 'CARD_CREDIT', 'PAYMENT_LINK'] as const
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
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {refundMode === 'EXCHANGE'
              ? 'Crédito por devolución'
              : 'Monto a reembolsar'}
          </span>
          <span className="tabular-nums">
            {formatCurrency(refundAmount.toFixed(2))}
          </span>
        </div>
        {refundMode === 'EXCHANGE' && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total reemplazos</span>
              <span className="tabular-nums">
                {formatCurrency(replacementTotal.toFixed(2))}
              </span>
            </div>
            <div
              className={cn(
                'flex justify-between border-t pt-2 font-semibold',
                exchangeDifference > 0 && 'text-blue-600 dark:text-blue-400',
                exchangeDifference < 0 && 'text-amber-600 dark:text-amber-400',
              )}
            >
              <span>
                {exchangeDifference > 0
                  ? 'Diferencia a cobrar al cliente'
                  : exchangeDifference < 0
                    ? 'Diferencia a devolver al cliente'
                    : 'Cambio sin diferencia'}
              </span>
              <span className="tabular-nums">
                {formatCurrency(Math.abs(exchangeDifference).toFixed(2))}
              </span>
            </div>
          </>
        )}
        {refundMode === 'MONEY' && (
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Monto final a reembolsar</span>
            <span className="tabular-nums">
              {formatCurrency(refundAmount.toFixed(2))}
            </span>
          </div>
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
