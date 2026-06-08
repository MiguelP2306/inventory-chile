'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, CreditCard, Receipt, Search, Send, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProductPicker } from '@/components/product-picker';
import {
  RegisterCustomerFromSnapshotDialog,
  type CustomerSnapshot,
} from '@/components/forms/register-customer-from-snapshot-dialog';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { invalidateProductCaches } from '@/lib/invalidate-product-caches';
import { listCustomers } from '@/lib/customers-api';
import { Permission, useCan } from '@/lib/current-user-context';
import { formatCurrency } from '@/lib/format';
import {
  createSale,
  getAvailableStock,
  type AvailableStockRow,
} from '@/lib/sales-api';
import { cn } from '@/lib/utils';
import { listWarehouses } from '@/lib/warehouses-api';
import type {
  CreateSaleInput,
  CustomerDto,
  PaymentMethodDto,
  SaleDto,
  WarehouseDto,
} from '@inventory/shared';

type DiscountKind = '$' | '%';

interface ItemRow {
  productId: string;
  // Ronda 9 — sku puede ser null (productos con SKU auto-generado quedan
  // como string normal, pero el ProductPicker pasa el dato directo del DTO).
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: string;
  discountKind: DiscountKind;
  discountValue: string;
}

export interface SaleBagItem {
  productId: string;
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: string;
  // Bodega elegida en el bolso (Fase 12). Si todos los items comparten una, la
  // venta predefine esa bodega.
  warehouseId?: string | null;
}

/**
 * Devuelve la bodega común a TODOS los items del bolso, o null si vienen de
 * bodegas distintas (o algún item no trae bodega). Se usa para predefinir la
 * bodega de la venta cuando se crea desde el bolso.
 */
function unanimousBagWarehouse(items?: SaleBagItem[]): string | null {
  if (!items || items.length === 0) return null;
  const first = items[0]?.warehouseId ?? null;
  if (!first) return null;
  return items.every((it) => it.warehouseId === first) ? first : null;
}

