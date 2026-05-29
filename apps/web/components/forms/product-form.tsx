'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Car,
  Check,
  ChevronRight,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Info,
  Package,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ProductImageLightbox } from '@/components/product-image-lightbox';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFieldArrayReturn,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ProductImageGallery } from '@/components/product-image-gallery';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  apiErrorMessage,
  createProduct,
  deleteProduct,
  listBrands,
  listCategories,
  listVehicleMakes,
  listVehicleModels,
  publicImageUrl,
  updateProduct,
  uploadProductImage,
  type ProductInput,
} from '@/lib/catalog-api';
import { Permission, useCan } from '@/lib/current-user-context';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ProductDto, ProductKindDto } from '@inventory/shared';

const NULL_OPTION = '__none__';
const MIN_YEAR = 1980;
const MAX_YEAR = new Date().getFullYear() + 1;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — espejo del backend
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const fitmentSchema = z
  .object({
    modelId: z.string().uuid('Elegí un modelo'),
    yearFrom: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
    yearTo: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.yearFrom != null && v.yearTo != null && v.yearFrom > v.yearTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"Desde" no puede ser mayor que "Hasta"',
        path: ['yearFrom'],
      });
    }
  });

const compatibleCodeSchema = z.object({
  code: z.string().min(1, 'Código vacío').max(80, 'Máximo 80 caracteres'),
});

const schema = z
  .object({
    // Ronda 9 — SKU es opcional. Si llega vacío, el backend auto-genera
    // `AUTO-AAAA-NNNNN`. Los obligatorios pasaron a `name` y `partNumber`.
    sku: z.string().max(60).optional().or(z.literal('')),
    name: z.string().min(1, 'Nombre obligatorio').max(200),
    partNumber: z.string().min(1, 'Número de parte obligatorio').max(80),
    barcode: z.string().max(80).optional().or(z.literal('')),
    productKind: z.enum(['ORIGINAL', 'ALTERNATIVE']),
    description: z.string().optional().or(z.literal('')),
    categoryId: z.string().optional(),
    brandId: z.string().optional(),
    cost: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00')
      .optional()
      .or(z.literal('')),
    price: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00')
      .optional()
      .or(z.literal('')),
    minStock: z.coerce.number().int().min(0).optional(),
    location: z.string().max(120).optional().or(z.literal('')),
    isActive: z.boolean().optional(),
    fitments: z.array(fitmentSchema).optional(),
    compatibleCodes: z.array(compatibleCodeSchema).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.fitments) {
      // Detección de solapamiento inclusivo (los bordes cuentan): para cada
      // par de filas del mismo modelo, si comparten ≥1 año en su rango es
      // duplicado/solapamiento. yearFrom null se trata como -∞, yearTo null
      // se interpreta como (year + 1) según la regla acordada en Ronda 5
      // — no como +∞: una fila "desde 2018" sin hasta cubre 2018 y 2019.
      const PLUS_INF = Number.POSITIVE_INFINITY;
      const MINUS_INF = Number.NEGATIVE_INFINITY;
      const ranges = v.fitments.map((f) => {
        const from = f.yearFrom ?? MINUS_INF;
        // Si solo se define yearFrom, asumimos "year y siguiente" (2 años).
        // Si no hay yearFrom ni yearTo, el rango es vacío (no se chequea).
        const to =
          f.yearTo != null
            ? f.yearTo
            : f.yearFrom != null
              ? f.yearFrom + 1
              : PLUS_INF;
        return { modelId: f.modelId, from, to };
      });
      v.fitments.forEach((f, idx) => {
        if (!f.modelId) return;
        const a = ranges[idx]!;
        for (let j = 0; j < idx; j++) {
          const b = ranges[j]!;
          if (b.modelId !== a.modelId) continue;
          // Solapamiento inclusivo: a.from <= b.to && b.from <= a.to.
          if (a.from <= b.to && b.from <= a.to) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                'Esta compatibilidad se solapa con otra ya cargada para el mismo modelo.',
              path: ['fitments', idx, 'yearFrom'],
            });
            break;
          }
        }
      });
    }
    if (v.compatibleCodes) {
      const seen = new Set<string>();
      v.compatibleCodes.forEach((c, idx) => {
        const code = c.code.trim();
        if (code && seen.has(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Código duplicado en la lista.',
            path: ['compatibleCodes', idx, 'code'],
          });
        }
        seen.add(code);
      });
    }
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  product?: ProductDto;
}

const YEAR_OPTIONS = Array.from(
  { length: MAX_YEAR - MIN_YEAR + 1 },
  (_, i) => MAX_YEAR - i,
);

type TabKey = 'datos' | 'precios' | 'compat' | 'codigos' | 'imagenes';

