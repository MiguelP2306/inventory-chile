'use client';

import { useQuery } from '@tanstack/react-query';
import { Paperclip, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { publicDocumentUrl } from '@/lib/cashbox-api';
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
import {
  getPurchasesKpis,
  listPurchases,
  listSuppliers,
} from '@/lib/inventory-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarehouses } from '@/lib/warehouses-api';
import type { WarehouseDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

export default function ComprasPage() {
  // Ronda 7 — filtros agregados: bodega, rango de total. Antes solo
  // proveedor + rango de fecha. Estos dos nuevos viven en URL como el resto
  // para compartir links/refrescar sin perder el filtro.
  const filters = useUrlFilters({
    supplier: '',
    warehouse: '',
    dateFrom: '',
    dateTo: '',
    totalMin: '',
    totalMax: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const supplierId = values.supplier || ALL;
  const warehouseId = values.warehouse || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  // Ronda 8 — totalMin/totalMax con estado local debounceado. Antes cada
  // tecla disparaba router.replace y se perdían caracteres al escribir
  // rápido (mismo bug que se solucionó para inputs `q` en Ronda 1). El
  // `value` local alimenta el input (responde instantáneo); la URL recibe
  // el push 300 ms después y es lo que dispara la query.
  const totalMinFilter = useDebouncedUrlFilter(filters, 'totalMin', {
    resetKeys: ['page'],
  });
  const totalMaxFilter = useDebouncedUrlFilter(filters, 'totalMax', {
    resetKeys: ['page'],
  });
  const totalMin = values.totalMin ?? '';
  const totalMax = values.totalMax ?? '';
  const page = Number(values.page || '1');

  const filtersActive =
    supplierId !== ALL ||
    warehouseId !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    totalMinFilter.value !== '' ||
    totalMaxFilter.value !== '';

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });
  const warehouses = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses(),
  });
  const warehouseList = (
    Array.isArray(warehouses.data)
      ? warehouses.data
      : warehouses.data?.items ?? []
  ) as WarehouseDto[];

  // Ronda 9 — KPIs del mes actual (default sin params). Se muestran como cards
  // arriba de la tabla, independientes de los filtros aplicados a la lista.
  const kpis = useQuery({
    queryKey: ['purchases', 'kpis'],
    queryFn: () => getPurchasesKpis(),
  });

  const list = useQuery({
    queryKey: [
      'purchases',
      { supplierId, warehouseId, dateFrom, dateTo, totalMin, totalMax, page },
    ],
    queryFn: () =>
      listPurchases({
        supplierId: supplierId === ALL ? undefined : supplierId,
        warehouseId: warehouseId === ALL ? undefined : warehouseId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        totalMin: totalMin || undefined,
        totalMax: totalMax || undefined,
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
        <h1 className="text-2xl font-semibold">Compras</h1>
        <Button asChild>
          <Link href="/compras/nuevo">
            <Plus className="h-4 w-4" />
            Nueva entrada
          </Link>
        </Button>
      </div>

      {/* Ronda 9 — KPIs del mes actual. Clicables: cada card filtra la
          tabla según corresponda (mes actual o devoluciones). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total comprado (mes)"
          value={
            kpis.data ? formatCurrency(kpis.data.totalAmount) : 'Cargando…'
          }
          hint={kpis.data ? `${kpis.data.count} compra(s)` : ''}
        />
        <KpiCard
          label="Promedio por compra"
          value={
            kpis.data ? formatCurrency(kpis.data.averageAmount) : 'Cargando…'
          }
          hint="Mes actual"
        />
        <KpiCard
          label="Devoluciones a proveedor"
          value={
            kpis.data ? formatCurrency(kpis.data.returnsAmount) : 'Cargando…'
          }
          hint={kpis.data ? `${kpis.data.returnsCount} devolución(es)` : ''}
        />
        <KpiCard
          label="Última compra"
          value={
            kpis.data?.lastPurchase
              ? formatCurrency(kpis.data.lastPurchase.total)
              : 'Sin compras'
          }
          hint={
            kpis.data?.lastPurchase
              ? `${kpis.data.lastPurchase.supplierName} · ${new Date(
                  kpis.data.lastPurchase.date,
                ).toLocaleDateString('es-CL')}`
              : ''
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          value={supplierId}
          onValueChange={(v) => {
            setFilter('supplier', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los proveedores</SelectItem>
            {suppliers.data?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={warehouseId}
          onValueChange={(v) => {
            setFilter('warehouse', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Bodega destino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las bodegas</SelectItem>
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
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Total mínimo (CLP)"
          value={totalMinFilter.value}
          onChange={(e) => totalMinFilter.setValue(e.target.value)}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Total máximo (CLP)"
          value={totalMaxFilter.value}
          onChange={(e) => totalMaxFilter.setValue(e.target.value)}
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
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Bodega</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-[80px] text-center">Facturas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
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
                  Sin compras registradas todavía.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => {
              // Ronda 7 — invoices viene como array. Mostramos el conteo +
              // el link del primero (los demás se ven en el detalle).
              const invoiceCount = p.invoices?.length ?? 0;
              const firstInvoice = invoiceCount > 0 ? p.invoices![0] : null;
              const firstUrl = firstInvoice
                ? publicDocumentUrl(firstInvoice.url)
                : null;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/compras/${p.id}`}
                      className="hover:underline"
                    >
                      {new Date(p.date).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{p.supplier?.name ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {p.warehouse?.name ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {p.notes ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(p.subtotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(p.taxAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(p.total)}
                  </TableCell>
                  <TableCell className="text-center">
                    {invoiceCount > 0 && firstUrl ? (
                      <a
                        href={firstUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={
                          invoiceCount === 1
                            ? 'Ver factura'
                            : `${invoiceCount} archivos — abrir primero`
                        }
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Paperclip className="h-4 w-4" />
                        {invoiceCount > 1 && (
                          <span className="text-xs">×{invoiceCount}</span>
                        )}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} compra{total === 1 ? '' : 's'} · página {page} de {totalPages}
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
