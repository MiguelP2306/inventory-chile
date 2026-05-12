'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Eye, Plus } from 'lucide-react';
import Link from 'next/link';
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
import { TransferStatusBadge } from '@/components/transfer-status-badge';
import { listTransfers } from '@/lib/transfers-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarehouses } from '@/lib/warehouses-api';
import type { TransferStatusDto, WarehouseDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: TransferStatusDto; label: string }[] = [
  { value: 'COMPLETED', label: 'Completada' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

export default function TransferenciasPage() {
  const filters = useUrlFilters({
    status: '',
    from: '',
    to: '',
    q: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });

  const status = values.status || ALL;
  const fromW = values.from || ALL;
  const toW = values.to || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const filtersActive =
    status !== ALL ||
    fromW !== ALL ||
    toW !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    search.value !== '';

  // En filtros mostramos TODAS las bodegas (activas + inactivas) para que el
  // operador pueda filtrar transferencias antiguas hacia bodegas hoy inactivas.
  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses(),
  });
  const warehouseList =
    (Array.isArray(warehouses.data)
      ? warehouses.data
      : warehouses.data?.items ?? []) as WarehouseDto[];

  const list = useQuery({
    queryKey: ['transfers', { status, fromW, toW, debouncedQ, dateFrom, dateTo, page }],
    queryFn: () =>
      listTransfers({
        status: status === ALL ? undefined : (status as TransferStatusDto),
        fromWarehouseId: fromW === ALL ? undefined : fromW,
        toWarehouseId: toW === ALL ? undefined : toW,
        q: debouncedQ || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Transferencias entre bodegas</h1>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Limpiar filtros
            </Button>
          )}
          <Button asChild>
            <Link href="/transferencias/nueva">
              <Plus className="h-4 w-4" />
              Nueva transferencia
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        <Input
          placeholder="Buscar (número o bodega)"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          className="md:col-span-2"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setFilter('status', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={fromW}
          onValueChange={(v) => {
            setFilter('from', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Origen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los orígenes</SelectItem>
            {warehouseList.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
                {!w.isActive ? ' (inactiva)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={toW}
          onValueChange={(v) => {
            setFilter('to', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Destino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los destinos</SelectItem>
            {warehouseList.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
                {!w.isActive ? ' (inactiva)' : ''}
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
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setFilter('dateTo', e.target.value || null);
            setFilter('page', null);
          }}
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Origen → Destino</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
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
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin transferencias.
                </TableCell>
              </TableRow>
            )}
            {items.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/transferencias/${t.id}`} className="hover:underline">
                    {t.number}
                  </Link>
                </TableCell>
                <TableCell>
                  {new Date(t.date).toLocaleDateString('es-CL', {
                    dateStyle: 'short',
                  })}
                </TableCell>
                <TableCell className="text-sm">
                  <span className="font-medium">{t.fromWarehouse?.name ?? '—'}</span>
                  <ArrowRight className="mx-2 inline h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{t.toWarehouse?.name ?? '—'}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.items?.length ?? 0}
                </TableCell>
                <TableCell>
                  <TransferStatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" title="Ver detalle">
                    <Link href={`/transferencias/${t.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} transferencia{total === 1 ? '' : 's'}
          {total > 0 ? ` · página ${page} de ${totalPages}` : ''}
        </span>
        {total > 0 && (
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
        )}
      </div>
    </div>
  );
}
