'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Mail,
  MessageCircle,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Controller,
  useForm,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ProductPicker } from '@/components/product-picker';
import { TemporaryProductButton } from '@/components/temporary-product-button';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
  createQuotation,
  sendEmail,
  sendWhatsapp,
  updateQuotation,
  type CreateQuotationInput,
  type CreateQuotationItemInput,
} from '@/lib/quotations-api';
import { getAvailableStock, type AvailableStockRow } from '@/lib/sales-api';
import { WhatsappSendDialog } from '@/components/whatsapp-send-dialog';
import { isValidPhone, normalizePhone } from '@/lib/validators/phone';
import { isValidRut, normalizeRut } from '@/lib/validators/rut';
import { cn } from '@/lib/utils';
import type { CustomerDto, QuotationDto } from '@inventory/shared';

type ClientType = 'catalog' | 'free';
type DiscountKind = '$' | '%';

interface ItemRow {
  // Ronda 9 — productId puede ser null para productos temporales creados
  // al vuelo desde el ProductPicker. sku también es string|null porque puede
  // ser un SKU auto-generado del catálogo o el snapshot del producto temporal.
  productId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: string;
  discountKind: DiscountKind;
  discountValue: string;
  // Ronda 9 — snapshot del producto temporal cuando productId es null.
  tempProductPartNumber?: string | null;
  isTemporary?: boolean;
}

