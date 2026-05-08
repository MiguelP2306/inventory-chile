'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { formatCurrency } from '@/lib/format';
import { listMovements } from '@/lib/inventory-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { MovementDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 50;

const MOVEMENT_TYPES: Array<{ value: MovementDto['type']; label: string }> = [
  { value: 'PURCHASE_IN', label: 'Compra' },
  { value: 'SALE_OUT', label: 'Venta' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
  { value: 'RETURN_IN', label: 'Devolución entrada' },
  { value: 'RETURN_OUT', label: 'Devolución salida' },
];

export default function MovimientosPage() {
  const { values, setFilter, clear } = useUrlFilters({
    type: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const type = values.type || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');

  const filtersActive = type !== ALL || dateFrom !== '' || dateTo !== '';

  const movs = useQuery({
    queryKey: ['movements', { type, dateFrom, dateTo, page }],
    queryFn: () =>
      listMovements({
        type: type === ALL ? undefined : (type as MovementDto['type']),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((movs.data?.total ?? 0) / PAGE_SIZE)),
    [movs.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Select
          value={type}
          onValueChange={(v) => {
            setFilter('type', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {MOVEMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setFilter('dateFrom', e.target.value || null);
            setFilter('page', null);
          }}
          placeholder="Desde"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setFilter('dateTo', e.target.value || null);
            setFilter('page', null);
          }}
          placeholder="Hasta"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Costo unit.</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Usuario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movs.isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {movs.data && movs.data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin movimientos en el período.
                </TableCell>
              </TableRow>
            )}
            {movs.data?.items.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">
                  {new Date(m.createdAt).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </TableCell>
                <TableCell>
                  <TypeBadge type={m.type} />
                </TableCell>
                <TableCell>
                  {m.product ? (
                    <>
                      <span className="font-medium">{m.product.name}</span>{' '}
                      <span className="text-xs text-muted-foreground">{m.product.sku}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${
                    m.qty < 0 ? 'text-destructive' : 'text-stock-ok'
                  }`}
                >
                  {m.qty > 0 ? '+' : ''}
                  {m.qty}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {m.unitCost ? formatCurrency(m.unitCost) : '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.reference ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.user?.email ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {movs.data && movs.data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {movs.data.total} movimiento{movs.data.total === 1 ? '' : 's'} · página {page} de{' '}
            {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
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

function TypeBadge({ type }: { type: MovementDto['type'] }) {
  const map: Record<MovementDto['type'], { label: string; cls: string }> = {
    PURCHASE_IN: { label: 'Compra', cls: 'bg-stock-ok/15 text-stock-ok' },
    SALE_OUT: { label: 'Venta', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-300' },
    ADJUSTMENT: { label: 'Ajuste', cls: 'bg-stock-low/15 text-stock-low' },
    RETURN_IN: { label: 'Dev. entrada', cls: 'bg-stock-ok/15 text-stock-ok' },
    RETURN_OUT: { label: 'Dev. salida', cls: 'bg-stock-out/15 text-stock-out' },
  };
  const { label, cls } = map[type];
  return (
    <Badge className={`border-transparent ${cls}`} variant="default">
      {label}
    </Badge>
  );
}