interface Props {
  // Si llegan datos de cotización, los usamos para prefill (cliente + items
  // + notas). El `quotationId` viaja al backend en el create para que la
  // cotización se marque CONVERTED en la misma transacción.
  prefillFromQuotation?: {
    quotationId: string;
    // Si la cotización tenía cliente del catálogo, viene acá. Si era libre,
    // este campo es null y `customerSnapshot` trae los datos del snapshot.
    customer: CustomerDto | null;
    // Snapshot de cliente libre. Si está presente, el form muestra el banner
    // de "Registrá al cliente para continuar" hasta que el operador resuelva
    // (creando uno nuevo o usando uno existente del catálogo).
    customerSnapshot?: CustomerSnapshot | null;
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
  /**
   * Items del bolso para prellenar la venta sin pasar por una cotización.
   * No traen cliente — el operador lo elige acá.
   */
  initialBagItems?: SaleBagItem[];
  onSuccess?: (sale: SaleDto) => void;
  onCancel?: () => void;
}

export function SaleForm({
  prefillFromQuotation,
  initialBagItems,
  onSuccess,
  onCancel,
}: Props) {
  const qc = useQueryClient();
  const canSeeBreakdown = useCan(Permission.SALE_VIEW_FINANCIAL_BREAKDOWN);
  // Ronda 10 — tabs simplificadas: cliente + items en una sola vista
  // ('principal'); notas aparte. Las referencias a 'cliente' o 'items' en
  // validaciones se mapean a 'principal' + abrir/cerrar la card del cliente.
  const [activeTab, setActiveTab] = useState<'principal' | 'notas'>(
    'principal',
  );
  const [clientOpen, setClientOpen] = useState(true);

  const [customer, setCustomer] = useState<CustomerDto | null>(
    prefillFromQuotation?.customer ?? null,
  );

  // Si la cotización venía con cliente libre, mostramos un banner con el
  // snapshot y un CTA "Registrar y continuar". `snapshotPending` controla
  // si el banner sigue visible — se oculta cuando:
  //   - El operador registra (o reusa) un cliente vía el dialog → `customer` setea.
  //   - El operador hace click en "Elegir otro cliente del catálogo" → libera
  //     el combobox normal sin perder el snapshot por si quiere volver.
  const [snapshotPending, setSnapshotPending] = useState<boolean>(
    !!prefillFromQuotation?.customerSnapshot && !prefillFromQuotation.customer,
  );
  const [registerOpen, setRegisterOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDto>('CASH');

  // Bodega de la venta. Default = "Principal" si existe, sino la primera
  // activa. El selector solo se muestra cuando hay 2+ bodegas activas.
  const [warehouseId, setWarehouseId] = useState<string>('');
  const warehouses = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ active: 'true' }),
  });
  const activeWarehouses =
    (Array.isArray(warehouses.data)
      ? warehouses.data
      : warehouses.data?.items ?? []) as WarehouseDto[];

  useEffect(() => {
    if (warehouseId || activeWarehouses.length === 0) return;
    // Si la venta viene del bolso y TODOS los items comparten una misma bodega
    // (activa), la predefinimos. Si hay items de bodegas distintas, caemos al
    // default normal (Principal / primera activa) y el operador elige.
    const bagWhId = unanimousBagWarehouse(initialBagItems);
    if (bagWhId && activeWarehouses.some((w) => w.id === bagWhId)) {
      setWarehouseId(bagWhId);
      return;
    }
    const principal = activeWarehouses.find((w) => w.name === 'Bodega');
    setWarehouseId((principal ?? activeWarehouses[0]!).id);
  }, [warehouseId, activeWarehouses, initialBagItems]);

  const [items, setItems] = useState<ItemRow[]>(() => {
    if (initialBagItems && initialBagItems.length > 0) {
      return initialBagItems.map((it) => ({
        productId: it.productId,
        sku: it.sku ?? '',
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountKind: '$',
        discountValue: '0',
      }));
    }
    return (prefillFromQuotation?.items ?? []).map((it) => ({
      productId: it.productId,
      sku: it.sku,
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discountKind: it.discountPercent != null ? '%' : '$',
      discountValue: it.discountPercent ?? it.discount ?? '0',
    }));
  });
  const [notes, setNotes] = useState<string>(prefillFromQuotation?.notes ?? '');

  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
  });
  const taxRate = Number(settings.data?.taxRate ?? '0.19');
  // Ronda 9 — comisión efectiva según el método elegido.
  const commissionRate = useMemo(() => {
    const s = settings.data;
    if (!s) return 0;
    switch (paymentMethod) {
      case 'CARD_DEBIT':
        return Number(s.cardDebitCommissionRate ?? '0');
      case 'CARD_CREDIT':
        return Number(s.cardCreditCommissionRate ?? '0');
      case 'PAYMENT_LINK':
        return Number(s.paymentLinkCommissionRate ?? '0');
      default:
        return 0;
    }
  }, [settings.data, paymentMethod]);
  const chargesCommission = commissionRate > 0;

  // Stock disponible por producto: se reconsulta cuando cambian los items.
  // Mostramos un badge al lado de la cantidad y bloqueamos el botón final si
  // alguna línea excede.
  const productIds = useMemo(
    () => items.map((it) => it.productId).filter(Boolean),
    [items],
  );
  const stockQuery = useQuery({
    queryKey: ['sales-available-stock', warehouseId, productIds.join(',')],
    queryFn: () => getAvailableStock(productIds, warehouseId),
    enabled: !!warehouseId && productIds.length > 0,
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
  const commissionAmount = chargesCommission ? totalBruto * commissionRate : 0;
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
      invalidateProductCaches(qc);
      toast.success(`Venta ${sale.number} registrada`);
      onSuccess?.(sale);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo registrar la venta')),
  });

  function buildPayload(): CreateSaleInput | null {
    if (!customer) {
      toast.error('Elegí un cliente del catálogo');
      setActiveTab('principal');
      setClientOpen(true);
      return null;
    }
    // El backend exige RUT del cliente para facturar (una cotización puede
    // tener un cliente "lite" sin RUT). Validamos acá para dar un mensaje claro
    // en vez de un error 409 silencioso que dejaba el botón "sin avanzar".
    if (!customer.taxId || customer.taxId.trim() === '') {
      toast.error(
        'El cliente no tiene RUT cargado. Completalo en el perfil del cliente antes de facturar la venta.',
      );
      setActiveTab('principal');
      setClientOpen(true);
      return null;
    }
    if (items.length === 0) {
      toast.error('Agregá al menos un item');
      setActiveTab('principal');
      return null;
    }
    if (items.some((it) => it.qty < 1 || Number(it.unitPrice) <= 0)) {
      toast.error('Revisá cantidad y precio unitario de cada item');
      setActiveTab('principal');
      return null;
    }
    if (stockShortages.length > 0) {
      toast.error('Hay items que exceden el stock disponible');
      setActiveTab('principal');
      return null;
    }

    return {
      customerId: customer.id,
      warehouseId: warehouseId || undefined,
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

  const currentWarehouse =
    activeWarehouses.find((w) => w.id === warehouseId) ?? null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleConfirm();
      }}
      className="space-y-6"
    >
      {/* Selector de bodega visible siempre, fuera de los tabs. La bodega
          define contra qué stock se valida la venta y de dónde se descuentan
          los items al confirmar. */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C] p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 md:w-44 md:shrink-0 dark:text-slate-500">
            <WarehouseIcon className="h-4 w-4 text-slate-400" />
            Bodega de la venta
          </span>
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
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          El stock se evalúa y se descuenta de esta bodega al confirmar.
          Cambiá la bodega si la elegida no tiene stock para todos los items.
        </p>
      </div>

      {stockShortages.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 dark:border-amber-950/30 dark:bg-amber-950/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1 space-y-1 text-xs">
            <p className="font-bold text-amber-700 dark:text-amber-400">
              Stock insuficiente en{' '}
              <strong>{currentWarehouse?.name ?? 'la bodega elegida'}</strong>{' '}
              para {stockShortages.length}{' '}
              {stockShortages.length === 1 ? 'producto' : 'productos'}.
            </p>
            <p className="font-medium text-amber-600/80 dark:text-amber-400/70">
              Probá cambiar la bodega arriba o ajustá las cantidades.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('principal')}
            className="shrink-0 cursor-pointer rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-950/40 dark:bg-transparent dark:text-amber-400"
          >
            Ver items
          </button>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <TabsList className="h-auto gap-1 rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          {/* Ronda 10 — cliente+pago e items conviven en la primera tab. */}
          <TabsTrigger
            value="principal"
            className="rounded-xl px-4 py-2 text-[11.5px] font-bold text-slate-500 transition-all data-[state=active]:bg-[#2F6BFF] data-[state=active]:font-black data-[state=active]:text-white data-[state=active]:shadow-md dark:text-slate-400"
          >
            Cliente y productos ({items.length})
          </TabsTrigger>
          <TabsTrigger
            value="notas"
            className="rounded-xl px-4 py-2 text-[11.5px] font-bold text-slate-500 transition-all data-[state=active]:bg-[#2F6BFF] data-[state=active]:font-black data-[state=active]:text-white data-[state=active]:shadow-md dark:text-slate-400"
          >
            Notas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="principal" className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <button
              type="button"
              onClick={() => setClientOpen((o) => !o)}
              className="flex w-full items-center justify-between border-b p-4 text-left hover:bg-accent/30"
            >
              <div>
                <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Cliente y forma de pago
                </h2>
                <p className="text-xs text-muted-foreground">
                  {customer
                    ? `${customer.name}${customer.taxId ? ` · ${customer.taxId}` : ''} · ${paymentMethod.replace('CARD_', '').replace('_', ' ').toLowerCase()}`
                    : 'Sin cliente seleccionado'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {clientOpen ? 'Ocultar ▴' : 'Editar ▾'}
              </span>
            </button>
            {clientOpen && (
              <div className="space-y-4 p-6">
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cliente</span>

              {snapshotPending && prefillFromQuotation?.customerSnapshot ? (
                <FreeCustomerPrompt
                  snapshot={prefillFromQuotation.customerSnapshot}
                  onRegisterClick={() => setRegisterOpen(true)}
                  onUseCatalogClick={() => setSnapshotPending(false)}
                />
              ) : (
                <>
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
                  {prefillFromQuotation?.customerSnapshot && !snapshotPending && !customer && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="px-0"
                      onClick={() => setSnapshotPending(true)}
                    >
                      ← Volver al snapshot de la cotización
                    </Button>
                  )}
                </>
              )}
            </div>

            {canSeeBreakdown && (
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Método de pago</span>
                {/* Ronda 9 — 5 opciones: efectivo, transferencia, débito,
                    crédito, link de pago. Cada tarjeta de pago tiene su propia
                    comisión configurable en Configuración. */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
                    selected={paymentMethod === 'CARD_DEBIT'}
                    onClick={() => setPaymentMethod('CARD_DEBIT')}
                    icon={<CreditCard className="h-5 w-5" />}
                    label="Débito"
                    hint={`Comisión ${(Number(settings.data?.cardDebitCommissionRate ?? '0') * 100).toFixed(2)}%`}
                  />
                  <PaymentOption
                    selected={paymentMethod === 'CARD_CREDIT'}
                    onClick={() => setPaymentMethod('CARD_CREDIT')}
                    icon={<CreditCard className="h-5 w-5" />}
                    label="Crédito"
                    hint={`Comisión ${(Number(settings.data?.cardCreditCommissionRate ?? '0') * 100).toFixed(2)}%`}
                  />
                  <PaymentOption
                    selected={paymentMethod === 'PAYMENT_LINK'}
                    onClick={() => setPaymentMethod('PAYMENT_LINK')}
                    icon={<Send className="h-5 w-5" />}
                    label="Link de pago"
                    hint={`Comisión ${(Number(settings.data?.paymentLinkCommissionRate ?? '0') * 100).toFixed(2)}%`}
                  />
                </div>
              </div>
            )}
              </div>
            )}
          </div>

          {/* Items debajo del cliente, en el mismo tab (Ronda 10). */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
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
                      className={cn('[&>td]:align-top', exceeds && 'bg-destructive/5')}
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
                                'whitespace-nowrap text-xs tabular-nums',
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {stockShortages.length > 0 && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-3 text-xs font-semibold text-rose-500 dark:border-rose-950/30 dark:bg-rose-950/10 dark:text-rose-400">
              Hay items que exceden el stock disponible. Ajustá las cantidades o
              quitá esas líneas antes de confirmar.
            </div>
          )}
        </TabsContent>

        <TabsContent value="notas" className="space-y-2">
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C] p-6 space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Notas (opcional)</span>
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

      <div className="ml-auto max-w-md space-y-2 rounded-2xl border border-slate-100 bg-white p-5 text-xs shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        {canSeeBreakdown && (
          <>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal neto</span>
              <span className="font-mono font-semibold">{formatCurrency(subtotalNeto.toFixed(2))}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>IVA ({(taxRate * 100).toFixed(0)}%)</span>
              <span className="font-mono font-semibold">{formatCurrency(taxAmount.toFixed(2))}</span>
            </div>
          </>
        )}
        <div
          className={cn(
            'flex justify-between text-sm font-bold text-slate-950 dark:text-white',
            canSeeBreakdown && 'border-t border-slate-100 pt-2 dark:border-slate-850',
          )}
        >
          <span>Total a cobrar</span>
          <span className="font-mono text-base font-black text-[#2F6BFF]">
            {formatCurrency(totalBruto.toFixed(2))}
          </span>
        </div>
        {canSeeBreakdown && chargesCommission && commissionAmount > 0 && (
          <>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Comisión ({(commissionRate * 100).toFixed(2)}%)</span>
              <span className="font-mono">−{formatCurrency(commissionAmount.toFixed(2))}</span>
            </div>
            <div className="flex justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>Neto para caja</span>
              <span className="font-mono">{formatCurrency(netAfterCommission.toFixed(2))}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-850">
        <button
          type="button"
          onClick={() => onCancel?.()}
          disabled={createMut.isPending}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!formValid || createMut.isPending}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Receipt className="h-4 w-4" />
          {createMut.isPending
            ? 'Confirmando…'
            : currentWarehouse
              ? `Confirmar venta en ${currentWarehouse.name}`
              : 'Confirmar venta'}
        </button>
      </div>

      {prefillFromQuotation?.customerSnapshot && (
        <RegisterCustomerFromSnapshotDialog
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          snapshot={prefillFromQuotation.customerSnapshot}
          onResolved={(c) => {
            setCustomer(c);
            setSnapshotPending(false);
          }}
        />
      )}
    </form>
  );
}

