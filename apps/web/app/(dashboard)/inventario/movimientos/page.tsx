'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
import { listMovements } from '@/lib/inventory-api';
import type { MovementDto } from '@inventory/shared';

const ALL = '__all__';

const MOVEMENT_TYPES: Array<{ value: MovementDto['type']; label: string }> = [
  { value: 'PURCHASE_IN', label: 'Compra' },
  { value: 'SALE_OUT', label: 'Venta' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
  { value: 'RETURN_IN', label: 'Devolución entrada' },
  { value: 'RETURN_OUT', label: 'Devolución salida' },
];

export default function MovimientosPage() {
  const [type, setType] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [page, setPage] = useState(1);

  const movs = useQuery({
    queryKey: ['movements', { type, dateFrom, dateTo, page }],
    queryFn: () =>
      listMovements({
        type: type === ALL ? undefined : (type as MovementDto['type']),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: 50,
      }),
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((movs.data?.total ?? 0) / 50)),
    [movs.data],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v);
            setPage(1);
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
            setDateFrom(e.target.value);
            setPage(1);
          }}
          placeholder="Desde"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
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
                  {m.unitCost ? `$${m.unitCost}` : '—'}
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

function TypeBadge({ type }: { type: MovementDto['type'] }) {
  const map: Record<MovementDto['type'], { label: string; cls: string }> = {
    PURCHASE_IN: { label: 'Compra', cls: 'bg-stock-ok/15 text-stock-ok' },
    SALE_OUT: { label: 'Venta', cls: 'bg-blue-500/15 text-blue-600' },
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
