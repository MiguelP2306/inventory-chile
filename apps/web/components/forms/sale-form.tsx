'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Calendar as CalendarIcon, CreditCard, Receipt, Save, Search, Send, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Permission, useCan, useIsAdmin } from '@/lib/current-user-context';
import { pickDefaultWarehouse } from '@/lib/default-warehouse';
import { formatCurrency, todayIso } from '@/lib/format';
import {
  createSale,
  createSaleDraft,
  getAvailableStock,
  updateSaleDraft,
  type AvailableStockRow,
} from '@/lib/sales-api';
import { cn } from '@/lib/utils';
import { listWarehouses } from '@/lib/warehouses-api';
import {
  computeTotalsPreview,
  serializeGlobalDiscount,
  type DiscountKind,
} from '@/lib/document-discount';
import type {
  CreateSaleInput,
  CustomerDto,
  PaymentMethodDto,
  SaleDraftDto,
  SaleDto,
  SaveSaleDraftInput,
  WarehouseDto,
} from '@inventory/shared';

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
  // Observación libre por ítem (opcional). Se copia desde la cotización.
  observation?: string | null;
  // Servicio (envío/flete): no descuenta stock, no se valida disponibilidad.
  isService?: boolean;
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
      observation: string | null;
      // Servicio (envío/flete): no se valida stock al convertir.
      isService?: boolean;
    }>;
    notes: string | null;
    // Descuento sobre el total que traía la cotización. Se traspasa a la venta
    // para que el cliente pague lo que se le cotizó; queda editable.
    discount?: string | null;
    discountPercent?: string | null;
  };
  /**
   * Items del bolso para prellenar la venta sin pasar por una cotización.
   * No traen cliente — el operador lo elige acá.
   */
  initialBagItems?: SaleBagItem[];
  /**
   * Prefill al convertir una guía de despacho INDEPENDIENTE en venta. Trae el
   * cliente y los items (con el precio actual del producto). El
   * `dispatchNoteId` viaja al backend en el create para linkear la guía
   * (marcarla como convertida) en la misma transacción.
   */
  prefillFromDispatch?: {
    dispatchNoteId: string;
    customer: CustomerDto | null;
    warehouseId: string | null;
    // Espejo de la guía: la venta arranca con los mismos precios, descuentos y
    // régimen de IVA que el documento que ya recibió el cliente.
    vatExempt?: boolean;
    items: Array<{
      productId: string;
      sku: string | null;
      name: string;
      qty: number;
      unitPrice: string;
      discount: string;
    }>;
  };
  /**
   * Borrador parkeado que se está retomando. Trae los ítems y la cabecera tal
   * como quedaron; el form sigue autoguardando sobre ESE mismo borrador (no
   * crea uno nuevo) y al confirmar la venta el backend lo elimina.
   */
  initialDraft?: SaleDraftDto | null;
  /**
   * Cliente completo del borrador. El DTO del borrador trae una forma reducida
   * (id/nombre/RUT), así que la página lo resuelve con `getCustomer` y lo pasa
   * acá: el form necesita el CustomerDto entero para validar el RUT.
   */
  initialCustomer?: CustomerDto | null;
  onSuccess?: (sale: SaleDto) => void;
  onCancel?: () => void;
}