/**
 * Banner + card readonly que se muestra cuando la cotización origen tenía
 * cliente libre. El operador puede registrar al cliente (CTA primario) o
 * elegir uno distinto del catálogo (link secundario).
 */
function FreeCustomerPrompt({
  snapshot,
  onRegisterClick,
  onUseCatalogClick,
}: {
  snapshot: CustomerSnapshot;
  onRegisterClick: () => void;
  onUseCatalogClick: () => void;
}) {
  const hasAnyData =
    snapshot.name || snapshot.taxId || snapshot.email || snapshot.phone;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs font-semibold text-amber-700 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-400">
        Esta cotización fue creada con <strong>cliente libre</strong>. Registrá
        al cliente en el catálogo para poder confirmar la venta.
      </div>

      <div className="rounded-md border bg-muted/30 p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Datos del snapshot
        </div>
        {hasAnyData ? (
          <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <SnapshotField label="Nombre" value={snapshot.name} />
            <SnapshotField label="RUT" value={snapshot.taxId} mono />
            <SnapshotField label="Email" value={snapshot.email} />
            <SnapshotField label="Teléfono" value={snapshot.phone} mono />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            La cotización no tenía datos del cliente. Cargalos manualmente al
            registrar.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRegisterClick}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90"
        >
          Registrar y continuar
        </button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0"
          onClick={onUseCatalogClick}
        >
          Elegir otro cliente del catálogo
        </Button>
      </div>
    </div>
  );
}

function SnapshotField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm', mono && 'font-mono')}>
        {value && value.trim() ? value : <span className="text-muted-foreground italic">—</span>}
      </dd>
    </div>
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
        // Incluir borradores ("clientes libres") para poder seleccionarlos.
        draft: 'all',
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
