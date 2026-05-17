'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
  getNoMovementCsvUrl,
  getNoMovementReport,
} from '@/lib/dashboard-api';
import { formatCurrency } from '@/lib/format';
import { useUrlFilters } from '@/lib/use-url-filters';

const DAYS_OPTIONS = [30, 60, 90, 180];

/**
 * Fase 9 — Reporte de productos sin movimiento. Lista los productos
 * activos que no tuvieron ningún `inventory_movement` en los últimos N
 * días (default 30). Útil para detectar stock estancado.
 *
 * Cada fila muestra: SKU + nombre, categoría, marca, stock total, valor
 * inmovilizado, última fecha de movimiento y días transcurridos.
 *
 * Acción: exportar CSV con BOM UTF-8 (Excel detecta acentos).
 */
export default function SinMovimientoReportPage() {
  const { values, setFilter } = useUrlFilters({ days: '' });
  const days = Number(values.days || '30');

  const q = useQuery({
    queryKey: ['no-movement-report', days],
    queryFn: () => getNoMovementReport(days),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.totalProducts ?? 0;
  const inventoryValue = q.data?.totalInventoryValue ?? '0';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Productos sin movimiento</h1>
          <p className="text-sm text-muted-foreground">
            Productos activos que no tuvieron ningún movimiento de inventario
            (compra, venta, ajuste, devolución, transferencia) en el período.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={String(days)}
            onValueChange={(v) => setFilter('days', v === '30' ? null : v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  Últimos {d} días
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="outline">
            <a href={getNoMovementCsvUrl(days)} download>
              <Download className="h-4 w-4" />
              Exportar CSV
            </a>
          </Button>
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Productos sin movimiento
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{total}</div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Valor inmovilizado
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {formatCurrency(inventoryValue)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Suma de stock × costo unitario
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead className="text-right">Stock total</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Último movimiento</TableHead>
              <TableHead className="text-right">Días</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!q.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Todos los productos tuvieron movimiento en los últimos {days}{' '}
                  días.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.productId}>
                <TableCell className="font-mono text-xs">
                  <Link
                    href={`/productos/${r.productId}`}
                    className="hover:underline"
                  >
                    {r.sku}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/productos/${r.productId}`}
                    className="hover:underline"
                  >
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.categoryName ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.brandName ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.totalStock}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.inventoryValue)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.lastMovementAt
                    ? new Date(r.lastMovementAt).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })
                    : <em>nunca</em>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.daysSinceLastMovement !== null ? r.daysSinceLastMovement : '∞'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
