'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
  listVehicleMakes,
  listVehicleModels,
  productsByVehicle,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';

/**
 * Ronda 7 — Detalle de modelo de vehículo: productos compatibles con este
 * modelo específico. El operador llega acá desde /vehiculos tab Modelos
 * haciendo click en el nombre del modelo.
 */
export default function VehicleModelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // Cargamos todos los modelos y todas las marcas para resolver el nombre
  // del modelo + su marca (las queries son pequeñas y se cachean).
  const makesQ = useQuery({
    queryKey: ['vehicle-makes'],
    queryFn: listVehicleMakes,
  });
  const modelsQ = useQuery({
    queryKey: ['vehicle-models', 'all'],
    queryFn: () => listVehicleModels(),
  });
  const model = (modelsQ.data ?? []).find((m) => m.id === id) ?? null;
  const make = model
    ? (makesQ.data ?? []).find((m) => m.id === model.makeId) ?? null
    : null;

  const productsQ = useQuery({
    queryKey: ['products-by-vehicle', { modelId: id }],
    queryFn: () => productsByVehicle({ modelId: id }),
    enabled: !!id,
  });
  const products = productsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/vehiculos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            {make?.name ? `${make.name} ` : ''}
            {model?.name ?? 'Modelo'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {products.length} producto{products.length === 1 ? '' : 's'}{' '}
            compatible{products.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Marca producto</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productsQ.isLoading && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!productsQ.isLoading && products.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Ningún producto del catálogo es compatible con este modelo.
                </TableCell>
              </TableRow>
            )}
            {products.map((p) => (
              <TableRow key={p.id}>
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
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(p.price)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