export function SaleForm({
  prefillFromQuotation,
  initialBagItems,
  prefillFromDispatch,
  initialDraft,
  initialCustomer,
  onSuccess,
  onCancel,
}: Props) {
  const qc = useQueryClient();
  const canSeeBreakdown = useCan(Permission.SALE_VIEW_FINANCIAL_BREAKDOWN);
  // Conversión de guía de despacho: el stock YA se descontó al emitir la guía,
  // así que acá no validamos ni bloqueamos por stock, y la bodega queda fijada
  // a la de la guía (el backend la fuerza igual). El selector se oculta.
  const isDispatchConversion = !!prefillFromDispatch;
  // Ronda 10 — tabs simplificadas: cliente + items en una sola vista
  // ('principal'); notas aparte. Las referencias a 'cliente' o 'items' en
  // validaciones se mapean a 'principal' + abrir/cerrar la card del cliente.
  const [activeTab, setActiveTab] = useState<'principal' | 'notas'>(
    'principal',
  );
  const [clientOpen, setClientOpen] = useState(true);

  const [customer, setCustomer] = useState<CustomerDto | null>(
    initialCustomer ??
      prefillFromQuotation?.customer ??
      prefillFromDispatch?.customer ??
      null,
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

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDto>(
    initialDraft?.paymentMethod ?? 'CASH',
  );

  // Venta afecta a IVA por default (19%). Si se desactiva → venta NO afecta
  // (sin documento): el backend la guarda con IVA 0 y no entra al Reporte de IVA.
  const [vatExempt, setVatExempt] = useState(
    initialDraft?.vatExempt ?? prefillFromDispatch?.vatExempt ?? false,
  );

  // Bodega de la venta. Default = "Tienda" si existe, sino la primera
  // activa. El selector solo se muestra cuando hay 2+ bodegas activas.
  const [warehouseId, setWarehouseId] = useState<string>(
    initialDraft?.warehouseId ?? prefillFromDispatch?.warehouseId ?? '',
  );
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
    // default normal ("Tienda") y el operador elige.
    const bagWhId = unanimousBagWarehouse(initialBagItems);
    if (bagWhId && activeWarehouses.some((w) => w.id === bagWhId)) {
      setWarehouseId(bagWhId);
      return;
    }
    const preferred = pickDefaultWarehouse(activeWarehouses);
    if (preferred) setWarehouseId(preferred.id);
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
    // El borrador gana sobre cualquier otro prefill: es el estado más reciente
    // que el operador dejó guardado a propósito.
    if (initialDraft && (initialDraft.items ?? []).length > 0) {
      return (initialDraft.items ?? []).map((it) => ({
        productId: it.productId,
        sku: it.product?.sku ?? '',
        name: it.product?.name ?? '',
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountKind: (it.discountPercent != null ? '%' : '$') as DiscountKind,
        discountValue: it.discountPercent ?? it.discount ?? '0',
        observation: it.observation ?? null,
      }));
    }
    if (prefillFromDispatch && prefillFromDispatch.items.length > 0) {
      return prefillFromDispatch.items.map((it) => ({
        productId: it.productId,
        sku: it.sku ?? '',
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountKind: '$',
        discountValue: it.discount,
      }));
    }
    return (prefillFromQuotation?.items ?? []).map((it) => ({
      productId: it.productId,
      sku: it.sku,
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discountKind: (it.discountPercent != null ? '%' : '$') as DiscountKind,
      discountValue: it.discountPercent ?? it.discount ?? '0',
      observation: it.observation ?? null,
      isService: it.isService ?? false,
    }));
  });
  const [notes, setNotes] = useState<string>(
    initialDraft?.notes ?? prefillFromQuotation?.notes ?? '',
  );

  // Descuento sobre el total de la venta, aparte de los descuentos por línea.
  // Se hereda de la cotización cuando la venta la convierte, respetando la
  // representación original ($ o %).
  const discountSource = initialDraft ?? prefillFromQuotation;
  const [globalDiscountKind, setGlobalDiscountKind] = useState<DiscountKind>(
    discountSource?.discountPercent != null ? '%' : '$',
  );
  const [globalDiscountValue, setGlobalDiscountValue] = useState<string>(() => {
    if (discountSource?.discountPercent != null) {
      return String(Number(discountSource.discountPercent));
    }
    const amount = Number(discountSource?.discount ?? 0);
    return amount > 0 ? String(amount) : '0';
  });

  // Fecha de la venta. Solo el admin puede cambiarla (backdating); el resto
  // registra siempre con hoy. El backend reaplica esta regla por seguridad.
  const isAdmin = useIsAdmin();
  const [saleDate, setSaleDate] = useState<string>(todayIso());

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
    () => items.filter((it) => !it.isService).map((it) => it.productId).filter(Boolean),
    [items],
  );
  const stockQuery = useQuery({
    queryKey: ['sales-available-stock', warehouseId, productIds.join(',')],
    queryFn: () => getAvailableStock(productIds, warehouseId),
    // En conversión de guía el stock ya salió; no lo consultamos ni validamos.
    enabled: !isDispatchConversion && !!warehouseId && productIds.length > 0,
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

  // Si la venta es NO afecta a IVA: neto = total y IVA = 0 (espejo del backend).
  const effectiveTaxRate = vatExempt ? 0 : taxRate;
  const {
    grossBeforeDiscount,
    discountAmount: globalDiscountAmount,
    subtotalNeto,
    taxAmount,
    totalBruto,
  } = useMemo(
    () =>
      computeTotalsPreview(
        itemsForCalc.map((it) => it.subtotal),
        effectiveTaxRate,
        globalDiscountKind,
        globalDiscountValue,
      ),
    [itemsForCalc, effectiveTaxRate, globalDiscountKind, globalDiscountValue],
  );
  // La comisión se cobra sobre lo que realmente paga el cliente, o sea sobre el
  // total ya rebajado por el descuento global.
  const commissionAmount = chargesCommission ? totalBruto * commissionRate : 0;
  const netAfterCommission = totalBruto - commissionAmount;

  const stockShortages = isDispatchConversion
    ? []
    : items
        .map((it, idx) => {
          if (it.isService) return null; // los servicios no tienen stock
          const available = stockMap.get(it.productId);
          if (available == null) return null;
          if (it.qty > available) return { idx, available, requested: it.qty };
          return null;
        })
        .filter(
          (x): x is { idx: number; available: number; requested: number } =>
            x !== null,
        );

  const itemsHaveErrors =
    items.length === 0 ||
    items.some((it) => it.qty < 1 || Number(it.unitPrice) <= 0) ||
    stockShortages.length > 0;

  const formValid = !!customer && !itemsHaveErrors;

  /* ------------------------------------------------------------------
   * Borrador ("venta parkeada")
   *
   * Espeja el mecanismo de cotizaciones pero con dos diferencias:
   *  · Un borrador de venta NO consume correlativo ni toca stock, así que
   *    autoguardar es barato y sin consecuencias contables.
   *  · Solo se autoguarda si hay al menos un ítem válido. Un formulario
   *    vacío recién abierto no debe generar borradores fantasma.
   * ----------------------------------------------------------------*/
  // Espeja `createMut.isPending`: el autoguardado corre dentro de un
  // setTimeout, así que necesita leer el estado actual y no el capturado.
  const createMutPendingRef = useRef(false);
  const draftIdRef = useRef<string | null>(initialDraft?.id ?? null);
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved'>(
    initialDraft ? 'saved' : 'idle',
  );
  const savingDraftRef = useRef(false);
  const draftDirtyRef = useRef(false);
  const draftFirstRunRef = useRef(true);

  /** `null` si todavía no hay nada que valga la pena guardar. */
  function buildDraftPayload(): SaveSaleDraftInput | null {
    const clean = itemsForCalc
      .filter((it) => it.productId && it.qty >= 1 && Number(it.unitPrice) > 0)
      .map((it) => {
        const dv = Number(it.discountValue) || 0;
        const pct = it.discountKind === '%';
        return {
          productId: it.productId,
          qty: Number(it.qty),
          unitPrice: Number(it.unitPrice).toFixed(2),
          discount: pct ? '0' : Math.max(0, dv).toFixed(2),
          discountPercent: pct
            ? Math.max(0, Math.min(100, dv)).toFixed(2)
            : null,
          observation: it.observation?.trim() || null,
        };
      });
    if (clean.length === 0) return null;

    return {
      customerId: customer?.id ?? null,
      warehouseId: warehouseId || null,
      paymentMethod,
      vatExempt,
      notes: notes.trim() || null,
      ...serializeGlobalDiscount(
        globalDiscountKind,
        globalDiscountValue,
        grossBeforeDiscount,
      ),
      quotationId: prefillFromQuotation?.quotationId ?? null,
      dispatchNoteId: prefillFromDispatch?.dispatchNoteId ?? null,
      items: clean,
    };
  }

  // Ref reasignada en cada render para capturar siempre el estado fresco sin
  // closures viejos dentro del setTimeout del debounce.
  const doSaveDraftRef = useRef<(silent: boolean) => Promise<void>>(
    async () => {},
  );
  doSaveDraftRef.current = async (silent: boolean) => {
    if (createMutPendingRef.current) return; // venta confirmándose
    if (savingDraftRef.current) {
      draftDirtyRef.current = true; // cambió mientras guardaba → re-disparar
      return;
    }
    const payload = buildDraftPayload();
    if (!payload) {
      if (!silent) toast.error('Agregá al menos un producto para guardar');
      return;
    }

    savingDraftRef.current = true;
    setDraftState('saving');
    try {
      const existingId = draftIdRef.current;
      const saved = existingId
        ? await updateSaleDraft(existingId, payload)
        : await createSaleDraft(payload);
      draftIdRef.current = saved.id;
      setDraftState('saved');
      qc.invalidateQueries({ queryKey: ['sale-drafts'] });
      if (!silent) toast.success('Borrador guardado');
    } catch (e) {
      setDraftState('idle');
      // El autoguardado es silencioso para no interrumpir la carga; el
      // guardado manual sí reporta, porque el operador está esperando.
      if (!silent) toast.error(apiErrorMessage(e));
    } finally {
      savingDraftRef.current = false;
      if (draftDirtyRef.current) {
        draftDirtyRef.current = false;
        void doSaveDraftRef.current(true);
      }
    }
  };

  // Firma estable de lo guardable: cambia solo con lo que el operador edita.
  // No incluye datos de stock, para no autoguardar al terminar de cargar.
  const draftSig = useMemo(
    () =>
      JSON.stringify({
        c: customer?.id ?? null,
        w: warehouseId,
        p: paymentMethod,
        v: vatExempt,
        n: notes,
        gk: globalDiscountKind,
        gv: globalDiscountValue,
        i: items.map((it) => ({
          p: it.productId,
          q: it.qty,
          u: it.unitPrice,
          dk: it.discountKind,
          dv: it.discountValue,
          o: it.observation,
        })),
      }),
    [
      customer,
      warehouseId,
      paymentMethod,
      vatExempt,
      notes,
      globalDiscountKind,
      globalDiscountValue,
      items,
    ],
  );

  useEffect(() => {
    // No autoguardar en el primer render: al montar (o al retomar un borrador)
    // no hay nada nuevo que persistir.
    if (draftFirstRunRef.current) {
      draftFirstRunRef.current = false;
      return;
    }
    const t = setTimeout(() => void doSaveDraftRef.current(true), 1200);
    return () => clearTimeout(t);
  }, [draftSig]);

  const createMut = useMutation({
    mutationFn: (payload: CreateSaleInput) => {
      // Frena el autoguardado mientras la venta se está confirmando: si el
      // backend borra el borrador y el debounce lo reescribiera después,
      // quedaría un borrador zombi de una venta ya registrada.
      createMutPendingRef.current = true;
      return createSale(payload);
    },
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      // El backend borró el borrador dentro de la transacción; refrescamos la
      // lista para que no siga apareciendo.
      qc.invalidateQueries({ queryKey: ['sale-drafts'] });
      draftIdRef.current = null;
      invalidateProductCaches(qc);
      toast.success(`Venta ${sale.number} registrada`);
      onSuccess?.(sale);
    },
    onError: (err) => {
      // Falló la venta: el borrador sigue vivo y el autoguardado se reanuda,
      // así el operador no pierde lo que tenía cargado.
      createMutPendingRef.current = false;
      toast.error(apiErrorMessage(err, 'No se pudo registrar la venta'));
    },
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
      vatExempt,
      // Solo mandamos fecha si es admin; el backend la ignora para no-admins.
      ...(isAdmin ? { date: saleDate } : {}),
      notes: notes.trim() || null,
      ...serializeGlobalDiscount(
        globalDiscountKind,
        globalDiscountValue,
        grossBeforeDiscount,
      ),
      // Si la venta viene de un borrador, el backend lo elimina en la misma
      // transacción del create.
      draftId: draftIdRef.current,
      quotationId: prefillFromQuotation?.quotationId ?? null,
      dispatchNoteId: prefillFromDispatch?.dispatchNoteId ?? null,
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
            observation: it.observation?.trim() || null,
          };
        }
        return {
          productId: it.productId,
          qty,
          unitPrice: unit.toFixed(2),
          discount: Math.max(0, dv).toFixed(2),
          discountPercent: null,
          observation: it.observation?.trim() || null,
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
          los items al confirmar. En conversión de guía se oculta: el stock ya
          salió de la bodega de la guía y esa bodega queda fija. */}
      <div
        className={cn(
          'rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C] p-4',
          isDispatchConversion && 'hidden',
        )}
      >
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

      {/* Fecha de la venta — solo admin puede registrar con otra fecha
          (backdating o futura). Para no-admins el campo no se muestra y la
          venta queda con la fecha de hoy. */}
      {isAdmin && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 md:w-44 md:shrink-0 dark:text-slate-500">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              Fecha de la venta
            </span>
            <Input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="md:max-w-xs"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Por defecto es hoy. Como administrador podés registrar la venta con
            cualquier fecha (anterior o posterior).
          </p>
        </div>
      )}

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

            {canSeeBreakdown && (
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Documento
                </span>
                <button
                  type="button"
                  onClick={() => setVatExempt((v) => !v)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                      !vatExempt
                        ? 'border-[#2F6BFF] bg-[#2F6BFF]'
                        : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-[1px] h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                        !vatExempt ? 'left-[17px]' : 'left-[1px]'
                      }`}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Afecta a IVA (19%)
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {vatExempt
                        ? 'NO afecta — venta sin documento: no registra IVA ni entra al Reporte de IVA.'
                        : 'Venta afecta a IVA. Desactivá si es una venta sin documento (no afecta).'}
                    </span>
                  </span>
                </button>
              </div>
            )}
              </div>
            )}
          </div>

          {/* Items debajo del cliente, en el mismo tab (Ronda 10). */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <h2 className="font-medium">Items de la venta</h2>
              <div className="flex flex-wrap items-center gap-2">
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
                {/* Servicios (envío/flete): no descuentan stock; el precio
                    sugerido queda editable en la línea. */}
                <ProductPicker
                  isService="true"
                  buttonLabel="Agregar servicio"
                  title="Elegir servicio"
                  subtitle="Envío, flete u otro cargo. No afecta inventario."
                  onPick={(p) => {
                    if (items.some((i) => i.productId === p.id)) {
                      toast.info('El servicio ya está en la lista');
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
                        isService: true,
                      },
                    ]);
                  }}
                />
              </div>
            </div>
            {/* `table-fixed`: sin esto el layout automático repartía el ancho
                según el contenido y el input de precio quedaba cortado. Con
                anchos fijos, Producto se queda con el sobrante y el resto
                respeta lo declarado. */}
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  {/* Anchos ajustados para que el precio unitario se vea
                      completo: la tabla compite por el ancho del modal, así que
                      Cant. y Descuento van al mínimo necesario. */}
                  <TableHead className="w-[112px]">SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[88px] text-right">
                    Cant.
                  </TableHead>
                  <TableHead className="w-[148px] text-right">
                    P. Unit (bruto)
                  </TableHead>
                  <TableHead className="w-[120px] text-right">Descuento</TableHead>
                  <TableHead className="w-[120px] text-right">Subtotal</TableHead>
                  <TableHead className="w-[48px]" />
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
                      <TableCell
                        className="truncate font-mono text-xs"
                        title={it.sku ?? undefined}
                      >
                        {it.sku}
                      </TableCell>
                      <TableCell className="max-w-[260px] align-top">
                        <div className="flex flex-col gap-1">
                          <span className="truncate">{it.name}</span>
                          {/* Observación por ítem (desplegable). null = oculta. */}
                          {it.observation == null ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateItem(idx, { observation: '' })
                              }
                              className="w-fit text-xs font-semibold text-[#2F6BFF] hover:underline"
                            >
                              + Observación
                            </button>
                          ) : (
                            <div className="space-y-1">
                              <Textarea
                                value={it.observation}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    observation: e.target.value,
                                  })
                                }
                                placeholder="Observación para este producto…"
                                rows={2}
                                className="text-xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateItem(idx, { observation: null })
                                }
                                className="text-xs text-muted-foreground hover:underline"
                              >
                                Quitar observación
                              </button>
                            </div>
                          )}
                        </div>
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
                            // Sin `whitespace-nowrap`: ensanchaba la columna
                            // Cant. y dejaba el precio unitario cortado.
                            <div
                              className={cn(
                                'text-xs tabular-nums leading-tight',
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
        {/* Descuento sobre el total, aparte de los descuentos por línea. NO va
            gateado por `canSeeBreakdown`: es parte del precio que se le cobra
            al cliente, no del desglose de márgenes. */}
        <div className="flex items-center justify-between gap-3 text-slate-500 dark:text-slate-400">
          <span>Descuento global</span>
          <div className="flex h-9 w-32 items-stretch overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring">
            <input
              type="text"
              inputMode="decimal"
              value={globalDiscountValue}
              onChange={(e) => setGlobalDiscountValue(e.target.value)}
              className="min-w-0 flex-1 bg-background px-2 text-right text-sm outline-none"
              aria-label="Valor del descuento global"
            />
            <button
              type="button"
              onClick={() =>
                setGlobalDiscountKind(globalDiscountKind === '$' ? '%' : '$')
              }
              title={
                globalDiscountKind === '$'
                  ? 'Descuento en monto fijo. Click para cambiar a porcentaje.'
                  : 'Descuento porcentual. Click para cambiar a monto fijo.'
              }
              aria-label={
                globalDiscountKind === '$'
                  ? 'Cambiar a porcentaje'
                  : 'Cambiar a monto fijo'
              }
              className="flex w-9 shrink-0 items-center justify-center border-l bg-muted text-sm font-semibold text-foreground hover:bg-muted/70"
            >
              {globalDiscountKind}
            </button>
          </div>
        </div>
        {globalDiscountAmount > 0 && (
          <>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal bruto</span>
              <span className="font-mono font-semibold">
                {formatCurrency(grossBeforeDiscount.toFixed(2))}
              </span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>
                Descuento aplicado
                {globalDiscountKind === '%'
                  ? ` (${Math.max(0, Math.min(100, Number(globalDiscountValue) || 0))}%)`
                  : ''}
              </span>
              <span className="font-mono font-semibold">
                −{formatCurrency(globalDiscountAmount.toFixed(2))}
              </span>
            </div>
          </>
        )}
        {canSeeBreakdown && (
          <>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal neto</span>
              <span className="font-mono font-semibold">{formatCurrency(subtotalNeto.toFixed(2))}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>IVA ({(effectiveTaxRate * 100).toFixed(0)}%)</span>
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
        {draftState !== 'idle' && (
          <span className="mr-auto text-[11px] font-semibold text-slate-400">
            {draftState === 'saving' ? 'Guardando borrador…' : '✓ Borrador guardado'}
          </span>
        )}
        <button
          type="button"
          onClick={() => onCancel?.()}
          disabled={createMut.isPending}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          Cancelar
        </button>
        {/* Guardar borrador NO exige cliente ni forma de pago: parkear una
            venta a medias es justamente el caso de uso. */}
        <button
          type="button"
          onClick={() => void doSaveDraftRef.current(false)}
          disabled={createMut.isPending || draftState === 'saving'}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          <Save className="h-4 w-4" />
          Guardar borrador
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
