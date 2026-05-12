'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Mail,
  MessageCircle,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  createQuotation,
  sendEmail,
  sendWhatsapp,
  updateQuotation,
  type CreateQuotationInput,
  type CreateQuotationItemInput,
} from '@/lib/quotations-api';
import { getAvailableStock, type AvailableStockRow } from '@/lib/sales-api';
import { isValidPhone, normalizePhone } from '@/lib/validators/phone';
import { cn } from '@/lib/utils';
import type { CustomerDto, QuotationDto } from '@inventory/shared';

type ClientType = 'catalog' | 'free';
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
    }
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  mode: 'create' | 'edit';
  initialData?: QuotationDto;
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
  onSuccess,
  onCancel,
  embedded = false,
}: Props) {
  const qc = useQueryClient();
  const [items, setItems] = useState<ItemRow[]>(() => itemsFromQuotation(initialData));
  const [activeTab, setActiveTab] = useState<'cliente' | 'items' | 'notas'>(
    'cliente',
  );

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
    () => items.map((it) => it.productId).filter(Boolean),
    [items],
  );
  const stockQuery = useQuery({
    queryKey: ['quotation-available-stock', productIds.join(',')],
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
      const available = stockMap.get(it.productId);
      if (available == null) return null;
      if (it.qty > available) {
        return {
          productId: it.productId,
          sku: it.sku,
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
      return {
        productId: it.productId,
        qty,
        unitPrice: unit.toFixed(2),
        discount: discount.toFixed(2),
        discountPercent,
      };
    });

    if (clean.length === 0) {
      toast.error('Agregá al menos un item');
      setActiveTab('items');
      return null;
    }
    if (clean.some((i) => i.qty < 1 || Number(i.unitPrice) <= 0)) {
      toast.error('Revisá cantidad y precio unitario de los items');
      setActiveTab('items');
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
        : (values.customerTaxIdSnapshot ?? '').trim() || null,
      date: values.date,
      validUntil: values.validUntil,
      notes: (values.notes ?? '').trim() || null,
      items: clean,
    };
    return payload;
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
    },
  });

  const sendEmailMut = useMutation({
    mutationFn: (id: string) => sendEmail(id),
  });

  const sendWhatsappMut = useMutation({
    mutationFn: (id: string) => sendWhatsapp(id),
  });

  const submitting =
    saveMut.isPending || sendEmailMut.isPending || sendWhatsappMut.isPending;

  function onErrors(errors: FieldErrors<FormValues>) {
    if (
      errors.customerId ||
      errors.customerNameSnapshot ||
      errors.customerPhoneSnapshot ||
      errors.customerEmailSnapshot ||
      errors.customerTaxIdSnapshot
    ) {
      setActiveTab('cliente');
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
        setActiveTab('cliente');
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
        setActiveTab('cliente');
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
    if (after && !preValidateChannel(after)) return;

    const payload = buildPayload();
    if (!payload) return;

    let saved: QuotationDto;
    try {
      // Reintento sin duplicar: si en un intento anterior la cotización ya
      // se guardó pero el envío falló, hacemos UPDATE en vez de CREATE para
      // no generar un número correlativo nuevo y huérfano.
      if (savedQuotationId) {
        saved = await updateQuotation(savedQuotationId, payload);
      } else {
        saved = await saveMut.mutateAsync(payload);
        setSavedQuotationId(saved.id);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo guardar la cotización'));
      return;
    }

    qc.invalidateQueries({ queryKey: ['quotations'] });
    qc.invalidateQueries({ queryKey: ['quotation', saved.id] });

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
      try {
        const result = await sendWhatsappMut.mutateAsync(saved.id);
        if (result.whatsappUrl) {
          window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
        }
        toast.success('Cotización guardada. Se abrió WhatsApp en otra pestaña.');
      } catch (err) {
        toast.error(
          apiErrorMessage(
            err,
            'La cotización se guardó pero falló el envío por WhatsApp. Verificá los datos y reintentá.',
          ),
        );
        return;
      }
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
      <Button
        type="button"
        variant="outline"
        onClick={() => onCancel?.()}
        disabled={submitting}
      >
        Cancelar
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => handleSave()}
        disabled={submitting}
      >
        <Save className="h-4 w-4" />
        {saveMut.isPending
          ? 'Guardando...'
          : pendingRetry
            ? 'Guardar cambios'
            : 'Guardar borrador'}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" disabled={submitting}>
            {submitting
              ? 'Procesando...'
              : pendingRetry
                ? 'Reintentar envío'
                : 'Guardar y enviar'}
            <ChevronDown className="h-4 w-4" />
          </Button>
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
        <div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          La cotización se guardó pero el envío falló. Verificá los datos del
          cliente y reintentá — no se creará una cotización duplicada.
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <TabsList>
          <TabsTrigger value="cliente">Cliente</TabsTrigger>
          <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>

        <TabsContent value="cliente" className="space-y-4">
          <div className="rounded-md border bg-card p-6 space-y-4">
            <Controller
              control={form.control}
              name="clientType"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={field.value === 'catalog' ? 'default' : 'outline'}
                    onClick={() => field.onChange('catalog')}
                  >
                    Cliente del catálogo
                  </Button>
                  <Button
                    type="button"
                    variant={field.value === 'free' ? 'default' : 'outline'}
                    onClick={() => field.onChange('free')}
                  >
                    Cliente libre (sin guardar)
                  </Button>
                </div>
              )}
            />

            {clientType === 'catalog' ? (
              <Controller
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Cliente</Label>
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
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <div className="rounded-md border bg-card">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-medium">Items de la cotización</h2>
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
                  const available = stockMap.get(it.productId);
                  const stockLoaded = available != null;
                  const exceeds = stockLoaded && it.qty > available;
                  return (
                    <TableRow
                      key={`${it.productId}-${idx}`}
                      className={
                        exceeds
                          ? 'bg-amber-500/5 hover:bg-amber-500/10'
                          : undefined
                      }
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
                              exceeds && 'border-amber-500 focus-visible:ring-amber-500',
                            )}
                          />
                          {stockLoaded && (
                            <div
                              className={cn(
                                'text-xs tabular-nums',
                                exceeds
                                  ? 'font-medium text-amber-700 dark:text-amber-300'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {exceeds
                                ? `Stock: ${available} (faltan ${it.qty - available})`
                                : `Stock: ${available}`}
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
            <div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
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
        </TabsContent>

        <TabsContent value="notas" className="space-y-2">
          <div className="rounded-md border bg-card p-6 space-y-2">
            <Label>Notas (opcional)</Label>
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

      <div className="ml-auto max-w-md rounded-md border bg-card p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal neto</span>
          <span className="tabular-nums">
            {formatCurrency(subtotalNeto.toFixed(2))}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            IVA ({(taxRate * 100).toFixed(0)}%)
          </span>
          <span className="tabular-nums">
            {formatCurrency(taxAmount.toFixed(2))}
          </span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total bruto</span>
          <span className="tabular-nums">
            {formatCurrency(totalBruto.toFixed(2))}
          </span>
        </div>
      </div>

      {embedded && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {actionButtons}
        </div>
      )}
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
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
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
    return {
      productId: it.productId,
      sku: it.product?.sku ?? '',
      name: it.product?.name ?? '',
      qty: it.qty,
      unitPrice: String(it.unitPrice),
      discountKind: hasPercent ? '%' : '$',
      discountValue: hasPercent
        ? String(it.discountPercent)
        : String(it.discount),
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
