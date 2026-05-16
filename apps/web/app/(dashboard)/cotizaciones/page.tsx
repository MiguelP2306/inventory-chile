'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { QuotationFormDialog } from '@/components/forms/quotation-form-dialog';
import { QuotationStatusBadge } from '@/components/quotation-status-badge';
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
import { listQuotations } from '@/lib/quotations-api';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { QuotationStatusDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: QuotationStatusDto; label: string }[] = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SENT', label: 'Enviada' },
  { value: 'APPROVED', label: 'Aprobada' },
  { value: 'REJECTED', label: 'Rechazada' },
  { value: 'CONVERTED', label: 'Convertida' },
  { value: 'EXPIRED', label: 'Vencida' },
];

export default function CotizacionesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

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
    queryKey: [
      'quotations',
      { status, q: debouncedQ, dateFrom, dateTo, page },
    ],
    queryFn: () =>
      listQuotations({
        status: status === ALL ? undefined : (status as QuotationStatusDto),
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

  const [dialogOpen, setDialogOpen] = useState(false);

  // ?new=1 abre el modal automáticamente y limpia el query param.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDialogOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('new');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cotizaciones</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nueva cotización
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <Input
          placeholder="Buscar (número, cliente, RUT)"
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
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
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
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Sin cotizaciones.
                </TableCell>
              </TableRow>
            )}
            {items.map((q) => {
              const editable =
                q.status !== 'CONVERTED' && q.status !== 'EXPIRED';
              const customerLabel = q.customerView.name?.trim() || 'Sin cliente';
              return (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/cotizaciones/${q.id}`}
                      className="hover:underline"
                    >
                      {q.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {new Date(q.date).toLocaleDateString('es-CL', {
                      dateStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell
                    className={
                      'max-w-[260px] truncate' +
                      (q.customerView.name ? '' : ' text-muted-foreground italic')
                    }
                  >
                    {customerLabel}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q.items?.length ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(q.total)}
                  </TableCell>
                  <TableCell>
                    <QuotationStatusBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {q.validUntil
                      ? new Date(q.validUntil).toLocaleDateString('es-CL', {
                          dateStyle: 'short',
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        title="Ver detalle"
                      >
                        <Link href={`/cotizaciones/${q.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {editable && (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          title="Editar"
                        >
                          <Link href={`/cotizaciones/${q.id}?edit=1`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} cotización{total === 1 ? '' : 'es'}
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
              onClick={() =>
                setFilter('page', String(Math.min(totalPages, page + 1)))
              }
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>

      <QuotationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['quotations'] });
        }}
      />
    </div>
  );
}