export function ProductForm({ product }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Solo se usa en modo "nuevo": archivos cargados antes de que exista el productId.
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('datos');
  // USER (vendedor) no ve costos ni margen. Defense in depth: el backend
  // también filtra esos campos, así que para USER `product.cost` llega null.
  const canSeeCost = useCan(Permission.PRODUCT_VIEW_COST);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategories(),
  });
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  const models = useQuery({
    queryKey: ['vehicle-models'],
    queryFn: () => listVehicleModels(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      partNumber: product?.partNumber ?? '',
      barcode: product?.barcode ?? '',
      productKind: (product?.productKind as ProductKindDto) ?? 'ORIGINAL',
      description: product?.description ?? '',
      categoryId: product?.categoryId ?? NULL_OPTION,
      brandId: product?.brandId ?? NULL_OPTION,
      cost: product?.cost ?? '',
      price: product?.price ?? '',
      minStock: product?.minStock ?? 0,
      location: product?.location ?? '',
      isActive: product?.isActive ?? true,
      fitments:
        product?.fitments?.map((f) => ({
          modelId: f.modelId,
          yearFrom: f.yearFrom ?? null,
          yearTo: f.yearTo ?? null,
        })) ?? [],
      compatibleCodes:
        product?.compatibleCodes?.map((code) => ({ code })) ?? [],
    },
  });
  const fitments = useFieldArray({ control: form.control, name: 'fitments' });
  const codes = useFieldArray({
    control: form.control,
    name: 'compatibleCodes',
  });

  const mut = useMutation({
    mutationFn: (input: ProductInput) =>
      product ? updateProduct(product.id, input) : createProduct(input),
    onSuccess: async (saved) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-by-vehicle'] });

      // Si veníamos de "crear" con imágenes pendientes, subirlas en serie.
      if (!product && pendingImages.length > 0) {
        let failed = 0;
        for (const file of pendingImages) {
          try {
            await uploadProductImage(saved.id, file);
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) {
          toast.error(
            `Producto creado, pero ${failed} imagen${failed === 1 ? '' : 'es'} no se pudo subir. Reintentá desde el detalle.`,
          );
        } else {
          toast.success(
            `Producto creado con ${pendingImages.length} imagen${pendingImages.length === 1 ? '' : 'es'}`,
          );
        }
      } else {
        toast.success(product ? 'Producto actualizado' : 'Producto creado');
      }

      router.push(`/productos/${saved.id}`);
      router.refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  const removeMut = useMutation({
    mutationFn: () =>
      product ? deleteProduct(product.id) : Promise.reject('no product'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-by-vehicle'] });
      toast.success('Producto eliminado');
      router.push('/productos');
      router.refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function onInvalid() {
    toast.error('Hay errores en los tabs marcados. Revisá los campos resaltados.');
    // Saltar al primer tab con errores para que el usuario vea la falla.
    const order: TabKey[] = ['datos', 'precios', 'compat', 'codigos'];
    for (const t of order) {
      const c =
        t === 'datos'
          ? errorCounts.datos
          : t === 'precios'
            ? errorCounts.precios
            : t === 'compat'
              ? errorCounts.compat
              : errorCounts.codigos;
      if (c > 0) {
        setActiveTab(t);
        break;
      }
    }
  }

  function onSubmit(values: FormValues) {
    if (mut.isPending) return;
    const input: ProductInput = {
      // Ronda 9 — null si el operador no cargó SKU → backend autogenera.
      sku: values.sku?.trim() ? values.sku.trim() : null,
      name: values.name,
      partNumber: values.partNumber,
      barcode: values.barcode || null,
      productKind: values.productKind,
      description: values.description || null,
      categoryId:
        values.categoryId === NULL_OPTION ? null : (values.categoryId ?? null),
      brandId: values.brandId === NULL_OPTION ? null : (values.brandId ?? null),
      // Solo enviamos cost si el viewer tiene permiso. Si lo omitimos, el
      // backend hace skip del campo (no lo sobrescribe en update).
      ...(canSeeCost ? { cost: values.cost || '0' } : {}),
      price: values.price || '0',
      minStock: values.minStock ?? 0,
      location: values.location || null,
      isActive: values.isActive ?? true,
      fitments: values.fitments?.map((f) => ({
        modelId: f.modelId,
        yearFrom: f.yearFrom ?? null,
        yearTo: f.yearTo ?? null,
      })),
      compatibleCodes: values.compatibleCodes
        ?.map((c) => c.code.trim())
        .filter(Boolean),
    };
    mut.mutate(input);
  }

  const errors = form.formState.errors;
  const submitting = mut.isPending || form.formState.isSubmitting;
  const isDirty = form.formState.isDirty || pendingImages.length > 0;

  const errorsAsRecord = errors as unknown as Record<string, unknown>;
  const errorCounts = {
    datos: countTabErrors(errorsAsRecord, [
      'sku',
      'name',
      'partNumber',
      'barcode',
      'productKind',
      'categoryId',
      'brandId',
      'location',
      'description',
      'isActive',
    ]),
    precios: countTabErrors(errorsAsRecord, [
      'cost',
      'price',
      'minStock',
    ]),
    compat: countArrayErrors(errors.fitments),
    codigos: countArrayErrors(errors.compatibleCodes),
  };

  // Para el preview "live": observamos los campos sin re-renderizar todo el form.
  const watched = useWatch({ control: form.control });
  const imageCount = product
    ? (product.images?.length ?? 0)
    : pendingImages.length;

  // ============================================================
  // COMPLETITUD por tab — el check verde sólo aparece cuando todos
  // los campos requeridos de esa sección están llenos (y sin errores).
  // Datos: name + partNumber son los únicos `required` del zod schema.
  // Precios: price es el campo crítico para mostrar el producto al cliente.
  // ============================================================
  const completion = {
    datos: !!(watched.name?.trim() && watched.partNumber?.trim()),
    precios: !!watched.price?.trim(),
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, onInvalid)}
      className="flex flex-col gap-5 pb-24"
    >
      {/* ============================================================
          HEADER — breadcrumb + title + actions
          ============================================================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <Link href="/" className="rounded px-1.5 py-1 hover:bg-accent hover:text-foreground">
              Inicio
            </Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <Link href="/productos" className="rounded px-1.5 py-1 hover:bg-accent hover:text-foreground">
              Productos
            </Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span className="px-1.5 py-1 font-medium text-foreground">
              {product ? product.sku || 'Editar' : 'Nuevo'}
            </span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">
            {product ? 'Editar producto' : 'Nuevo producto'}
          </h1>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {product ? 'Cambios sin guardar' : 'Borrador'}
              </span>
            )}
            <span>
              {product
                ? 'Los cambios se guardan al presionar Guardar.'
                : 'Completá los campos en cada sección. Las imágenes se suben automáticamente al crear.'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {product && (
            <>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
                disabled={submitting || removeMut.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            <ArrowLeft className="h-4 w-4" />
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>Guardando…</>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {product ? 'Guardar cambios' : 'Crear producto'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ============================================================
          GRID — form (left) + sticky preview (right)
          ============================================================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- LEFT: tabs + content ---------- */}
        <div className="flex min-w-0 flex-col">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabKey)}
          >
            <TabsList
              className={cn(
                // Reset de los defaults de shadcn (bg-muted, h-9, rounded, p-[3px])
                '!h-auto !w-full !rounded-none !bg-transparent !p-0 !text-foreground',
                // Nuestro layout: fila horizontal con border-bottom como underline.
                'flex justify-start gap-1 border-b border-border',
                // Evita que ningún ancestro le agregue scroll vertical.
                'overflow-visible',
              )}
            >
              <TabPill
                value="datos"
                index={1}
                label="Datos"
                errors={errorCounts.datos}
                complete={completion.datos}
              />
              <TabPill
                value="precios"
                index={2}
                label="Precios y stock"
                errors={errorCounts.precios}
                complete={completion.precios}
              />
              <TabPill
                value="compat"
                index={3}
                label="Compatibilidad"
                count={fitments.fields.length}
                errors={errorCounts.compat}
              />
              <TabPill
                value="codigos"
                index={4}
                label="Códigos"
                count={codes.fields.length}
                errors={errorCounts.codigos}
              />
              <TabPill
                value="imagenes"
                index={5}
                label="Imágenes"
                count={imageCount}
              />
            </TabsList>

            {/* DATOS */}
            <TabsContent
              value="datos"
              className="mt-0 rounded-b-xl rounded-tr-xl border border-t-0 bg-card p-6 shadow-sm"
            >
              <SectionHeader
                title="Datos básicos"
                description="Identificación del producto en el catálogo. El SKU se autogenera si lo dejás vacío; el resto te ayuda a buscarlo y mostrarlo al cliente."
              />
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                <Field
                  label="SKU"
                  optional
                  error={errors.sku?.message}
                  hint={
                    <>
                      Se autogenera como{' '}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                        AUTO-AAAA-NNNNN
                      </code>{' '}
                      si lo dejás vacío.
                    </>
                  }
                >
                  <Input
                    {...form.register('sku')}
                    placeholder="ej: BUJ-001"
                  />
                </Field>
                <Field label="Nombre" required error={errors.name?.message}>
                  <Input
                    {...form.register('name')}
                    placeholder="ej: Bujía iridio NGK"
                  />
                </Field>
                <Field
                  label="Número de parte"
                  required
                  error={errors.partNumber?.message}
                >
                  <Input
                    {...form.register('partNumber')}
                    placeholder="ej: IFR6T11"
                  />
                </Field>
                <Field
                  label="Código de barras"
                  optional
                  error={errors.barcode?.message}
                >
                  <Input
                    {...form.register('barcode')}
                    placeholder="ej: 7891234567890"
                  />
                </Field>
                <Field
                  label="Tipo (origen)"
                  required
                  error={errors.productKind?.message}
                >
                  <Controller
                    control={form.control}
                    name="productKind"
                    render={({ field }) => (
                      <div className="flex w-full gap-1 rounded-lg border bg-muted/50 p-1">
                        <SegButton
                          on={field.value === 'ORIGINAL'}
                          onClick={() => field.onChange('ORIGINAL')}
                          dotClass="bg-emerald-500"
                          label="Original"
                        />
                        <SegButton
                          on={field.value === 'ALTERNATIVE'}
                          onClick={() => field.onChange('ALTERNATIVE')}
                          dotClass="bg-blue-500"
                          label="Alternativo"
                        />
                      </div>
                    )}
                  />
                </Field>
                <Field label="Categoría">
                  <Controller
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <Select
                        value={field.value || NULL_OPTION}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NULL_OPTION}>Sin categoría</SelectItem>
                          {/* Ronda 10 — render jerárquico: cada padre con sus
                              hijas indentadas debajo. Si el listado no trae
                              parent/hijas, cae a la lista plana original. */}
                          {(() => {
                            const all = categories.data ?? [];
                            const roots = all.filter((c) => c.parentId == null);
                            const childrenByParent = new Map<string, typeof all>();
                            for (const c of all) {
                              if (!c.parentId) continue;
                              const arr = childrenByParent.get(c.parentId) ?? [];
                              arr.push(c);
                              childrenByParent.set(c.parentId, arr);
                            }
                            return roots.map((r) => [
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>,
                              ...(childrenByParent.get(r.id) ?? []).map(
                                (child) => (
                                  <SelectItem
                                    key={child.id}
                                    value={child.id}
                                    className="pl-8"
                                  >
                                    {r.name} › {child.name}
                                  </SelectItem>
                                ),
                              ),
                            ]);
                          })()}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Marca">
                  <Controller
                    control={form.control}
                    name="brandId"
                    render={({ field }) => (
                      <Select
                        value={field.value || NULL_OPTION}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin marca" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NULL_OPTION}>Sin marca</SelectItem>
                          {brands.data?.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field
                  label="Ubicación física"
                  optional
                  error={errors.location?.message}
                >
                  <Input
                    {...form.register('location')}
                    placeholder="ej: Estante A3"
                  />
                </Field>
                <Field label="Estado">
                  <Controller
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <ToggleField
                        on={!!field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field
                    label="Descripción"
                    optional="opcional · se muestra en cotizaciones y catálogo"
                    error={errors.description?.message}
                  >
                    <textarea
                      {...form.register('description')}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </Field>
                </div>
              </div>
            </TabsContent>

            {/* PRECIOS Y STOCK */}
            <TabsContent
              value="precios"
              className="mt-0 rounded-b-xl rounded-tr-xl border border-t-0 bg-card p-6 shadow-sm"
            >
              <SectionHeader
                title="Precios y stock"
                description="El precio de venta se muestra en cotizaciones y al cliente. El stock mínimo dispara la alerta de reposición en el dashboard."
              />
              <PriciosSection
                form={form}
                errors={errors}
                currentStock={product?.currentStock}
                canSeeCost={canSeeCost}
                isEdit={!!product}
              />
            </TabsContent>

            {/* COMPATIBILIDAD */}
            <TabsContent
              value="compat"
              className="mt-0 rounded-b-xl rounded-tr-xl border border-t-0 bg-card p-6 shadow-sm"
            >
              <SectionHeader
                title="Vehículos compatibles"
                description="Cuando un cliente filtra por su vehículo en /productos verá este SKU si coincide con el modelo y el rango de años cargado."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      fitments.append({
                        modelId: '',
                        yearFrom: null,
                        yearTo: null,
                      })
                    }
                    disabled={!makes.data || makes.data.length === 0}
                  >
                    <Plus className="h-4 w-4" />
                    Agregar fila
                  </Button>
                }
              />

              <div className="mb-4 flex items-start gap-3 rounded-lg border border-orange-300/50 bg-orange-50/60 px-3.5 py-3 text-xs text-muted-foreground dark:border-orange-500/30 dark:bg-orange-500/5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-300">
                  <Info className="h-3 w-3" />
                </span>
                <p className="leading-relaxed">
                  Si dejás los años en blanco, aplica para{' '}
                  <strong className="text-foreground">cualquier año</strong>. Si
                  cargás <strong className="text-foreground">Desde</strong> sin{' '}
                  <strong className="text-foreground">Hasta</strong>, se
                  interpreta como ese año y el siguiente (regla de la Ronda 5).
                </p>
              </div>

              {makes.data && makes.data.length === 0 && (
                <EmptyState
                  icon={<Car className="h-5 w-5" />}
                  title="No hay marcas de vehículo cargadas"
                  description="Creá primero las marcas y modelos en Vehículos antes de asociar compatibilidades."
                />
              )}

              {fitments.fields.length === 0 &&
                makes.data &&
                makes.data.length > 0 && (
                  <EmptyState
                    icon={<Car className="h-5 w-5" />}
                    title="Sin compatibilidades cargadas"
                    description="Agregá una con el botón de arriba."
                  />
                )}

              <div className="flex flex-col gap-2">
                {fitments.fields.map((field, idx) => {
                  const rowErrors = errors.fitments?.[idx];
                  const hasErr = !!(
                    rowErrors?.modelId?.message ||
                    rowErrors?.yearFrom?.message ||
                    rowErrors?.yearTo?.message
                  );
                  return (
                    <div
                      key={field.id}
                      className={cn(
                        'rounded-xl border bg-card transition-colors',
                        hasErr
                          ? 'border-destructive/60 bg-destructive/5'
                          : 'hover:bg-accent/30',
                      )}
                    >
                      <div className="grid grid-cols-[28px_minmax(0,1fr)_110px_110px_36px] items-center gap-3 px-3.5 py-2.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <Controller
                          control={form.control}
                          name={`fitments.${idx}.modelId`}
                          render={({ field: f }) => (
                            <Select
                              value={f.value}
                              onValueChange={f.onChange}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Elegí marca / modelo…" />
                              </SelectTrigger>
                              <SelectContent>
                                {models.data?.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.make?.name} {m.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <Controller
                          control={form.control}
                          name={`fitments.${idx}.yearFrom`}
                          render={({ field: f }) => (
                            <Select
                              value={
                                f.value != null ? String(f.value) : NULL_OPTION
                              }
                              onValueChange={(v) =>
                                f.onChange(
                                  v === NULL_OPTION ? null : Number(v),
                                )
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Desde" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NULL_OPTION}>
                                  Desde —
                                </SelectItem>
                                {YEAR_OPTIONS.map((y) => (
                                  <SelectItem key={y} value={String(y)}>
                                    {y}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <Controller
                          control={form.control}
                          name={`fitments.${idx}.yearTo`}
                          render={({ field: f }) => (
                            <Select
                              value={
                                f.value != null ? String(f.value) : NULL_OPTION
                              }
                              onValueChange={(v) =>
                                f.onChange(
                                  v === NULL_OPTION ? null : Number(v),
                                )
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Hasta" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NULL_OPTION}>
                                  Hasta —
                                </SelectItem>
                                {YEAR_OPTIONS.map((y) => (
                                  <SelectItem key={y} value={String(y)}>
                                    {y}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => fitments.remove(idx)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Eliminar fila"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {hasErr && (
                        <p className="flex items-center gap-1.5 border-t border-destructive/30 bg-destructive/5 px-3.5 py-2 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {rowErrors?.modelId?.message ||
                            rowErrors?.yearFrom?.message ||
                            rowErrors?.yearTo?.message}
                        </p>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() =>
                    fitments.append({
                      modelId: '',
                      yearFrom: null,
                      yearTo: null,
                    })
                  }
                  disabled={!makes.data || makes.data.length === 0}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-transparent text-xs font-medium text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar vehículo compatible
                </button>
              </div>

              {errors.fitments?.root?.message && (
                <p className="mt-3 text-sm text-destructive">
                  {errors.fitments.root.message}
                </p>
              )}
            </TabsContent>

            {/* CÓDIGOS COMPATIBLES */}
            <TabsContent
              value="codigos"
              className="mt-0 rounded-b-xl rounded-tr-xl border border-t-0 bg-card p-6 shadow-sm"
            >
              <SectionHeader
                title="Códigos compatibles"
                description="Códigos de productos equivalentes o intercambiables. Aparecen en la búsqueda — un cliente que escribe uno de estos códigos encuentra el producto."
              />

              <CodesField form={form} codes={codes} errors={errors} />
            </TabsContent>

            {/* IMÁGENES */}
            <TabsContent
              value="imagenes"
              className="mt-0 rounded-b-xl rounded-tr-xl border border-t-0 bg-card p-6 shadow-sm"
            >
              <SectionHeader
                title="Galería de imágenes"
                description={
                  <>
                    Arrastrá hasta 10 imágenes. La primera se marca como{' '}
                    <strong className="text-foreground">portada</strong> y
                    aparece en el catálogo, cotizaciones y búsqueda.
                  </>
                }
              />
              {product ? (
                <ProductImageGallery productId={product.id} />
              ) : (
                <PendingImagesUploader
                  files={pendingImages}
                  onChange={setPendingImages}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ---------- RIGHT: sticky preview ---------- */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 flex flex-col gap-3">
            <PreviewCard
              control={form.control}
              product={product}
              pendingImages={pendingImages}
              imageCount={imageCount}
              fitmentsCount={fitments.fields.length}
              codesCount={codes.fields.length}
              canSeeCost={canSeeCost}
            />
            <aside className="rounded-xl border border-dashed p-4">
              <h4 className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Atajos
              </h4>
              <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
                <ShortcutRow keys="⌘S" label="Guardar / Crear" />
                <ShortcutRow keys="Esc" label="Cancelar y volver" />
                <ShortcutRow keys="1–5" label="Saltar a tab" />
              </ul>
            </aside>
          </div>
        </aside>
      </div>

      {/* ============================================================
          STICKY SAVE BAR
          ============================================================ */}
      {(isDirty || submitting) && (
        <div className="sticky bottom-4 z-30 flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-lg">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            <strong className="font-semibold text-foreground">
              {product ? 'Cambios sin guardar' : 'Borrador en curso'}
            </strong>
            {pendingImages.length > 0 && (
              <span className="text-muted-foreground">
                · {pendingImages.length} imagen
                {pendingImages.length === 1 ? '' : 'es'} pendiente
                {pendingImages.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
          <span className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Descartar
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? (
              <>Guardando…</>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {product ? 'Guardar cambios' : 'Crear producto'}
              </>
            )}
          </Button>
        </div>
      )}

      {/* ============================================================
          DELETE CONFIRM
          ============================================================ */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar producto?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción es permanente. El producto &ldquo;{product?.name}&rdquo;
            se eliminará del catálogo. Si tiene movimientos de inventario
            asociados, no podrá eliminarse y tendrás que desactivarlo en su
            lugar.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={removeMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => removeMut.mutate()}
              disabled={removeMut.isPending}
            >
              {removeMut.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

/* ============================================================
   TAB PILL — wraps shadcn TabsTrigger with the refined chip look
   ============================================================ */

function TabPill({
  value,
  index,
  label,
  count,
  errors,
  complete,
}: {
  value: string;
  index: number;
  label: string;
  count?: number;
  errors?: number;
  complete?: boolean;
}) {
  const hasErr = !!errors && errors > 0;
  // Estado de indicador:
  //   - con errores  → ⚠ rojo
  //   - con count    → pill con el número (tabs de arrays)
  //   - completo y sin errores → ✓ verde
  //   - en blanco / incompleto → nada (no mostramos un "✓ por defecto")
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'group relative -mb-px inline-flex h-11 items-center gap-2 rounded-t-md border-b-2 border-transparent bg-transparent px-4 text-sm font-medium text-muted-foreground shadow-none transition-colors',
        'data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none',
        'hover:bg-accent/60 hover:text-foreground',
      )}
    >
      <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-muted font-mono text-[10px] font-semibold text-muted-foreground group-data-[state=active]:bg-foreground group-data-[state=active]:text-background">
        {index}
      </span>
      <span>{label}</span>
      {count != null ? (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground group-data-[state=active]:bg-accent group-data-[state=active]:text-foreground">
          {count}
        </span>
      ) : hasErr ? (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-white">
          <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
        </span>
      ) : complete ? (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      ) : null}
    </TabsTrigger>
  );
}

/* ============================================================
   SECTION HEADER — title + description + optional action
   ============================================================ */

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b pb-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        {description && (
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ============================================================
   FIELD — label + (required/optional) + hint + error wrapper
   ============================================================ */

function Field({
  label,
  required,
  optional,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean | string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const optionalText =
    typeof optional === 'string' ? optional : optional ? 'opcional' : null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="flex items-center gap-1 text-xs font-semibold">
        <span>{label}</span>
        {required && <span className="text-destructive">*</span>}
        {optionalText && (
          <span className="font-normal text-muted-foreground">
            · {optionalText}
          </span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   SEGMENTED BUTTON (Tipo Original / Alternativo)
   ============================================================ */

function SegButton({
  on,
  onClick,
  label,
  dotClass,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  dotClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors',
        on
          ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} />
      <span>{label}</span>
    </button>
  );
}

/* ============================================================
   TOGGLE FIELD — Activo / Inactivo (replaces the checkbox)
   ============================================================ */

function ToggleField({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-3 self-start rounded-md py-1 text-left"
    >
      <span
        className={cn(
          'relative h-5 w-9 rounded-full border transition-colors',
          on ? 'border-foreground bg-foreground' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-[1px] h-4 w-4 rounded-full bg-background shadow-sm transition-all',
            on ? 'left-[17px]' : 'left-[1px]',
          )}
        />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-medium">
          {on ? 'Activo' : 'Inactivo'}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {on ? 'Aparece en búsqueda y catálogo' : 'Oculto del catálogo'}
        </span>
      </span>
    </button>
  );
}

/* ============================================================
   PRECIOS SECTION — pulled out for readability + margin live
   ============================================================ */

function PriciosSection({
  form,
  errors,
  currentStock,
  canSeeCost,
  isEdit,
}: {
  form: UseFormReturn<FormValues>;
  errors: FieldErrors<FormValues>;
  currentStock?: number;
  canSeeCost: boolean;
  isEdit: boolean;
}) {
  // Margen calculado en tiempo real (cost vs price)
  const cost = useWatch({ control: form.control, name: 'cost' });
  const price = useWatch({ control: form.control, name: 'price' });
  const margin = useMemo(() => {
    if (!canSeeCost) return null;
    const c = Number(cost || 0);
    const p = Number(price || 0);
    if (!c || !p) return null;
    return Math.round(((p - c) / p) * 100);
  }, [cost, price, canSeeCost]);

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
      {canSeeCost &&
        (isEdit ? (
          // El costo unitario es AUTOGESTIONADO por el motor de costo ponderado
          // (lotes FIFO): se recalcula solo con cada compra/venta/devolución/
          // ajuste. En edición es de solo lectura — el backend ignora cualquier
          // valor manual.
          <Field
            label="Costo unitario"
            optional="CLP · automático"
            hint="Promedio ponderado de los lotes con stock disponible. Se actualiza solo con cada compra, venta, devolución o ajuste."
          >
            <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-sm font-semibold">
              <span className="mr-1 text-muted-foreground">$</span>
              {cost ? Number(cost).toLocaleString('es-CL', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }) : '—'}
            </div>
          </Field>
        ) : (
          <Field
            label="Costo unitario inicial"
            optional="CLP"
            error={errors.cost?.message}
            hint="Costo de partida. Luego se recalcula solo como promedio ponderado de los lotes (compras)."
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                $
              </span>
              <Input
                {...form.register('cost')}
                placeholder="0.00"
                inputMode="decimal"
                className="pl-7"
              />
            </div>
          </Field>
        ))}
      <Field
        label="Precio de venta"
        required
        error={errors.price?.message}
        hint={
          margin != null ? (
            <>
              Margen sobre el costo:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                +{margin}%
              </strong>
            </>
          ) : (
            'Precio final al que se vende la unidad.'
          )
        }
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
            $
          </span>
          <Input
            {...form.register('price')}
            placeholder="0.00"
            inputMode="decimal"
            className="pl-7 pr-14"
          />
          {margin != null && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              +{margin}%
            </span>
          )}
        </div>
      </Field>
      <Field
        label="Stock mínimo"
        error={errors.minStock?.message}
        hint="Cuando el stock baje de este valor se marcará como crítico."
      >
        <Input
          type="number"
          min={0}
          {...form.register('minStock')}
          placeholder="0"
        />
      </Field>
      <Field
        label="Stock actual"
        hint="Suma de todas las bodegas. Para ajustar, usá /inventario."
      >
        <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 font-mono text-sm font-semibold">
          {currentStock ?? '—'}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            un.
          </span>
        </div>
      </Field>
    </div>
  );
}

/* ============================================================
   CODES FIELD — refined list with quick-add input
   ============================================================ */

function CodesField({
  form,
  codes,
  errors,
}: {
  form: UseFormReturn<FormValues>;
  codes: UseFieldArrayReturn<FormValues, 'compatibleCodes'>;
  errors: FieldErrors<FormValues>;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    const v = draft.trim();
    if (!v) return;
    codes.append({ code: v });
    setDraft('');
  }

  return (
    <div className="space-y-3">
      {/* quick-add */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Escribí un código equivalente y presioná Enter…"
            className="pr-24 font-mono"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
              Enter
            </kbd>
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={commit}
          disabled={!draft.trim()}
        >
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      {codes.fields.length === 0 && (
        <EmptyState
          icon={<Copy className="h-5 w-5" />}
          title="Sin códigos compatibles"
          description="Los códigos equivalentes ayudan a que el cliente encuentre este SKU buscando por la referencia de otra marca."
        />
      )}

      {codes.fields.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
          {codes.fields.map((field, idx) => {
            const rowErrors = errors.compatibleCodes?.[idx];
            const hasErr = !!rowErrors?.code?.message;
            return (
              <div
                key={field.id}
                className={cn(
                  'group inline-flex h-8 items-center gap-2 rounded-full border bg-card pl-3 pr-1 font-mono text-xs',
                  hasErr ? 'border-destructive/60 text-destructive' : '',
                )}
              >
                <input
                  {...form.register(`compatibleCodes.${idx}.code`)}
                  className="w-[140px] border-0 bg-transparent p-0 font-mono outline-none focus:ring-0"
                  title={rowErrors?.code?.message}
                />
                <button
                  type="button"
                  onClick={() => codes.remove(idx)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Quitar"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Hasta 80 caracteres por código. Duplicados se marcan en rojo
        automáticamente.
      </p>
    </div>
  );
}

/* ============================================================
   PREVIEW CARD — sticky right column
   ============================================================ */

function PreviewCard({
  control,
  product,
  pendingImages,
  imageCount,
  fitmentsCount,
  codesCount,
  canSeeCost,
}: {
  control: Control<FormValues>;
  product?: ProductDto;
  pendingImages: File[];
  imageCount: number;
  fitmentsCount: number;
  codesCount: number;
  canSeeCost: boolean;
}) {
  const w = useWatch({ control });
  const name = w.name || (product?.name ?? '');
  const sku = w.sku || (product?.sku ?? '');
  const kind = w.productKind ?? 'ORIGINAL';
  const partNumber = w.partNumber ?? '';
  const barcode = w.barcode ?? '';
  const location = w.location ?? '';
  const minStock = w.minStock ?? 0;
  const costN = Number(w.cost || 0);
  const priceN = Number(w.price || 0);
  const margin =
    canSeeCost && costN > 0 && priceN > 0
      ? Math.round(((priceN - costN) / priceN) * 100)
      : null;

  // Cover image: pending first, then existing product cover, else gradient placeholder.
  // Nota: usamos useMemo + cleanup para revocar el ObjectURL y evitar fugas.
  const previewUrl = useMemo(() => {
    const first = pendingImages[0];
    if (first) return URL.createObjectURL(first);
    if (product?.coverUrl) return publicImageUrl(product.coverUrl);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImages, product?.coverUrl]);

  // Lista de imágenes para el lightbox: prioriza las del producto guardadas;
  // si está en modo "nuevo", cae a los archivos en memoria.
  const lightboxImages = useMemo(() => {
    if (product?.images?.length) {
      return product.images
        .map((i) => publicImageUrl(i.url) ?? '')
        .filter(Boolean);
    }
    return pendingImages.map((f) => URL.createObjectURL(f));
  }, [product?.images, pendingImages]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const canOpenLightbox = lightboxImages.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-md">
      {/* header */}
      <div className="flex items-center justify-between border-b px-3.5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Vista previa</span>
        <span className="flex items-center gap-1.5 font-sans text-[11px] font-medium normal-case tracking-normal text-emerald-600 dark:text-emerald-400">
          <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500">
            <span className="absolute inset-[-3px] animate-ping rounded-full bg-emerald-500/40" />
          </span>
          Live
        </span>
      </div>

      {/* cover */}
      <button
        type="button"
        onClick={() => canOpenLightbox && setLightboxOpen(true)}
        aria-label={canOpenLightbox ? 'Ver imagen ampliada' : undefined}
        className={cn(
          'relative block aspect-[4/3] w-full overflow-hidden',
          canOpenLightbox && 'cursor-zoom-in',
        )}
        disabled={!canOpenLightbox}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900">
            <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(255,255,255,0.18),transparent_60%)]" />
            <div className="absolute inset-0 flex items-center justify-center text-white/85">
              <Package className="h-16 w-16" strokeWidth={1.2} />
            </div>
          </div>
        )}
        {/* type badge */}
        <span
          className={cn(
            'absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-foreground backdrop-blur',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              kind === 'ORIGINAL' ? 'bg-emerald-500' : 'bg-blue-500',
            )}
          />
          {kind === 'ORIGINAL' ? 'Original' : 'Alternativo'}
        </span>
        {sku && (
          <span className="absolute bottom-3 left-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[11px] tracking-wide text-white backdrop-blur">
            {sku}
          </span>
        )}
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-medium text-foreground backdrop-blur">
          <ImageIcon className="h-3 w-3" />
          {imageCount}
        </span>
      </button>

      <ProductImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={lightboxImages}
      />

      {/* body */}
      <div className="px-4 py-4">
        <h4
          className={cn(
            'text-[15px] font-semibold leading-tight tracking-tight',
            !name && 'italic font-normal text-muted-foreground',
          )}
        >
          {name || 'Nuevo producto'}
        </h4>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <BrandCategoryLine control={control} product={product} />
        </p>

        <div className="mt-3.5 flex items-baseline justify-between border-t border-dashed pt-3.5">
          <div
            className={cn(
              'text-[22px] font-semibold tracking-tight tabular-nums',
              priceN === 0 && 'font-normal text-muted-foreground',
            )}
          >
            {priceN > 0 ? (
              <>
                <span className="mr-1 text-xs font-normal text-muted-foreground">
                  $
                </span>
                {formatCurrency(String(priceN)).replace(/^\$\s*/, '')}
              </>
            ) : (
              '$ 0,00'
            )}
          </div>
          <div className="text-right text-[11px] text-muted-foreground tabular-nums">
            {canSeeCost && (
              <div>costo {costN > 0 ? formatCurrency(String(costN)) : '$ 0,00'}</div>
            )}
            {margin != null && (
              <div className="mt-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                +{margin}% margen
              </div>
            )}
          </div>
        </div>

        {/* metadata grid */}
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t pt-3.5">
          <MetaRow
            k="Stock actual"
            v={`${product?.currentStock ?? '—'} un.`}
            muted={product?.currentStock == null}
          />
          <MetaRow k="Stock mín." v={String(minStock ?? 0)} />
          <MetaRow k="Ubicación" v={location || '—'} muted={!location} />
          <MetaRow
            k="N° de parte"
            v={partNumber || '—'}
            mono
            muted={!partNumber}
          />
          <MetaRow
            k="Cód. barras"
            v={barcode || '—'}
            mono
            muted={!barcode}
          />
        </div>

        {/* count chips */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3.5">
          <CountChip
            icon={<Car className="h-3 w-3" />}
            label="Vehículos"
            count={fitmentsCount}
          />
          <CountChip
            icon={<Copy className="h-3 w-3" />}
            label="Códigos"
            count={codesCount}
          />
          <CountChip
            icon={<ImageIcon className="h-3 w-3" />}
            label="Fotos"
            count={imageCount}
          />
        </div>
      </div>
    </div>
  );
}

/** Looks up the selected category + brand names for the preview line. */
function BrandCategoryLine({
  control,
  product,
}: {
  control: Control<FormValues>;
  product?: ProductDto;
}) {
  const categoryId = useWatch({ control, name: 'categoryId' });
  const brandId = useWatch({ control, name: 'brandId' });

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategories(),
  });
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands });

  const cat = (categories.data ?? []).find((c) => c.id === categoryId);
  const brand = (brands.data ?? []).find((b) => b.id === brandId);

  const brandName = brand?.name ?? product?.brand?.name ?? null;
  const catName = cat?.name ?? product?.category?.name ?? null;

  if (!brandName && !catName) return <span>Sin marca · Sin categoría</span>;
  return (
    <>
      <span className="font-medium text-foreground">
        {brandName || 'Sin marca'}
      </span>
      <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/40" />
      <span>{catName || 'Sin categoría'}</span>
    </>
  );
}

function MetaRow({
  k,
  v,
  mono,
  muted,
}: {
  k: string;
  v: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {k}
      </div>
      <div
        className={cn(
          'text-[12.5px] font-medium',
          mono && 'font-mono text-[11.5px]',
          muted && 'font-normal text-muted-foreground',
        )}
      >
        {v}
      </div>
    </div>
  );
}

function CountChip({
  icon,
  label,
  count,
}: {
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <span className="text-muted-foreground/80">{icon}</span>
      <span>{label}</span>
      <span className="font-mono text-[10px] font-semibold tabular-nums text-foreground">
        {count}
      </span>
    </span>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <kbd className="inline-flex shrink-0 items-center justify-center rounded border bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground">
        {keys}
      </kbd>
      <span>{label}</span>
    </li>
  );
}

/* ============================================================
   EMPTY STATE
   ============================================================ */

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-[40ch] text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   PENDING IMAGES UPLOADER — refined drop zone + grid
   Mantiene el flujo original: archivos en memoria hasta el create,
   luego sube de a uno via `uploadProductImage(productId, file)`.
   ============================================================ */

function PendingImagesUploader({
  files,
  onChange,
}: {
  files: File[];
  onChange: (next: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    Array.from(list).forEach((f) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
        toast.error(
          `"${f.name}": formato no permitido. JPG, PNG o WEBP únicamente.`,
        );
        return;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        toast.error(`"${f.name}": pesa más de 10 MB.`);
        return;
      }
      next.push(f);
    });
    onChange(next);
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= files.length) return;
    const a = files[idx];
    const b = files[j];
    if (!a || !b) return;
    const next = [...files];
    next[idx] = b;
    next[j] = a;
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-xl border border-dashed bg-muted/30 px-6 py-8 text-center transition-colors',
          dragOver && 'border-foreground bg-accent/50',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border bg-card text-muted-foreground">
          <Upload className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Arrastrá imágenes acá</p>
        <p className="mt-1 text-xs text-muted-foreground">
          o seleccionalas desde tu equipo
        </p>
        <Button
          type="button"
          size="sm"
          className="mt-3"
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" />
          Elegir archivos
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          JPG, PNG o WEBP · hasta 10 MB c/u · se suben al crear el producto
        </p>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f, idx) => (
            <div
              key={`${f.name}-${idx}`}
              className="group relative aspect-square overflow-hidden rounded-xl border bg-muted/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(f)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              {idx === 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white">
                  Portada
                </span>
              )}
              <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 font-mono text-[10px] font-semibold text-white backdrop-blur">
                {idx + 1}
              </span>
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/55 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                {idx !== 0 && (
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-foreground hover:bg-white"
                    title="Definir como portada / mover arriba"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-foreground hover:bg-white"
                  title="Reordenar"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, i) => i !== idx))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/95 text-destructive hover:bg-white"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <div className="flex flex-col items-center gap-1">
              <Plus className="h-5 w-5" />
              <span>Agregar</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ERROR HELPERS (preserved exactly as in the original)
   ============================================================ */

export function ErrorBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} error${count === 1 ? '' : 'es'}`}
      className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground"
    >
      {count}
    </span>
  );
}

function countTabErrors(
  errors: Record<string, unknown>,
  fields: string[],
): number {
  return fields.reduce((acc, f) => (errors[f] ? acc + 1 : acc), 0);
}

// Cuenta errores dentro de un FieldArray (cada índice puede tener errores en
// distintas sub-claves; cuenta una unidad por fila con al menos un error).
function countArrayErrors(arrayErrors: unknown): number {
  if (!arrayErrors) return 0;
  let total = 0;
  if (Array.isArray(arrayErrors)) {
    for (const row of arrayErrors) {
      if (row && typeof row === 'object' && Object.keys(row).length > 0)
        total += 1;
    }
  }
  // El error a nivel raíz (ej. el superRefine) suma 1 más si existe.
  if (
    typeof arrayErrors === 'object' &&
    arrayErrors !== null &&
    'root' in (arrayErrors as Record<string, unknown>) &&
    (arrayErrors as { root?: unknown }).root
  ) {
    total += 1;
  }
  return total;
}
