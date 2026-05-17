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
 * Ronda 7 — Detalle de marca de vehículo. Muestra:
 *  - Modelos de esa marca (lista corta).
 *  - Productos compatibles con cualquier modelo de esa marca (lista grande).
 *
 * Sin selección múltiple ni acciones masivas.
 */
export default function VehicleMakeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const makesQ = useQuery({
    queryKey: ['vehicle-makes'],
    queryFn: listVehicleMakes,
  });
  const make = (makesQ.data ?? []).find((m) => m.id === id) ?? null;

  const modelsQ = useQuery({
    queryKey: ['vehicle-models', id],
    queryFn: () => listVehicleModels(id),
    enabled: !!id,
  });
  const models = modelsQ.data ?? [];

  // Productos compatibles con cualquier modelo de esta marca.
  const productsQ = useQuery({
    queryKey: ['products-by-vehicle', { makeId: id }],
    queryFn: () => productsByVehicle({ makeId: id }),
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
          <h1 className="text-2xl font-semibold">{make?.name ?? 'Marca'}</h1>
          <p className="text-sm text-muted-foreground">
            {models.length} modelo{models.length === 1 ? '' : 's'} ·{' '}
            {products.length} producto{products.length === 1 ? '' : 's'}{' '}
            compatible{products.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Modelos */}
      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Modelos de {make?.name ?? '—'}</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modelo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelsQ.isLoading && (
              <TableRow>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
              </TableRow>
            )}
            {!modelsQ.isLoading && models.length === 0 && (
              <TableRow>
                <TableCell className="text-center text-muted-foreground">
                  Sin modelos.
                </TableCell>
              </TableRow>
            )}
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link
                    href={`/vehiculos/modelos/${m.id}`}
                    className="hover:underline"
                  >
                    {m.name}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Productos compatibles */}
      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Productos compatibles</h2>
        </div>
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Marca producto</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productsQ.isLoading && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!productsQ.isLoading && products.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Ningún producto del catálogo es compatible con esta marca.
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
