'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  listBrands,
  listCategories,
  listProducts,
  listVehicleMakes,
  listVehicleModels,
  productsByVehicle,
} from '@/lib/catalog-api';
import type { ProductDto } from '@inventory/shared';

const ALL = '__all__';

export default function ProductosPage() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [brandId, setBrandId] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  // Búsqueda por vehículo
  const [vehMakeId, setVehMakeId] = useState<string>(ALL);
  const [vehModelId, setVehModelId] = useState<string>(ALL);
  const [vehYear, setVehYear] = useState<string>('');
  const vehicleSearchActive = vehMakeId !== ALL || vehModelId !== ALL || vehYear !== '';

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const brands = useQuery({ queryKey: ['brands'], queryFn: listBrands });
  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  const models = useQuery({
    queryKey: ['vehicle-models', vehMakeId],
    queryFn: () => listVehicleModels(vehMakeId === ALL ? undefined : vehMakeId),
    enabled: makes.data !== undefined,
  });

  const list = useQuery({
    queryKey: ['products', { q: debouncedQ, categoryId, brandId, page }],
    queryFn: () =>
      listProducts({
        q: debouncedQ || undefined,
        categoryId: categoryId === ALL ? undefined : categoryId,
        brandId: brandId === ALL ? undefined : brandId,
        page,
        pageSize: 20,
      }),
    enabled: !vehicleSearchActive,
  });

  const byVehicle = useQuery({
    queryKey: ['products-by-vehicle', { vehMakeId, vehModelId, vehYear }],
    queryFn: () =>
      productsByVehicle({
        makeId: vehMakeId === ALL ? undefined : vehMakeId,
        modelId: vehModelId === ALL ? undefined : vehModelId,
        year: vehYear ? Number(vehYear) : undefined,
      }),
    enabled: vehicleSearchActive,
  });

  const items: ProductDto[] = vehicleSearchActive
    ? (byVehicle.data ?? [])
    : (list.data?.items ?? []);
  const total = vehicleSearchActive ? items.length : (list.data?.total ?? 0);
  const totalPages = useMemo(() => {
    if (vehicleSearchActive) return 1;
    return Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  }, [list.data, vehicleSearchActive]);

  function clearVehicleSearch() {
    setVehMakeId(ALL);
    setVehModelId(ALL);
    setVehYear('');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <Button asChild>
          <Link href="/productos/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </Button>
      </div>

      {/* Filtros principales */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          placeholder="Buscar por SKU, número de parte, código de barras o nombre"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {categories.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={brandId}
          onValueChange={(v) => {
            setBrandId(v);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las marcas</SelectItem>
            {brands.data?.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Búsqueda por vehículo */}
      <div className="rounded-md border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Buscar por vehículo compatible</h2>
          {vehicleSearchActive && (
            <Button variant="ghost" size="sm" onClick={clearVehicleSearch}>
              Limpiar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            value={vehMakeId}
            onValueChange={(v) => {
              setVehMakeId(v);
              setVehModelId(ALL);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>—</SelectItem>
              {makes.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={vehModelId}
            onValueChange={setVehModelId}
            disabled={vehMakeId === ALL}
          >
            <SelectTrigger>
              <SelectValue placeholder="Modelo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>—</SelectItem>
              {models.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Año (ej: 2015)"
            value={vehYear}
            onChange={(e) => setVehYear(e.target.value)}
            min={1900}
            max={2100}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.isLoading || byVehicle.isLoading) && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && !byVehicle.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => (
              <TableRow key={p.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs">
                  <Link href={`/productos/${p.id}`} className="hover:underline">
                    {p.sku}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/productos/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.category?.name ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.brand?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">${p.cost}</TableCell>
                <TableCell className="text-right tabular-nums">${p.price}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!vehicleSearchActive && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} producto{total === 1 ? '' : 's'} · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
