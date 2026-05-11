'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, Receipt, Search, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductPicker } from '@/components/product-picker';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { getCompanySettings } from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { listCustomers } from '@/lib/customers-api';
import { formatCurrency } from '@/lib/format';
import {
  createSale,
  getAvailableStock,
  type AvailableStockRow,
} from '@/lib/sales-api';
import { cn } from '@/lib/utils';
import type {
  CreateSaleInput,
  CustomerDto,
  PaymentMethodDto,
  SaleDto,
} from '@inventory/shared';

type DiscountKind = '$' | '%';

interface ItemRow {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: string;
  discountKind: DiscountKind;
  discountValue: string;
}

interface Props {
  // Si llegan datos de cotización, los usamos para prefill (cliente + items
  // + notas). El `quotationId` viaja al backend en el create para que la
  // cotización se marque CONVERTED en la misma transacción.
  prefillFromQuotation?: {
    quotationId: string;
    customer: CustomerDto | null;
    items: Array<{
      productId: string;
      sku: string;
      name: string;
      qty: number;
      unitPrice: string;
      discount: string;
      discountPercent: string | null;
    }>;
    notes: string | null;
  };
  onSuccess?: (sale: SaleDto) => void;
  onCancel?: () => void;
}

export function SaleForm({ prefillFromQuotation, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'cliente' | 'items' | 'notas'>(
    'cliente',
  );

  const [customer, setCustomer] = useState<CustomerDto | null>(
    prefillFromQuotation?.customer ?? null,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDto>('CASH');
  const [items, setItems] = useState<ItemRow[]>(() =>
    (prefillFromQuotation?.items ?? []).map((it) => ({
      productId: it.productId,
      sku: it.sku,
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discountKind: it.discountPercent != null ? '%' : '$',
      discountValue: it.discountPercent ?? it.discount ?? '0',
    })),
  );
  const [notes, setNotes] = useState<string>(prefillFromQuotation?.notes ?? '');

  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
  });
  const taxRate = Number(settings.data?.taxRate ?? '0.19');
  const cardCommissionRate = Number(settings.data?.cardCommissionRate ?? '0.025');

  // Stock disponible por producto: se reconsulta cuando cambian los items.
  // Mostramos un badge al lado de la cantidad y bloqueamos el botón final si
  // alguna línea excede.
  const productIds = useMemo(
    () => items.map((it) => it.productId).filter(Boolean),
    [items],
  );
  const stockQuery = useQuery({
    queryKey: ['sales-available-stock', productIds.join(',')],
    queryFn: () => getAvailableStock(productIds),
    enabled: productIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of stockQuery.data ?? ([] as AvailableStockRow[])) {
      m.set(row.productId, row.quantity);
    }
    return m;
  }, [stockQuery.data]);

  // Cálculos en vivo
  const itemsForCalc = useMemo(
    () =>
      items.map((it) => {
        const qty = Number(it.qty) || 0;
        const unit = Number(it.unitPrice) || 0;
        const gross = qty * unit;
        const dv = Number(it.discountValue) || 0;
        const discount =
          it.discountKind === '%'
            ? (Math.max(0, Math.min(100, dv)) * gross) / 100
            : Math.max(0, dv);
        const subtotal = Math.max(0, gross - discount);
        return { ...it, gross, discount, subtotal };
      }),
    [items],
  );

  const totalBruto = itemsForCalc.reduce((acc, it) => acc + it.subtotal, 0);
  const subtotalNeto = totalBruto / (1 + taxRate);
  const taxAmount = totalBruto - subtotalNeto;
  const commissionAmount =
    paymentMethod === 'CARD' ? totalBruto * cardCommissionRate : 0;
  const netAfterCommission = totalBruto - commissionAmount;

  const stockShortages = items
    .map((it, idx) => {
      const available = stockMap.get(it.productId);
      if (available == null) return null;
      if (it.qty > available) return { idx, available, requested: it.qty };
      return null;
    })
    .filter((x): x is { idx: number; available: number; requested: number } => x !== null);

  const itemsHaveErrors =
    items.length === 0 ||
    items.some((it) => it.qty < 1 || Number(it.unitPrice) <= 0) ||
    stockShortages.length > 0;

  const formValid = !!customer && !itemsHaveErrors;

  const createMut = useMutation({
    mutationFn: (payload: CreateSaleInput) => createSale(payload),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success(`Venta ${sale.number} registrada`);
      onSuccess?.(sale);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo registrar la venta')),
  });

  function buildPayload(): CreateSaleInput | null {
    if (!customer) {
      toast.error('Elegí un cliente del catálogo');
      setActiveTab('cliente');
      return null;
    }
    if (items.length === 0) {
      toast.error('Agregá al menos un item');
      setActiveTab('items');
      return null;
    }
    if (items.some((it) => it.qty < 1 || Number(it.unitPrice) <= 0)) {
      toast.error('Revisá cantidad y precio unitario de cada item');
      setActiveTab('items');
      return null;
    }
    if (stockShortages.length > 0) {
      toast.error('Hay items que exceden el stock disponible');
      setActiveTab('items');
      return null;
    }

    return {
      customerId: customer.id,
      paymentMethod,
      notes: notes.trim() || null,
      quotationId: prefillFromQuotation?.quotationId ?? null,
      items: items.map((it) => {
        const qty = Number(it.qty);
        const unit = Number(it.unitPrice);
        const dv = Number(it.discountValue) || 0;
        if (it.discountKind === '%') {
          const pct = Math.max(0, Math.min(100, dv));
          return {
            productId: it.productId,
            qty,
            unitPrice: unit.toFixed(2),
            discount: '0',
            discountPercent: pct.toFixed(2),
          };
        }
        return {
          productId: it.productId,
          qty,
          unitPrice: unit.toFixed(2),
          discount: Math.max(0, dv).toFixed(2),
          discountPercent: null,
        };
      }),
    };
  }

  function handleConfirm() {
    const payload = buildPayload();
    if (!payload) return;
    createMut.mutate(payload);
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
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <TabsList>
          <TabsTrigger value="cliente">Cliente y pago</TabsTrigger>
          <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>

        <TabsContent value="cliente" className="space-y-4">
          <div className="rounded-md border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <CustomerCombobox
                value={customer?.id ?? null}
                onChange={(c) => setCustomer(c)}
                initialCustomer={customer}
              />
              {!customer && (
                <p className="text-xs text-muted-foreground">
                  El cliente es obligatorio y debe estar en el catálogo (RUT).
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Método de pago</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <PaymentOption
                  selected={paymentMethod === 'CASH'}
                  onClick={() => setPaymentMethod('CASH')}
                  icon={<Banknote className="h-5 w-5" />}
                  label="Efectivo"
                  hint="Sin comisión"
                />
                <PaymentOption
                  selected={paymentMethod === 'TRANSFER'}
                  onClick={() => setPaymentMethod('TRANSFER')}
                  icon={<Send className="h-5 w-5" />}
                  label="Transferencia"
                  hint="Sin comisión"
                />
                <PaymentOption
                  selected={paymentMethod === 'CARD'}
                  onClick={() => setPaymentMethod('CARD')}
                  icon={<CreditCard className="h-5 w-5" />}
                  label="Tarjeta"
                  hint={`Comisión ${(cardCommissionRate * 100).toFixed(2)}%`}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <div className="rounded-md border bg-card">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-medium">Items de la venta</h2>
              <ProductPicker
                buttonLabel="Agregar producto"
                onPick={(p) => {
                  if (items.some((i) => i.productId === p.id)) {
                    toast.info('El producto ya está en la lista');
                    return;
                  }
                  setItems((prev) => [
                    ...prev,
                    {
                      productId: p.id,
                      sku: p.sku,
                      name: p.name,
                      qty: 1,
                      unitPrice: p.price ?? '0',
                      discountKind: '$',
                      discountValue: '0',
                    },
                  ]);
                }}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[130px] text-right">
                    Cant. / Stock
                  </TableHead>
                  <TableHead className="w-[140px] text-right">
                    P. Unit (bruto)
                  </TableHead>
                  <TableHead className="w-[180px] text-right">Descuento</TableHead>
                  <TableHead className="w-[140px] text-right">Subtotal</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground"
                    >
                      Agregá al menos un producto.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((it, idx) => {
                  const calc = itemsForCalc[idx];
                  const available = stockMap.get(it.productId);
                  const exceeds =
                    available != null && it.qty > available;
                  return (
                    <TableRow
                      key={`${it.productId}-${idx}`}
                      className={exceeds ? 'bg-destructive/5' : ''}
                    >
                      <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                      <TableCell className="max-w-[260px] truncate">
                        {it.name}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1">
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
                          {available != null && (
                            <div
                              className={cn(
                                'text-xs tabular-nums',
                                exceeds
                                  ? 'font-medium text-destructive'
                                  : 'text-muted-foreground',
                              )}
                            >
                              Stock: {available}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={it.unitPrice}
                          onChange={(e) =>
                            updateItem(idx, { unitPrice: e.target.value })
                          }
                          className="text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex h-10 items-stretch overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={it.discountValue}
                            onChange={(e) =>
                              updateItem(idx, { discountValue: e.target.value })
                            }
                            className="min-w-0 flex-1 bg-background px-2 text-right text-sm outline-none"
                            aria-label="Valor de descuento"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(idx, {
                                discountKind:
                                  it.discountKind === '$' ? '%' : '$',
                              })
                            }
                            title={
                              it.discountKind === '$'
                                ? 'Descuento en monto fijo. Click para cambiar a porcentaje.'
                                : 'Descuento porcentual. Click para cambiar a monto fijo.'
                            }
                            aria-label={
                              it.discountKind === '$'
                                ? 'Cambiar a porcentaje'
                                : 'Cambiar a monto fijo'
                            }
                            className="flex w-9 shrink-0 items-center justify-center border-l bg-muted text-sm font-semibold text-foreground hover:bg-muted/70"
                          >
                            {it.discountKind}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(calc?.subtotal.toFixed(2))}
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
              Hay items que exceden el stock disponible. Ajustá las cantidades o
              quitá esas líneas antes de confirmar.
            </div>
          )}
        </TabsContent>

        <TabsContent value="notas" className="space-y-2">
          <div className="rounded-md border bg-card p-6 space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Plazo de entrega, observaciones, condiciones especiales, etc."
            />
            <p className="text-xs text-muted-foreground">
              Las notas se imprimen al final de la nota de venta.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="ml-auto max-w-md rounded-md border bg-card p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal neto</span>
          <span className="tabular-nums">{formatCurrency(subtotalNeto.toFixed(2))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            IVA ({(taxRate * 100).toFixed(0)}%)
          </span>
          <span className="tabular-nums">{formatCurrency(taxAmount.toFixed(2))}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total a cobrar</span>
          <span className="tabular-nums">{formatCurrency(totalBruto.toFixed(2))}</span>
        </div>
        {paymentMethod === 'CARD' && commissionAmount > 0 && (
          <>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Comisión tarjeta ({(cardCommissionRate * 100).toFixed(2)}%)</span>
              <span className="tabular-nums">
                −{formatCurrency(commissionAmount.toFixed(2))}
              </span>
            </div>
            <div className="flex justify-between text-xs font-medium">
              <span>Neto para caja</span>
              <span className="tabular-nums">
                {formatCurrency(netAfterCommission.toFixed(2))}
              </span>
            </div>
          </>
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
        <Button type="submit" disabled={!formValid || createMut.isPending}>
          <Receipt className="h-4 w-4" />
          {createMut.isPending ? 'Confirmando...' : 'Confirmar venta'}
        </Button>
      </div>
    </form>
  );
}

function PaymentOption({
  selected,
  onClick,
  icon,
  label,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'hover:bg-accent',
      )}
    >
      <div className={selected ? 'text-primary' : 'text-muted-foreground'}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

// ---------- Customer combobox (catálogo, requerido) ----------

function CustomerCombobox({
  value,
  onChange,
  initialCustomer,
}: {
  value: string | null;
  onChange: (customer: CustomerDto | null) => void;
  initialCustomer?: CustomerDto | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selected, setSelected] = useState<CustomerDto | null>(
    initialCustomer ?? null,
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ['customers-picker', debouncedQ],
    queryFn: () =>
      listCustomers({
        q: debouncedQ || undefined,
        page: 1,
        pageSize: 20,
      }),
    enabled: open,
  });

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    const data = results.data;
    if (!data) return;
    const arr = Array.isArray(data) ? data : data.items;
    const found = arr.find((c) => c.id === value);
    if (found) setSelected(found);
  }, [value, results.data, selected]);

  const items: CustomerDto[] = (() => {
    const data = results.data;
    if (!data) return [];
    return Array.isArray(data) ? data : data.items;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(!selected && 'text-muted-foreground', 'truncate')}
          >
            {selected
              ? `${selected.name}${selected.taxId ? ` (${selected.taxId})` : ''}`
              : 'Buscar cliente del catálogo...'}
          </span>
          <Search className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre, RUT, email..."
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            {results.isLoading && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Buscando...
              </div>
            )}
            {!results.isLoading && items.length === 0 && (
              <CommandEmpty>
                {debouncedQ
                  ? 'Sin resultados. Cargá el cliente desde Clientes → Nuevo y volvé.'
                  : 'Empezá a tipear para buscar.'}
              </CommandEmpty>
            )}
            {items.length > 0 && (
              <CommandGroup heading="Clientes">
                {items.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange(c);
                      setSelected(c);
                      setOpen(false);
                    }}
                  >
                    <div className="flex w-full flex-col">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.taxId}
                        {c.email ? ` · ${c.email}` : ''}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
