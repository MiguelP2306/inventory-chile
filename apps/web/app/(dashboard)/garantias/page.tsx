'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
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
import { WarrantyStatusBadge } from '@/components/warranty-status-badge';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarrantyClaims } from '@/lib/warranties-api';
import type { WarrantyStatusDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: WarrantyStatusDto; label: string }[] = [
  { value: 'OPEN', label: 'Abierto' },
  { value: 'IN_REVIEW', label: 'En revisión' },
  { value: 'APPROVED', label: 'Aprobado' },
  { value: 'REJECTED', label: 'Rechazado' },
  { value: 'RESOLVED', label: 'Resuelto' },
];

export default function GarantiasPage() {
  const filters = useUrlFilters({
    status: '',
    q: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });

  const status = values.status || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const filtersActive =
    status !== ALL || dateFrom !== '' || dateTo !== '' || search.value !== '';

  const list = useQuery({
    queryKey: ['warranty-claims', { status, debouncedQ, dateFrom, dateTo, page }],
    queryFn: () =>
      listWarrantyClaims({
        status: status === ALL ? undefined : (status as WarrantyStatusDto),
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
        <div>
          <h1 className="text-2xl font-semibold">Reclamos de garantía</h1>
          <p className="text-sm text-muted-foreground">
            Seguimiento de reclamos sobre productos vendidos. No afectan stock — si
            la resolución implica cambio o reembolso, se hace una devolución aparte.
          </p>
        </div>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input
          placeholder="Buscar (número, producto, cliente)"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
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
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Abierto</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Venta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin reclamos de garantía.
                </TableCell>
              </TableRow>
            )}
            {items.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/garantias/${w.id}`} className="hover:underline">
                    {w.number}
                  </Link>
                </TableCell>
                <TableCell>
                  {new Date(w.openedAt).toLocaleDateString('es-CL', {
                    dateStyle: 'short',
                  })}
                </TableCell>
                <TableCell className="max-w-[260px] truncate">
                  {w.product?.name ?? '—'}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {w.customer?.name ?? '—'}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {w.sale?.number ?? '—'}
                </TableCell>
                <TableCell>
                  <WarrantyStatusBadge status={w.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" title="Ver detalle">
                    <Link href={`/garantias/${w.id}`}>
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
          {total} reclamo{total === 1 ? '' : 's'}
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
