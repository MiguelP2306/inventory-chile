'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QuickOpFromSaleDialog } from '@/components/quick-op-from-sale-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ReturnStatusBadge,
  ReturnTypeBadge,
} from '@/components/return-status-badge';
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
import { listReturns } from '@/lib/returns-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { ReturnStatusDto, ReturnTypeDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

export default function DevolucionesPage() {
  const filters = useUrlFilters({
    type: '',
    status: '',
    q: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });

  const type = values.type || ALL;
  const status = values.status || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const filtersActive =
    type !== ALL ||
    status !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    search.value !== '';

  const list = useQuery({
    queryKey: ['returns', { type, status, debouncedQ, dateFrom, dateTo, page }],
    queryFn: () =>
      listReturns({
        type: type === ALL ? undefined : (type as ReturnTypeDto),
        status: status === ALL ? undefined : (status as ReturnStatusDto),
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

  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Devoluciones</h1>
          <p className="text-sm text-muted-foreground">
            Devoluciones de clientes (RETURN_IN al stock) y devoluciones a
            proveedores (RETURN_OUT).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Limpiar filtros
            </Button>
          )}
          {/* Ronda 9 — op rápida: elegir venta + crear devolución sin entrar al detalle. */}
          <Button onClick={() => setQuickOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva devolución
          </Button>
        </div>
      </div>

      <QuickOpFromSaleDialog
        action="return"
        open={quickOpen}
        onOpenChange={setQuickOpen}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <Input
          placeholder="Buscar (número, motivo)"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
        />
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
            <SelectItem value="CUSTOMER">De cliente</SelectItem>
            <SelectItem value="SUPPLIER">A proveedor</SelectItem>
          </SelectContent>
        </Select>
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
            <SelectItem value="COMPLETED">Completada</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
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
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="text-right">Reembolso</TableHead>
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
                  Sin devoluciones.
                </TableCell>
              </TableRow>
            )}
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/devoluciones/${r.id}`} className="hover:underline">
                    {r.number}
                  </Link>
                </TableCell>
                <TableCell>
                  {new Date(r.date).toLocaleDateString('es-CL', {
                    dateStyle: 'short',
                  })}
                </TableCell>
                <TableCell>
                  <ReturnTypeBadge type={r.type} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.type === 'CUSTOMER' ? r.sale?.number ?? '—' : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(r.refundAmount)}
                </TableCell>
                <TableCell>
                  <ReturnStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" title="Ver detalle">
                    <Link href={`/devoluciones/${r.id}`}>
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
          {total} devoluci{total === 1 ? 'ón' : 'ones'}
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
