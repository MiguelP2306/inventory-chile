'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  apiErrorMessage,
  createProduct,
  listBrands,
  listCategories,
  listVehicleMakes,
  listVehicleModels,
  updateProduct,
  type ProductInput,
} from '@/lib/catalog-api';
import type { ProductDto } from '@inventory/shared';

const NULL_OPTION = '__none__';

const fitmentSchema = z.object({
  modelId: z.string().uuid('Elegí un modelo'),
  yearFrom: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  yearTo: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
});

const schema = z
  .object({
    sku: z.string().min(1, 'SKU obligatorio').max(60),
    name: z.string().min(1, 'Nombre obligatorio').max(200),
    partNumber: z.string().max(80).optional().or(z.literal('')),
    barcode: z.string().max(80).optional().or(z.literal('')),
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
  })
  .refine(
    (v) =>
      !v.fitments?.some(
        (f) => f.yearFrom != null && f.yearTo != null && f.yearFrom > f.yearTo,
      ),
    { message: 'En los fitments, "Desde" debe ser <= "Hasta"', path: ['fitments'] },
  );

type FormValues = z.infer<typeof schema>;

interface Props {
  product?: ProductDto;
}

export function ProductForm({ product }: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  // Cargamos TODOS los modelos para poder mostrarlos sin filtrar por marca,
  // ya que cada fitment puede ser de una marca distinta.
  const models = useQuery({ queryKey: ['vehicle-models'], queryFn: () => listVehicleModels() });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      partNumber: product?.partNumber ?? '',
      barcode: product?.barcode ?? '',
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
    },
  });
  const fitments = useFieldArray({ control: form.control, name: 'fitments' });

  const mut = useMutation({
    mutationFn: (input: ProductInput) =>
      product ? updateProduct(product.id, input) : createProduct(input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-by-vehicle'] });
      toast.success(product ? 'Producto actualizado' : 'Producto creado');
      router.push(`/productos/${saved.id}`);
      router.refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo guardar')),
  });

  function onSubmit(values: FormValues) {
    const input: ProductInput = {
      sku: values.sku,
      name: values.name,
      partNumber: values.partNumber || null,
      barcode: values.barcode || null,
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
    };
    mut.mutate(input);
  }

  const errors = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {product ? `Editar producto` : 'Nuevo producto'}
        </h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? 'Guardando...' : product ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="precios">Precios y stock</TabsTrigger>
          <TabsTrigger value="compat">Compatibilidad ({fitments.fields.length})</TabsTrigger>
        </TabsList>

        {/* DATOS */}
        <TabsContent value="datos" className="space-y-4 rounded-md border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="SKU" error={errors.sku?.message}>
              <Input {...form.register('sku')} placeholder="ej: BUJ-001" />
            </Field>
            <Field label="Nombre" error={errors.name?.message}>
              <Input {...form.register('name')} placeholder="ej: Bujía iridio NGK" />
            </Field>
            <Field label="Número de parte" error={errors.partNumber?.message}>
              <Input {...form.register('partNumber')} placeholder="ej: IFR6T11" />
            </Field>
            <Field label="Código de barras" error={errors.barcode?.message}>
              <Input {...form.register('barcode')} placeholder="ej: 7891234567890" />
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
                      {categories.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
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
          <p className="text-sm text-muted-foreground">
            El stock real se gestiona desde Inventario (Fase 3). Acá sólo definís el mínimo
            para activar la alerta amarilla del semáforo.
          </p>
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
            {fitments.fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-6">
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
                <div className="col-span-2">
                  <Label className="text-xs">Desde</Label>
                  <Input
                    type="number"
                    min={1900}
                    max={2100}
                    placeholder="—"
                    {...form.register(`fitments.${idx}.yearFrom`, {
                      setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                    })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Hasta</Label>
                  <Input
                    type="number"
                    min={1900}
                    max={2100}
                    placeholder="—"
                    {...form.register(`fitments.${idx}.yearTo`, {
                      setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                    })}
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
            ))}
          </div>
          {errors.fitments?.message && (
            <p className="text-sm text-destructive">{errors.fitments.message}</p>
          )}
        </TabsContent>
      </Tabs>
    </form>
  );
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
