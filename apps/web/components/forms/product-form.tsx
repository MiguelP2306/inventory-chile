'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
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
  updateProduct,
  uploadProductImage,
  type ProductInput,
} from '@/lib/catalog-api';
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
    partNumber: z
      .string()
      .min(1, 'Número de parte obligatorio')
      .max(80),
    barcode: z.string().max(80).optional().or(z.literal('')),
    universalCode: z.string().max(80).optional().or(z.literal('')),
    productKind: z.enum(['ORIGINAL', 'ALTERNATIVE']),
    description: z.string().optional().or(z.literal('')),
    categoryId: z.string().optional(),
    brandId: z.string().optional(),
    cost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00').optional().or(z.literal('')),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Formato 0.00').optional().or(z.literal('')),
    minStock: z.coerce.number().int().min(0).optional(),
    maxStock: z.coerce.number().int().min(0).optional().nullable(),
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

export function ProductForm({ product }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Solo se usa en modo "nuevo": archivos cargados antes de que exista el productId.
  const [pendingImages, setPendingImages] = useState<File[]>([]);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategories(),
  });
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  const models = useQuery({ queryKey: ['vehicle-models'], queryFn: () => listVehicleModels() });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      partNumber: product?.partNumber ?? '',
      barcode: product?.barcode ?? '',
      universalCode: product?.universalCode ?? '',
      productKind: (product?.productKind as ProductKindDto) ?? 'ORIGINAL',
      description: product?.description ?? '',
      categoryId: product?.categoryId ?? NULL_OPTION,
      brandId: product?.brandId ?? NULL_OPTION,
      cost: product?.cost ?? '',
      price: product?.price ?? '',
      minStock: product?.minStock ?? 0,
      maxStock: product?.maxStock ?? null,
      location: product?.location ?? '',
      isActive: product?.isActive ?? true,
      fitments: product?.fitments?.map((f) => ({
        modelId: f.modelId,
        yearFrom: f.yearFrom ?? null,
        yearTo: f.yearTo ?? null,
      })) ?? [],
      compatibleCodes:
        product?.compatibleCodes?.map((code) => ({ code })) ?? [],
    },
  });
  const fitments = useFieldArray({ control: form.control, name: 'fitments' });
  const codes = useFieldArray({ control: form.control, name: 'compatibleCodes' });

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
    mutationFn: () => (product ? deleteProduct(product.id) : Promise.reject('no product')),
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
  }

  function onSubmit(values: FormValues) {
    if (mut.isPending) return;
    const input: ProductInput = {
      // Ronda 9 — null si el operador no cargó SKU → backend autogenera.
      sku: values.sku?.trim() ? values.sku.trim() : null,
      name: values.name,
      partNumber: values.partNumber,
      barcode: values.barcode || null,
      universalCode: values.universalCode || null,
      productKind: values.productKind,
      description: values.description || null,
      categoryId: values.categoryId === NULL_OPTION ? null : values.categoryId ?? null,
      brandId: values.brandId === NULL_OPTION ? null : values.brandId ?? null,
      cost: values.cost || '0',
      price: values.price || '0',
      minStock: values.minStock ?? 0,
      maxStock: values.maxStock ?? null,
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

  const errorsAsRecord = errors as unknown as Record<string, unknown>;
  const errorCounts = {
    datos: countTabErrors(errorsAsRecord, [
      'sku',
      'name',
      'partNumber',
      'barcode',
      'universalCode',
      'productKind',
      'categoryId',
      'brandId',
      'location',
      'description',
      'isActive',
    ]),
    precios: countTabErrors(errorsAsRecord, ['cost', 'price', 'minStock', 'maxStock']),
    compat: countArrayErrors(errors.fitments),
    codigos: countArrayErrors(errors.compatibleCodes),
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {product ? `Editar producto` : 'Nuevo producto'}
        </h1>
        <div className="flex gap-2">
          {product && (
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
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : product ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="datos">
            Datos
            <ErrorBadge count={errorCounts.datos} />
          </TabsTrigger>
          <TabsTrigger value="precios">
            Precios y stock
            <ErrorBadge count={errorCounts.precios} />
          </TabsTrigger>
          <TabsTrigger value="compat">
            Compatibilidad ({fitments.fields.length})
            <ErrorBadge count={errorCounts.compat} />
          </TabsTrigger>
          <TabsTrigger value="codigos">
            Códigos ({codes.fields.length})
            <ErrorBadge count={errorCounts.codigos} />
          </TabsTrigger>
          <TabsTrigger value="imagenes">
            Imágenes ({product ? (product.images?.length ?? 0) : pendingImages.length})
          </TabsTrigger>
        </TabsList>

        {/* DATOS */}
        <TabsContent value="datos" className="space-y-4 rounded-md border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="SKU"
              error={errors.sku?.message}
              hint="Opcional — se autogenera (AUTO-AAAA-NNNNN) si lo dejás vacío."
            >
              <Input {...form.register('sku')} placeholder="ej: BUJ-001 (opcional)" />
            </Field>
            <Field label="Nombre *" error={errors.name?.message}>
              <Input {...form.register('name')} placeholder="ej: Bujía iridio NGK" />
            </Field>
            <Field label="Número de parte *" error={errors.partNumber?.message}>
              <Input {...form.register('partNumber')} placeholder="ej: IFR6T11" />
            </Field>
            <Field label="Código de barras" error={errors.barcode?.message}>
              <Input {...form.register('barcode')} placeholder="ej: 7891234567890" />
            </Field>
            <Field label="Código universal" error={errors.universalCode?.message}>
              <Input
                {...form.register('universalCode')}
                placeholder="ej: 7891234567890"
              />
            </Field>
            <Field label="Tipo (origen)" error={errors.productKind?.message}>
              <Controller
                control={form.control}
                name="productKind"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ORIGINAL">Original</SelectItem>
                      <SelectItem value="ALTERNATIVE">Alternativo</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Categoría">
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value || NULL_OPTION} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
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
                          ...(childrenByParent.get(r.id) ?? []).map((child) => (
                            <SelectItem
                              key={child.id}
                              value={child.id}
                              className="pl-8"
                            >
                              {r.name} › {child.name}
                            </SelectItem>
                          )),
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
                  <Select value={field.value || NULL_OPTION} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Sin marca" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NULL_OPTION}>Sin marca</SelectItem>
                      {brands.data?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Ubicación física" error={errors.location?.message}>
              <Input {...form.register('location')} placeholder="ej: Estante A3" />
            </Field>
            <div className="flex items-end gap-2">
              <input
                id="isActive"
                type="checkbox"
                {...form.register('isActive')}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="isActive">Activo</Label>
            </div>
          </div>
          <Field label="Descripción">
            <textarea
              {...form.register('description')}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
        </TabsContent>

        {/* PRECIOS Y STOCK */}
        <TabsContent value="precios" className="space-y-4 rounded-md border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Costo (unidad)" error={errors.cost?.message}>
              <Input {...form.register('cost')} placeholder="0.00" inputMode="decimal" />
            </Field>
            <Field label="Precio de venta" error={errors.price?.message}>
              <Input {...form.register('price')} placeholder="0.00" inputMode="decimal" />
            </Field>
            <Field label="Stock mínimo" error={errors.minStock?.message}>
              <Input type="number" min={0} {...form.register('minStock')} />
            </Field>
            <Field label="Stock máximo (opcional)" error={errors.maxStock?.message}>
              <Input type="number" min={0} {...form.register('maxStock')} />
            </Field>
          </div>
        </TabsContent>

        {/* COMPATIBILIDAD */}
        <TabsContent value="compat" className="space-y-4 rounded-md border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Vehículos compatibles</h3>
              <p className="text-sm text-muted-foreground">
                Asociá el producto a marca/modelo de vehículo y opcionalmente un rango de
                años. Si dejás los años en blanco, aplica para cualquier año.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fitments.append({ modelId: '', yearFrom: null, yearTo: null })}
              disabled={!makes.data || makes.data.length === 0}
            >
              <Plus className="h-4 w-4" />
              Agregar fila
            </Button>
          </div>

          {makes.data && makes.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay marcas de vehículo cargadas. Creá primero en Vehículos.
            </p>
          )}

          {fitments.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin compatibilidades. Agregá una con el botón de arriba.
            </p>
          )}

          <div className="space-y-3">
            {fitments.fields.map((field, idx) => {
              const rowErrors = errors.fitments?.[idx];
              return (
                <div key={field.id} className="space-y-1">
                  <div className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-12 md:col-span-6">
                      <Label className="text-xs">Vehículo</Label>
                      <Controller
                        control={form.control}
                        name={`fitments.${idx}.modelId`}
                        render={({ field: f }) => (
                          <Select value={f.value} onValueChange={f.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Marca / modelo" />
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
                    </div>
                    <div className="col-span-5 md:col-span-2">
                      <Label className="text-xs">Desde</Label>
                      <Controller
                        control={form.control}
                        name={`fitments.${idx}.yearFrom`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value != null ? String(f.value) : NULL_OPTION}
                            onValueChange={(v) => f.onChange(v === NULL_OPTION ? null : Number(v))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NULL_OPTION}>—</SelectItem>
                              {YEAR_OPTIONS.map((y) => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="col-span-5 md:col-span-2">
                      <Label className="text-xs">Hasta</Label>
                      <Controller
                        control={form.control}
                        name={`fitments.${idx}.yearTo`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value != null ? String(f.value) : NULL_OPTION}
                            onValueChange={(v) => f.onChange(v === NULL_OPTION ? null : Number(v))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NULL_OPTION}>—</SelectItem>
                              {YEAR_OPTIONS.map((y) => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fitments.remove(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {(rowErrors?.modelId?.message || rowErrors?.yearFrom?.message ||
                    rowErrors?.yearTo?.message) && (
                    <p className="text-xs text-destructive">
                      {rowErrors?.modelId?.message ||
                        rowErrors?.yearFrom?.message ||
                        rowErrors?.yearTo?.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {errors.fitments?.root?.message && (
            <p className="text-sm text-destructive">{errors.fitments.root.message}</p>
          )}
        </TabsContent>

        {/* CÓDIGOS COMPATIBLES */}
        <TabsContent value="codigos" className="space-y-4 rounded-md border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Códigos compatibles</h3>
              <p className="text-sm text-muted-foreground">
                Códigos de productos equivalentes o intercambiables. Aparecen en la búsqueda
                — un cliente que escribe uno de estos códigos encuentra el producto.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => codes.append({ code: '' })}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>

          {codes.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin códigos compatibles. Agregá uno con el botón de arriba.
            </p>
          )}

          <div className="space-y-2">
            {codes.fields.map((field, idx) => {
              const rowErrors = errors.compatibleCodes?.[idx];
              return (
                <div key={field.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input
                      {...form.register(`compatibleCodes.${idx}.code`)}
                      placeholder="Código compatible"
                    />
                    {rowErrors?.code?.message && (
                      <p className="mt-1 text-xs text-destructive">
                        {rowErrors.code.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => codes.remove(idx)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* IMÁGENES */}
        <TabsContent value="imagenes" className="rounded-md border bg-card p-6">
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

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar producto?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción es permanente. El producto &ldquo;{product?.name}&rdquo; se eliminará del
            catálogo. Si tiene movimientos de inventario asociados, no podrá eliminarse y tendrás
            que desactivarlo en su lugar.
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
              {removeMut.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

/**
 * Uploader local para modo "nuevo" — guarda los `File` en memoria hasta que
 * el producto se crea, momento en el cual se suben uno a uno via
 * `uploadProductImage(productId, file)`.
 */
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
        toast.error(`"${f.name}": formato no permitido. JPG, PNG o WEBP únicamente.`);
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Las imágenes se subirán automáticamente después de crear el producto. La primera se
        marca como portada.
      </p>
      <div
        className={cn(
          'rounded-md border-2 border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-primary bg-accent/40' : 'border-muted-foreground/30',
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
        <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Arrastrá imágenes acá o</p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
        >
          Elegir archivos
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          JPG, PNG o WEBP · máximo 10 MB por archivo
        </p>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {files.map((f, idx) => (
            <div
              key={`${f.name}-${idx}`}
              className="relative overflow-hidden rounded-md border bg-muted/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(f)}
                alt=""
                className="aspect-square w-full object-cover"
              />
              {idx === 0 && (
                <div className="absolute left-2 top-2 rounded bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                  Portada
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-end p-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 text-destructive"
                  onClick={() => onChange(files.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ErrorBadge({ count }: { count: number }) {
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
      if (row && typeof row === 'object' && Object.keys(row).length > 0) total += 1;
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