const schema = z
  .object({
    clientType: z.enum(['catalog', 'free']),
    customerId: z.string().nullable().optional(),
    customerNameSnapshot: z.string().optional().or(z.literal('')),
    customerPhoneSnapshot: z.string().optional().or(z.literal('')),
    customerEmailSnapshot: z
      .string()
      .email('Email inválido')
      .or(z.literal(''))
      .optional()
      .nullable(),
    customerTaxIdSnapshot: z.string().optional().or(z.literal('')),
    date: z.string().min(1, 'Fecha requerida'),
    validUntil: z.string().min(1, 'Validez requerida'),
    notes: z.string().optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (val.clientType === 'catalog') {
      if (!val.customerId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerId'],
          message: 'Elegí un cliente del catálogo',
        });
      }
    } else {
      if (
        val.customerPhoneSnapshot &&
        val.customerPhoneSnapshot.trim() &&
        !isValidPhone(val.customerPhoneSnapshot)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerPhoneSnapshot'],
          message: 'Teléfono inválido (ej: +56 9 1234 5678)',
        });
      }
      // RUT opcional pero validado si viene con contenido.
      if (
        val.customerTaxIdSnapshot &&
        val.customerTaxIdSnapshot.trim() &&
        !isValidRut(val.customerTaxIdSnapshot)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customerTaxIdSnapshot'],
          message: 'RUT inválido (formato 12345678-9)',
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

export interface QuotationBagItem {
  productId: string;
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: string;
}

interface Props {
  mode: 'create' | 'edit';
  initialData?: QuotationDto;
  /**
   * Items provenientes del bolso (localStorage). Si vienen seteados en modo
   * create, sobrescriben `initialData?.items` y se cargan como filas
   * editables del cuerpo de la cotización.
   */
  initialBagItems?: QuotationBagItem[];
  onSuccess?: (q: QuotationDto) => void;
  onCancel?: () => void;
  /**
   * Cuando el form se renderiza dentro de un Dialog/modal, el header con
   * título y botones se omite — el caller (modal wrapper) provee los suyos
   * y renderea los botones de acción debajo del cuerpo del form.
   */
  embedded?: boolean;
}

export function QuotationForm({
  mode,
  initialData,
  initialBagItems,
  onSuccess,
  onCancel,
  embedded = false,
}: Props) {
  const qc = useQueryClient();
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (initialBagItems && initialBagItems.length > 0) {
      return initialBagItems.map((it) => ({
        productId: it.productId,
        sku: it.sku,
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountKind: '$',
        discountValue: '0',
      }));
    }
    return itemsFromQuotation(initialData);
  });
  // Ronda 10 — tabs simplificadas: la sección "Cliente" y la tabla de items
  // viven en la misma tab para que el flujo sea más rápido. La tab "Notas"
  // queda aparte. Cuando una validación apunta a "items" o "cliente", todo
  // resuelve a 'principal'.
  const [activeTab, setActiveTab] = useState<'principal' | 'notas'>(
    'principal',
  );
  // Card del cliente colapsable. Empieza abierta; el operador la cierra
  // con un click una vez que ya cargó los datos para ganar espacio.
  const [clientOpen, setClientOpen] = useState(true);

  // Cliente seleccionado del catálogo (necesario para validar contacto antes
  // de "Guardar y enviar"). Sólo se popula en modo catalog.
  const [catalogCustomer, setCatalogCustomer] = useState<CustomerDto | null>(
    initialData?.customer ?? null,
  );

  // Cuando "Guardar y enviar" tuvo éxito el save pero falló el envío runtime
  // (Resend caído, etc.), guardamos el id de la cotización ya creada para que
  // un reintento NO genere un duplicado. Se limpia al desmontar / abrir nuevo
  // modal (el wrapper usa `key` para remount limpio).
  const [savedQuotationId, setSavedQuotationId] = useState<string | null>(
    initialData?.id ?? null,
  );
  // El id también vive en un ref para que el guardado manual y el autoguardado
  // compartan el MISMO id sin closures viejos: así nunca se crean dos
  // cotizaciones aunque ambos corran casi a la vez.
  const savedQuotationIdRef = useRef<string | null>(initialData?.id ?? null);
  const setSavedId = (qid: string) => {
    savedQuotationIdRef.current = qid;
    setSavedQuotationId(qid);
  };

  // Envío por WhatsApp: tras guardar, abrimos el MISMO diálogo del detalle
  // (escribir número o "elegir contacto") en vez de frenar pidiendo teléfono.
  // Guardamos la cotización ya persistida + el teléfono conocido para mostrarlo.
  const [waCtx, setWaCtx] = useState<{
    quotation: QuotationDto;
    phone: string | null;
  } | null>(null);

  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
  });
  const taxRate = Number(settings.data?.taxRate ?? '0.19');
  const defaultValidityDays = settings.data?.defaultValidityDays ?? 15;

  const initialClientType: ClientType = initialData?.customerView.fromCatalog
    ? 'catalog'
    : initialData
      ? 'free'
      : 'catalog';

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientType: initialClientType,
      customerId: initialData?.customerId ?? null,
      customerNameSnapshot: initialData?.customerNameSnapshot ?? '',
      customerPhoneSnapshot: initialData?.customerPhoneSnapshot ?? '',
      customerEmailSnapshot: initialData?.customerEmailSnapshot ?? '',
      customerTaxIdSnapshot: initialData?.customerTaxIdSnapshot ?? '',
      date: initialData ? initialData.date.slice(0, 10) : todayIso(),
      validUntil: initialData?.validUntil
        ? initialData.validUntil.slice(0, 10)
        : addDaysIso(defaultValidityDays),
      notes: initialData?.notes ?? '',
    },
  });

  // Si el form arranca sin initialData, necesitamos recalcular validUntil
  // cuando lleguen los settings (defaultValidityDays). Sólo si el campo no
  // fue tocado por el usuario.
  useEffect(() => {
    if (initialData) return;
    if (form.formState.dirtyFields.validUntil) return;
    form.setValue('validUntil', addDaysIso(defaultValidityDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValidityDays]);

  const clientType = form.watch('clientType');

  // Stock disponible por producto: se reconsulta cuando cambian los items.
  // En cotizaciones es **informativo** (a diferencia de ventas, no bloquea).
  // Si el operador agrega más cantidad que el disponible se muestra warning
  // ámbar — el stock se vuelve a validar al convertir a venta.
  const productIds = useMemo(
    // Ronda 9 — sólo IDs reales (productos temporales tienen productId=null).
    (): string[] =>
      items.map((it) => it.productId).filter((id): id is string => !!id),
    [items],
  );
  // Ronda 7 — Cotizaciones no se atan a una bodega específica (la conversión
  // a venta es la que elige una), por eso pedimos el stock AGREGADO de todas
  // las bodegas activas. Antes el endpoint devolvía solo el stock de la
  // bodega default y subestimaba la disponibilidad real.
  const stockQuery = useQuery({
    queryKey: ['quotation-available-stock-agg', productIds.join(',')],
    queryFn: () => getAvailableStock(productIds, undefined, true),
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
            ? Math.max(0, Math.min(100, dv)) * gross / 100
            : Math.max(0, dv);
        const subtotal = Math.max(0, gross - discount);
        return { ...it, gross, discount, subtotal };
      }),
    [items],
  );

  const totalBruto = itemsForCalc.reduce((acc, it) => acc + it.subtotal, 0);
  const subtotalNeto = totalBruto / (1 + taxRate);
  const taxAmount = totalBruto - subtotalNeto;

  // Items que exceden el stock disponible. La validación NO bloquea el guardado
  // — solo informa. El stock se vuelve a chequear al convertir a venta.
  const stockShortages = items
    .map((it) => {
      // Ronda 9 — productos temporales no consumen stock (no existen en
      // el catálogo). Se omiten del warning.
      if (!it.productId) return null;
      const available = stockMap.get(it.productId);
      if (available == null) return null;
      if (it.qty > available) {
        return {
          productId: it.productId,
          sku: it.sku ?? '',
          name: it.name,
          requested: it.qty,
          available,
        };
      }
      return null;
    })
    .filter(
      (
        x,
      ): x is {
        productId: string;
        sku: string;
        name: string;
        requested: number;
        available: number;
      } => x !== null,
    );

  const buildPayload = (): CreateQuotationInput | null => {
    const values = form.getValues();
    const clean: CreateQuotationItemInput[] = itemsForCalc.map((it) => {
      const qty = Number(it.qty) || 0;
      const unit = Number(it.unitPrice) || 0;
      const gross = qty * unit;
      const dv = Number(it.discountValue) || 0;
      let discount = 0;
      let discountPercent: string | null = null;
      if (it.discountKind === '%') {
        const pct = Math.max(0, Math.min(100, dv));
        discount = (gross * pct) / 100;
        discountPercent = pct.toFixed(2);
      } else {
        discount = Math.max(0, dv);
      }
      // Ronda 9 — si el item es temporal (sin productId), enviamos los
      // campos snapshot para que el backend los persista en quotation_items.
      return {
        productId: it.productId,
        tempProductName: it.productId ? null : it.name,
        tempProductSku: it.productId ? null : it.sku ?? null,
        tempProductPartNumber: it.productId
          ? null
          : it.tempProductPartNumber ?? null,
        qty,
        unitPrice: unit.toFixed(2),
        discount: discount.toFixed(2),
        discountPercent,
      };
    });

    if (clean.length === 0) {
      toast.error('Agregá al menos un item');
      setActiveTab('principal');
      return null;
    }
    if (clean.some((i) => i.qty < 1 || Number(i.unitPrice) <= 0)) {
      toast.error('Revisá cantidad y precio unitario de los items');
      setActiveTab('principal');
      return null;
    }

    const fromCatalog = values.clientType === 'catalog';
    const payload: CreateQuotationInput = {
      customerId: fromCatalog ? values.customerId ?? null : null,
      customerNameSnapshot: fromCatalog
        ? null
        : (values.customerNameSnapshot ?? '').trim() || null,
      customerPhoneSnapshot: fromCatalog
        ? null
        : (values.customerPhoneSnapshot ?? '').trim()
          ? normalizePhone((values.customerPhoneSnapshot ?? '').trim())
          : null,
      customerEmailSnapshot: fromCatalog
        ? null
        : (values.customerEmailSnapshot ?? '')?.trim() || null,
      customerTaxIdSnapshot: fromCatalog
        ? null
        : (values.customerTaxIdSnapshot ?? '').trim()
          ? normalizeRut((values.customerTaxIdSnapshot ?? '').trim())
          : null,
      date: values.date,
      validUntil: values.validUntil,
      notes: (values.notes ?? '').trim() || null,
      items: clean,
    };
    return payload;
  };

  // Fase 2 — payload TOLERANTE para el autoguardado (borrador). No muestra
  // toasts ni cambia de tab: si falta el cliente o no hay ítems completos,
  // devuelve null y simplemente no se autoguarda todavía. Filtra los ítems a
  // medio cargar (sin producto/nombre o sin precio/cantidad) en lugar de
  // rechazar todo — el backend exige ≥1 ítem válido para crear.
  const buildDraftPayload = (): CreateQuotationInput | null => {
    const values = form.getValues();
    const fromCatalog = values.clientType === 'catalog';
    const hasCustomer = fromCatalog
      ? !!values.customerId
      : !!(values.customerNameSnapshot ?? '').trim();
    if (!hasCustomer) return null;

    const clean: CreateQuotationItemInput[] = itemsForCalc
      .map((it) => {
        const qty = Number(it.qty) || 0;
        const unit = Number(it.unitPrice) || 0;
        const gross = qty * unit;
        const dv = Number(it.discountValue) || 0;
        let discount = 0;
        let discountPercent: string | null = null;
        if (it.discountKind === '%') {
          const pct = Math.max(0, Math.min(100, dv));
          discount = (gross * pct) / 100;
          discountPercent = pct.toFixed(2);
        } else {
          discount = Math.max(0, dv);
        }
        return {
          productId: it.productId,
          tempProductName: it.productId ? null : it.name,
          tempProductSku: it.productId ? null : it.sku ?? null,
          tempProductPartNumber: it.productId
            ? null
            : it.tempProductPartNumber ?? null,
          qty,
          unitPrice: unit.toFixed(2),
          discount: discount.toFixed(2),
          discountPercent,
        };
      })
      .filter(
        (i) =>
          i.qty >= 1 &&
          Number(i.unitPrice) > 0 &&
          (!!i.productId || !!i.tempProductName),
      );
    if (clean.length === 0) return null;

    return {
      customerId: fromCatalog ? values.customerId ?? null : null,
      customerNameSnapshot: fromCatalog
        ? null
        : (values.customerNameSnapshot ?? '').trim() || null,
      customerPhoneSnapshot: fromCatalog
        ? null
        : (values.customerPhoneSnapshot ?? '').trim()
          ? normalizePhone((values.customerPhoneSnapshot ?? '').trim())
          : null,
      customerEmailSnapshot: fromCatalog
        ? null
        : (values.customerEmailSnapshot ?? '')?.trim() || null,
      customerTaxIdSnapshot: fromCatalog
        ? null
        : (values.customerTaxIdSnapshot ?? '').trim()
          ? normalizeRut((values.customerTaxIdSnapshot ?? '').trim())
          : null,
      date: values.date,
      validUntil: values.validUntil,
      notes: (values.notes ?? '').trim() || null,
      items: clean,
    };
  };

  const saveMut = useMutation({
    mutationFn: async (payload: CreateQuotationInput) => {
      if (mode === 'edit' && initialData) {
        return updateQuotation(initialData.id, payload);
      }
      return createQuotation(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      // Cliente libre → posible borrador nuevo en Clientes.
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const sendEmailMut = useMutation({
    mutationFn: (id: string) => sendEmail(id),
  });

  // Envío real por WhatsApp desde el diálogo de destino (mismo patrón que el
  // detalle): `to` envía a un número escrito (que ya quedó en la cotización),
  // `choose` abre WhatsApp sin número para elegir el contacto.
  const waSendMut = useMutation({
    mutationFn: (opts: { to?: string; choose?: boolean }) =>
      sendWhatsapp(waCtx!.quotation.id, opts.to),
    onSuccess: (result, opts) => {
      const url = opts.choose
        ? result.whatsappChooseUrl
        : (result.whatsappUrl ?? result.whatsappChooseUrl);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      toast.success('Cotización guardada. Se abrió WhatsApp en otra pestaña.');
      const saved = waCtx!.quotation;
      setWaCtx(null);
      qc.invalidateQueries({ queryKey: ['quotations'] });
      onSuccess?.(saved);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo enviar por WhatsApp')),
  });

  const submitting = saveMut.isPending || sendEmailMut.isPending;

  // ============================================================
  // AUTOGUARDADO (Fase 2)
  // Crea la cotización como BORRADOR apenas hay cliente + ≥1 ítem completo, y
  // la actualiza (con debounce) en cada cambio de ítems/cliente/notas. Es
  // silencioso: NO abre WhatsApp/email, NO cierra el modal y NO muestra toasts
  // de error (el guardado manual sigue disponible para eso). Reusa
  // `savedQuotationId`, así el guardado/envío manual hace UPDATE (sin duplicar).
  // ============================================================
  const autoSaveEnabled =
    mode === 'create' || (mode === 'edit' && initialData?.status === 'DRAFT');

  const [autoSaveState, setAutoSaveState] = useState<
    'idle' | 'saving' | 'saved'
  >('idle');
  const autoSavingRef = useRef(false);
  const autoSaveDirtyRef = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveFirstRun = useRef(true);

  // Campos de cliente/meta que afectan el payload (reactivos). Los ítems entran
  // por `items` en la firma de abajo.
  const watchedAuto = useWatch({
    control: form.control,
    name: [
      'clientType',
      'customerId',
      'customerNameSnapshot',
      'customerPhoneSnapshot',
      'customerEmailSnapshot',
      'customerTaxIdSnapshot',
      'notes',
      'date',
      'validUntil',
    ],
  });

  // Firma estable del estado guardable: cambia solo cuando cambia algo editado
  // por el usuario (NO incluye datos de stock para no autoguardar al cargar).
  const autoSaveSig = useMemo(
    () =>
      JSON.stringify({
        c: watchedAuto,
        i: items.map((it) => ({
          p: it.productId,
          n: it.name,
          s: it.sku,
          pn: it.tempProductPartNumber,
          q: it.qty,
          u: it.unitPrice,
          dk: it.discountKind,
          dv: it.discountValue,
        })),
      }),
    [watchedAuto, items],
  );

  // Ref reasignada en cada render → captura siempre los valores frescos
  // (savedQuotationId, form, items) sin closures viejos en el setTimeout.
  const doAutoSaveRef = useRef<() => Promise<void>>(async () => {});
  doAutoSaveRef.current = async () => {
    if (!autoSaveEnabled) return;
    if (waCtx) return; // diálogo de envío abierto
    if (submitting) return; // guardado/envío manual en curso
    if (autoSavingRef.current) {
      autoSaveDirtyRef.current = true; // hubo cambios durante el guardado
      return;
    }
    const payload = buildDraftPayload();
    if (!payload) return;
    autoSavingRef.current = true;
    setAutoSaveState('saving');
    try {
      let saved: QuotationDto;
      const existingId = savedQuotationIdRef.current;
      if (existingId) {
        saved = await updateQuotation(existingId, payload);
      } else {
        saved = await createQuotation(payload);
        setSavedId(saved.id);
      }
      setAutoSaveState('saved');
      qc.invalidateQueries({ queryKey: ['quotations'] });
    } catch {
      // Silencioso: el autoguardado no debe molestar. El guardado manual
      // reportará el error si el operador intenta guardar/enviar.
      setAutoSaveState('idle');
    } finally {
      autoSavingRef.current = false;
      if (autoSaveDirtyRef.current) {
        autoSaveDirtyRef.current = false;
        void doAutoSaveRef.current();
      }
    }
  };

  useEffect(() => {
    if (!autoSaveEnabled) return;
    // No autoguardar en el primer render (montaje / carga de un borrador
    // existente): solo tras un cambio real del operador.
    if (autoSaveFirstRun.current) {
      autoSaveFirstRun.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void doAutoSaveRef.current();
    }, 800);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveSig, autoSaveEnabled]);

  function onErrors(errors: FieldErrors<FormValues>) {
    if (
      errors.customerId ||
      errors.customerNameSnapshot ||
      errors.customerPhoneSnapshot ||
      errors.customerEmailSnapshot ||
      errors.customerTaxIdSnapshot
    ) {
      setActiveTab('principal');
      setClientOpen(true);
    }
  }

  /**
   * Pre-validación del contacto necesario para el canal elegido. Se ejecuta
   * ANTES de guardar, así si falta el dato el modal queda intacto (no se crea
   * cotización a medias y el operador no pierde lo que escribió).
   *
   * - email → requiere customerEmail (catálogo) o customerEmailSnapshot (libre).
   * - whatsapp → requiere customerPhone normalizable a E.164.
   *
   * Si falta y el cliente viene del catálogo, mostramos un toast con CTA para
   * abrir el perfil del cliente en otra pestaña. Si es libre, error inline.
   */
  function preValidateChannel(channel: 'email' | 'whatsapp'): boolean {
    const values = form.getValues();
    const fromCatalog = values.clientType === 'catalog';

    if (channel === 'email') {
      const email = fromCatalog
        ? catalogCustomer?.email?.trim() ?? ''
        : (values.customerEmailSnapshot ?? '').trim();
      if (!email) {
        setActiveTab('principal');
      setClientOpen(true);
        if (fromCatalog && catalogCustomer) {
          toast.error('Este cliente no tiene email guardado.', {
            action: {
              label: 'Ir al cliente',
              onClick: () =>
                window.open(
                  `/clientes/${catalogCustomer.id}`,
                  '_blank',
                  'noopener,noreferrer',
                ),
            },
          });
        } else {
          form.setError('customerEmailSnapshot', {
            type: 'manual',
            message: 'Agregá un email para enviar por correo',
          });
          toast.error('Agregá el email del cliente para enviar por correo');
        }
        return false;
      }
    } else {
      const rawPhone = fromCatalog
        ? catalogCustomer?.phone?.trim() ?? ''
        : (values.customerPhoneSnapshot ?? '').trim();
      if (!rawPhone || !isValidPhone(rawPhone)) {
        setActiveTab('principal');
      setClientOpen(true);
        if (fromCatalog && catalogCustomer) {
          toast.error(
            rawPhone
              ? 'El teléfono del cliente no es válido.'
              : 'Este cliente no tiene teléfono guardado.',
            {
              action: {
                label: 'Ir al cliente',
                onClick: () =>
                  window.open(
                    `/clientes/${catalogCustomer.id}`,
                    '_blank',
                    'noopener,noreferrer',
                  ),
              },
            },
          );
        } else {
          form.setError('customerPhoneSnapshot', {
            type: 'manual',
            message: 'Agregá un teléfono válido para enviar por WhatsApp',
          });
          toast.error('Agregá el teléfono del cliente para enviar por WhatsApp');
        }
        return false;
      }
    }
    return true;
  }

  async function handleSave(after?: 'email' | 'whatsapp') {
    const valid = await form.trigger();
    if (!valid) {
      onErrors(form.formState.errors);
      return;
    }
    // El teléfono ya NO es obligatorio para WhatsApp: el diálogo de envío
    // permite escribir un número o "elegir contacto". Solo pre-validamos email.
    if (after === 'email' && !preValidateChannel('email')) return;

    const payload = buildPayload();
    if (!payload) return;

    // Si el autoguardado está creando el borrador en este instante, esperamos
    // a que termine para reutilizar SU id (y no crear una segunda cotización).
    for (let i = 0; i < 60 && autoSavingRef.current; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
    }

    let saved: QuotationDto;
    try {
      // Reintento sin duplicar: si en un intento anterior la cotización ya
      // se guardó (manual o autoguardado), hacemos UPDATE en vez de CREATE
      // para no generar un número correlativo nuevo y huérfano.
      const existingId = savedQuotationIdRef.current;
      if (existingId) {
        saved = await updateQuotation(existingId, payload);
      } else {
        saved = await saveMut.mutateAsync(payload);
        setSavedId(saved.id);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo guardar la cotización'));
      return;
    }

    qc.invalidateQueries({ queryKey: ['quotations'] });
    qc.invalidateQueries({ queryKey: ['quotation', saved.id] });
    // Un cliente libre pudo haberse creado como borrador → refrescar Clientes.
    qc.invalidateQueries({ queryKey: ['customers'] });

    if (after === 'email') {
      try {
        await sendEmailMut.mutateAsync(saved.id);
        toast.success('Cotización guardada y enviada por email');
      } catch (err) {
        // El save fue OK; el envío falló. Mantenemos el modal abierto y
        // savedQuotationId seteado para que el reintento no duplique.
        toast.error(
          apiErrorMessage(
            err,
            'La cotización se guardó pero falló el envío del email. Verificá los datos y reintentá.',
          ),
        );
        return;
      }
    } else if (after === 'whatsapp') {
      // La cotización ya está guardada. En vez de abrir WhatsApp directo,
      // mostramos el diálogo de destino (mismo del detalle): escribir un número
      // (queda guardado en la cotización) o elegir el contacto en WhatsApp. El
      // envío real y la navegación ocurren desde ese diálogo (waSendMut).
      const v = form.getValues();
      const knownPhone =
        v.clientType === 'catalog'
          ? catalogCustomer?.phone?.trim() || null
          : (v.customerPhoneSnapshot ?? '').trim() &&
              isValidPhone((v.customerPhoneSnapshot ?? '').trim())
            ? normalizePhone((v.customerPhoneSnapshot ?? '').trim())
            : null;
      setWaCtx({ quotation: saved, phone: knownPhone });
      return;
    } else {
      toast.success(
        mode === 'edit' || savedQuotationId !== saved.id
          ? 'Cotización actualizada'
          : 'Cotización guardada como borrador',
      );
    }

    onSuccess?.(saved);
  }

  // Si la cotización ya fue persistida en este intento (saved OK + envío
  // falló), los labels de los botones cambian para que el operador entienda
  // que el reintento NO crea una segunda cotización.
  const pendingRetry = mode === 'create' && savedQuotationId !== null;

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      {autoSaveEnabled && autoSaveState !== 'idle' && (
        <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">
          {autoSaveState === 'saving' ? (
            'Guardando…'
          ) : (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              Borrador guardado
            </>
          )}
        </span>
      )}
      <button
        type="button"
        onClick={() => onCancel?.()}
        disabled={submitting}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={() => handleSave()}
        disabled={submitting}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
      >
        <Save className="h-4 w-4 text-slate-400" />
        {saveMut.isPending
          ? 'Guardando…'
          : pendingRetry
            ? 'Guardar cambios'
            : 'Guardar borrador'}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={submitting}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting
              ? 'Procesando…'
              : pendingRetry
                ? 'Reintentar envío'
                : 'Guardar y enviar'}
            <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => handleSave('email')}>
            <Mail className="h-4 w-4" />
            Enviar por email
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSave('whatsapp')}>
            <MessageCircle className="h-4 w-4" />
            Enviar por WhatsApp
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="space-y-6"
    >
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {mode === 'edit'
                ? `Editar cotización${initialData ? ` ${initialData.number}` : ''}`
                : 'Nueva cotización'}
            </h1>
            {mode === 'edit' && initialData && (
              <p className="text-sm text-muted-foreground">
                Estado actual: {statusLabel(initialData.status)}
              </p>
            )}
          </div>
          {actionButtons}
        </div>
      )}

      {pendingRetry && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs font-semibold text-amber-700 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-400">
          La cotización se guardó pero el envío falló. Verificá los datos del
          cliente y reintentá — no se creará una cotización duplicada.
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <TabsList className="h-auto gap-1 rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          {/* Ronda 10 — 2 tabs: Cliente + productos en una sola vista,
              Notas en otra. La sección del cliente vive arriba del listado
              y se puede colapsar. */}
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
                  Datos del cliente
                </h2>
                <p className="text-xs text-muted-foreground">
                  {clientType === 'catalog'
                    ? catalogCustomer
                      ? `${catalogCustomer.name}${catalogCustomer.taxId ? ` · ${catalogCustomer.taxId}` : ''}`
                      : 'Sin cliente seleccionado'
                    : form.getValues('customerNameSnapshot')
                      ? form.getValues('customerNameSnapshot')
                      : 'Cliente libre (sin datos cargados)'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {clientOpen ? 'Ocultar ▴' : 'Editar ▾'}
              </span>
            </button>
            {clientOpen && (
              <div className="space-y-4 p-6">
            <Controller
              control={form.control}
              name="clientType"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => field.onChange('catalog')}
                    className={cn(
                      'rounded-xl border px-4 py-2.5 text-xs font-bold transition-all',
                      field.value === 'catalog'
                        ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white shadow-md'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900',
                    )}
                  >
                    Cliente del catálogo
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange('free')}
                    className={cn(
                      'rounded-xl border px-4 py-2.5 text-xs font-bold transition-all',
                      field.value === 'free'
                        ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white shadow-md'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900',
                    )}
                  >
                    Cliente libre (sin guardar)
                  </button>
                </div>
              )}
            />

            {clientType === 'catalog' ? (
              <Controller
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Cliente
                    </span>
                    <CustomerCombobox
                      value={field.value ?? null}
                      onChange={(id, customer) => {
                        field.onChange(id);
                        setCatalogCustomer(customer ?? null);
                      }}
                      initialCustomer={initialData?.customer ?? null}
                    />
                    {form.formState.errors.customerId && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.customerId.message as string}
                      </p>
                    )}
                  </div>
                )}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Todos los datos son opcionales. Podés guardar la cotización
                  sin cargar datos del cliente y completarlos al enviarla.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field
                    label="Nombre o razón social (opcional)"
                    error={form.formState.errors.customerNameSnapshot?.message}
                  >
                    <Input
                      {...form.register('customerNameSnapshot')}
                      placeholder="ej: Juan Pérez"
                    />
                  </Field>
                  <Field
                    label="RUT (opcional)"
                    error={form.formState.errors.customerTaxIdSnapshot?.message}
                  >
                    <Input
                      {...form.register('customerTaxIdSnapshot')}
                      placeholder="12.345.678-9"
                    />
                  </Field>
                  <Field
                    label="Teléfono (opcional)"
                    error={form.formState.errors.customerPhoneSnapshot?.message}
                  >
                    <Input
                      {...form.register('customerPhoneSnapshot')}
                      placeholder="+56 9 1234 5678"
                    />
                    {!form.formState.errors.customerPhoneSnapshot && (
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                        Formato: +569XXXXXXXX o +56 9 XXXX XXXX. Se usa para
                        enviar la cotización por WhatsApp.
                      </p>
                    )}
                  </Field>
                  <Field
                    label="Email (opcional)"
                    error={form.formState.errors.customerEmailSnapshot?.message}
                  >
                    <Input
                      type="email"
                      {...form.register('customerEmailSnapshot')}
                      placeholder="cliente@correo.cl"
                    />
                  </Field>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Fecha" error={form.formState.errors.date?.message}>
                <Input type="date" {...form.register('date')} />
              </Field>
              <Field
                label="Válida hasta"
                error={form.formState.errors.validUntil?.message}
              >
                <Input type="date" {...form.register('validUntil')} />
              </Field>
            </div>
              </div>
            )}
          </div>

          {/* Items debajo del cliente, en el mismo tab (Ronda 10). */}
          <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Items de la cotización
              </h2>
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
                {/* Ronda 9 — producto temporal (no toca catálogo). */}
                <TemporaryProductButton
                  onAdd={(tp) =>
                    setItems((prev) => [
                      ...prev,
                      {
                        productId: null,
                        sku: tp.sku,
                        name: tp.name,
                        qty: 1,
                        unitPrice: tp.unitPrice,
                        discountKind: '$',
                        discountValue: '0',
                        tempProductPartNumber: tp.partNumber,
                        isTemporary: true,
                      },
                    ])
                  }
                />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[100px] text-right">Cant.</TableHead>
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
                  // Ronda 9 — productos temporales no tienen entry en stockMap.
                  const available = it.productId
                    ? stockMap.get(it.productId)
                    : undefined;
                  const stockLoaded = available != null;
                  const exceeds = stockLoaded && it.qty > available;
                  return (
                    <TableRow
                      key={`${it.productId ?? 'temp'}-${idx}`}
                      className={cn(
                        '[&>td]:align-top',
                        exceeds && 'bg-amber-500/5 hover:bg-amber-500/10',
                      )}
                    >
                      <TableCell className="font-mono text-xs">
                        {it.sku ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="flex flex-col gap-1">
                          <span className="truncate">{it.name}</span>
                          {it.isTemporary && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                              Producto temporal · no descuenta stock
                            </span>
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
                              exceeds && 'border-amber-500 focus-visible:ring-amber-500',
                            )}
                          />
                          {stockLoaded && (
                            <div
                              className={cn(
                                'whitespace-nowrap text-xs tabular-nums',
                                exceeds
                                  ? 'font-medium text-amber-700 dark:text-amber-300'
                                  : 'text-muted-foreground',
                              )}
                              title="Stock total disponible sumando todas las bodegas activas"
                            >
                              {exceeds
                                ? `Stock total: ${available} (faltan ${it.qty - available})`
                                : `Stock total: ${available}`}
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
                                discountKind: it.discountKind === '$' ? '%' : '$',
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
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs font-semibold text-amber-700 dark:border-amber-950/30 dark:bg-amber-950/10 dark:text-amber-400">
              <div className="font-medium">
                {stockShortages.length === 1
                  ? '1 item excede el stock disponible'
                  : `${stockShortages.length} items exceden el stock disponible`}
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {stockShortages.map((s) => (
                  <li key={s.productId}>
                    <span className="font-mono">{s.sku}</span> — {s.name}:{' '}
                    pidiendo {s.requested}, disponible {s.available} (faltan{' '}
                    {s.requested - s.available})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                Podés guardar la cotización igualmente. El stock se vuelve a
                validar al convertir a venta.
              </p>
            </div>
          )}
          </div>
        </TabsContent>

        <TabsContent value="notas" className="space-y-2">
          <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Notas (opcional)
            </span>
            <Textarea
              rows={8}
              {...form.register('notes')}
              placeholder="Plazo de entrega, observaciones, condiciones de pago, etc."
            />
            <p className="text-xs text-muted-foreground">
              Las notas se muestran al cliente: aparecen en el PDF y en el link
              público de la cotización.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="ml-auto max-w-md space-y-2 rounded-2xl border border-slate-100 bg-white p-5 text-xs shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>Subtotal neto</span>
          <span className="font-mono font-semibold">
            {formatCurrency(subtotalNeto.toFixed(2))}
          </span>
        </div>
        <div className="flex justify-between text-slate-500 dark:text-slate-400">
          <span>IVA ({(taxRate * 100).toFixed(0)}%)</span>
          <span className="font-mono font-semibold">
            {formatCurrency(taxAmount.toFixed(2))}
          </span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-950 dark:border-slate-850 dark:text-white">
          <span>Total bruto</span>
          <span className="font-mono text-base font-black text-[#2F6BFF]">
            {formatCurrency(totalBruto.toFixed(2))}
          </span>
        </div>
      </div>

      {embedded && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {actionButtons}
        </div>
      )}

      {/* Destino de WhatsApp: se abre tras guardar al elegir "Enviar por
          WhatsApp". Permite escribir un número (se guarda en la cotización) o
          elegir el contacto en WhatsApp. */}
      <WhatsappSendDialog
        open={!!waCtx}
        onOpenChange={(o) => {
          if (!o) setWaCtx(null);
        }}
        registeredPhone={waCtx?.phone ?? null}
        busy={waSendMut.isPending}
        onSend={(opts) => waSendMut.mutate(opts)}
      />
    </form>
  );

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      {children}
      {error && <p className="text-[11px] font-bold text-rose-500">{error}</p>}
    </div>
  );
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function itemsFromQuotation(q?: QuotationDto): ItemRow[] {
  if (!q?.items) return [];
  return q.items.map((it) => {
    const hasPercent = it.discountPercent != null;
    const isTemp = it.productId == null;
    return {
      productId: it.productId,
      sku: isTemp ? it.tempProductSku ?? '' : it.product?.sku ?? '',
      name: isTemp ? it.tempProductName ?? '' : it.product?.name ?? '',
      qty: it.qty,
      unitPrice: String(it.unitPrice),
      discountKind: hasPercent ? '%' : '$',
      discountValue: hasPercent
        ? String(it.discountPercent)
        : String(it.discount),
      tempProductPartNumber: isTemp ? it.tempProductPartNumber : null,
      isTemporary: isTemp,
    };
  });
}

function statusLabel(s: QuotationDto['status']) {
  return (
    {
      DRAFT: 'Borrador',
      SENT: 'Enviada',
      APPROVED: 'Aprobada',
      REJECTED: 'Rechazada',
      CONVERTED: 'Convertida en venta',
      EXPIRED: 'Vencida',
    }[s] ?? s
  );
}

// ---------- Customer combobox (catálogo) ----------

function CustomerCombobox({
  value,
  onChange,
  initialCustomer,
}: {
  value: string | null;
  onChange: (id: string | null, customer?: CustomerDto) => void;
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

  // Si tenemos value y no tenemos selected (caso: editor cargado sin initialCustomer),
  // intentamos buscarlo en results.
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
            className={cn(
              !selected && 'text-muted-foreground',
              'truncate',
            )}
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
                  ? 'Sin resultados.'
                  : 'Empezá a tipear para buscar.'}
              </CommandEmpty>
            )}
            {value && (
              <CommandGroup heading="Acción">
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setSelected(null);
                    setOpen(false);
                  }}
                >
                  Quitar selección
                </CommandItem>
              </CommandGroup>
            )}
            {items.length > 0 && (
              <CommandGroup heading="Clientes">
                {items.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onChange(c.id, c);
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
