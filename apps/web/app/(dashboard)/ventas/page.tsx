'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SaleFormDialog } from '@/components/forms/sale-form-dialog';
import { SaleStatusBadge } from '@/components/sale-status-badge';
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
import { getSalesKpis, listSales } from '@/lib/sales-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { PaymentMethodDto, SaleStatusDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: SaleStatusDto; label: string }[] = [
  { value: 'PAID', label: 'Pagada' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const METHOD_OPTIONS: { value: PaymentMethodDto; label: string }[] = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  // Ronda 9 — CARD se desdobló por subtipo (mismas comisiones distintas).
  { value: 'CARD_DEBIT', label: 'Débito' },
  { value: 'CARD_CREDIT', label: 'Crédito' },
  { value: 'PAYMENT_LINK', label: 'Link de pago' },
];

export default function VentasPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const filters = useUrlFilters({
    status: '',
    method: '',
    q: '',
    dateFrom: '',
    dateTo: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const status = values.status || ALL;
  const method = values.method || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');

  const debouncedQ = (values.q ?? '').trim();
  const filtersActive =
    status !== ALL ||
    method !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    search.value !== '';

  // Ronda 12 — KPIs del mes actual + top productos/clientes. Se cargan
  // arriba de la tabla, independientes de los filtros del listado.
  const kpis = useQuery({
    queryKey: ['sales', 'kpis'],
    queryFn: () => getSalesKpis(),
  });

  const list = useQuery({
    queryKey: [
      'sales',
      { status, method, q: debouncedQ, dateFrom, dateTo, page },
    ],
    queryFn: () =>
      listSales({
        status: status === ALL ? undefined : (status as SaleStatusDto),
        paymentMethod:
          method === ALL ? undefined : (method as PaymentMethodDto),
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
        <h1 className="text-2xl font-semibold">Ventas</h1>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Limpiar filtros
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva venta
          </Button>
        </div>
      </div>

      {/* Ronda 12 — KPIs del mes actual. 4 cards arriba. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Vendido este mes"
          value={
            kpis.data ? formatCurrency(kpis.data.totalAmount) : 'Cargando…'
          }
          hint={kpis.data ? `${kpis.data.count} venta(s)` : ''}
        />
        <KpiCard
          label="Promedio por venta"
          value={
            kpis.data ? formatCurrency(kpis.data.averageAmount) : 'Cargando…'
          }
          hint="Mes actual"
        />
        <KpiCard
          label="Vendido hoy"
          value={
            kpis.data ? formatCurrency(kpis.data.todayAmount) : 'Cargando…'
          }
          hint={kpis.data ? `${kpis.data.todayCount} venta(s) hoy` : ''}
        />
        <KpiCard
          label="Última venta"
          value={
            kpis.data?.lastSale
              ? formatCurrency(kpis.data.lastSale.total)
              : 'Sin ventas'
          }
          hint={
            kpis.data?.lastSale
              ? `${kpis.data.lastSale.customerName} · ${new Date(
                  kpis.data.lastSale.date,
                ).toLocaleDateString('es-CL')}`
              : ''
          }
        />
      </div>

      {/* Ronda 12 — Top productos y clientes del mes. */}
      {kpis.data &&
        (kpis.data.topProducts.length > 0 ||
          kpis.data.topCustomers.length > 0) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-md border bg-card">
              <div className="border-b p-3">
                <h2 className="text-sm font-medium">
                  Top productos vendidos del mes
                </h2>
              </div>
              {kpis.data.topProducts.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Sin ventas en el período.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpis.data.topProducts.map((p) => (
                      <TableRow key={p.productId}>
                        <TableCell>
                          <Link
                            href={`/productos/${p.productId}`}
                            className="hover:underline"
                          >
                            <div className="text-sm font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.sku ?? '—'}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.qty}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(p.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="rounded-md border bg-card">
              <div className="border-b p-3">
                <h2 className="text-sm font-medium">
                  Top clientes frecuentes del mes
                </h2>
              </div>
              {kpis.data.topCustomers.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Sin ventas en el período.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Ventas</TableHead>
                      <TableHead className="text-right">Monto total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpis.data.topCustomers.map((c) => (
                      <TableRow key={c.customerId}>
                        <TableCell>
                          <Link
                            href={`/clientes/${c.customerId}`}
                            className="hover:underline"
                          >
                            <div className="text-sm font-medium">
                              {c.customerName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.customerTaxId ?? 'sin RUT'}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.salesCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(c.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}

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
        <Select
          value={method}
          onValueChange={(v) => {
            setFilter('method', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Método" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los métodos</SelectItem>
            {METHOD_OPTIONS.map((o) => (
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
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Estado</TableHead>
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
                  Sin ventas.
                </TableCell>
              </TableRow>
            )}
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/ventas/${s.id}`} className="hover:underline">
                    {s.number}
                  </Link>
                </TableCell>
                <TableCell>
                  {new Date(s.date).toLocaleDateString('es-CL', {
                    dateStyle: 'short',
                  })}
                </TableCell>
                <TableCell className="max-w-[260px] truncate">
                  {s.customer?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.items?.length ?? 0}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(s.total)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {METHOD_OPTIONS.find((o) => o.value === s.paymentMethod)?.label ??
                    s.paymentMethod}
                </TableCell>
                <TableCell>
                  <SaleStatusBadge status={s.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="icon" title="Ver detalle">
                    <Link href={`/ventas/${s.id}`}>
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
          {total} venta{total === 1 ? '' : 's'}
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

      <SaleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['sales'] });
        }}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
