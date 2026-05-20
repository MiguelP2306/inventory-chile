'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
  { value: 'RETURN_IN_DAMAGED', label: 'Devolución dañada (sin stock)' },
  { value: 'RETURN_DAMAGED_CANCELLED', label: 'Dev. dañada cancelada (auditoría)' },
  { value: 'TRANSFER_OUT', label: 'Transferencia salida' },
  { value: 'TRANSFER_IN', label: 'Transferencia entrada' },
  { value: 'DISPATCH_OUT', label: 'Guía despacho generada (auditoría)' },
  { value: 'DISPATCH_VOIDED', label: 'Guía despacho anulada (auditoría)' },
];

export default function MovimientosPage() {
  const { values, setFilter, clear } = useUrlFilters({
    type: '',
    dateFrom: '',
    dateTo: '',
    view: '',
    page: '',
  });
  const type = values.type || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const page = Number(values.page || '1');
  // Ronda 9 — modo de visualización: 'grouped' (default) agrupa por refId,
  // 'flat' muestra todas las filas individuales como antes.
  const view = (values.view as 'grouped' | 'flat') || 'grouped';

  // Estado expandido por groupKey (refId). Set para perf y simplicidad.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  // Ronda 9 — agrupación por `refId + type stem`. Los movimientos sin
  // refId (ajustes manuales) quedan como filas individuales. El tipo
  // "stem" colapsa por familia: PURCHASE_IN, SALE_OUT, RETURN_IN, etc.
  // sale.id + DISPATCH_OUT genera un grupo distinto del sale.id + SALE_OUT
  // (para que el operador vea el despacho aparte de la venta).
  type Group = {
    key: string;
    refId: string | null;
    reference: string | null;
    type: MovementDto['type'];
    date: string;
    itemCount: number;
    qtyTotal: number;
    items: MovementDto[];
  };
  const groups = useMemo<Group[]>(() => {
    if (view !== 'grouped' || !movs.data) return [];
    const map = new Map<string, Group>();
    for (const m of movs.data.items) {
      // Sin refId → grupo de 1 fila (key único por id).
      const key = m.refId ? `${m.refId}::${m.type}` : `single::${m.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.itemCount += 1;
        existing.qtyTotal += m.qty;
        existing.items.push(m);
      } else {
        map.set(key, {
          key,
          refId: m.refId,
          reference: m.reference,
          type: m.type,
          date: m.createdAt,
          itemCount: 1,
          qtyTotal: m.qty,
          items: [m],
        });
      }
    }
    // Orden: por fecha desc (más reciente del grupo).
    return Array.from(map.values()).sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
  }, [view, movs.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
        <div className="flex items-center gap-2">
          {/* Ronda 9 — toggle agrupada/plana. */}
          <div className="inline-flex rounded-md border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setFilter('view', null)}
              className={`px-3 py-1 text-xs ${
                view === 'grouped'
                  ? 'rounded-md bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Agrupada
            </button>
            <button
              type="button"
              onClick={() => setFilter('view', 'flat')}
              className={`px-3 py-1 text-xs ${
                view === 'flat'
                  ? 'rounded-md bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Plana
            </button>
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clear}>
              Limpiar filtros
            </Button>
          )}
        </div>
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
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              {view === 'grouped' && <TableHead className="w-[40px]" />}
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>{view === 'grouped' ? 'Referencia' : 'Producto'}</TableHead>
              <TableHead className="text-right">
                {view === 'grouped' ? 'Items / Qty total' : 'Cantidad'}
              </TableHead>
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
                    <TableCell colSpan={view === 'grouped' ? 8 : 7}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {movs.data && movs.data.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={view === 'grouped' ? 8 : 7}
                  className="text-center text-muted-foreground"
                >
                  Sin movimientos en el período.
                </TableCell>
              </TableRow>
            )}

            {/* Vista plana — fila por movimiento como antes */}
            {view === 'flat' &&
              movs.data?.items.map((m) => (
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
                        <span className="text-xs text-muted-foreground">
                          {m.product.sku ?? ''}
                        </span>
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

            {/* Vista agrupada — fila padre + hijas expandibles */}
            {view === 'grouped' &&
              groups.map((g) => {
                const isOpen = expanded.has(g.key);
                const isSingleton = g.itemCount === 1 && !g.refId;
                return (
                  <>
                    <TableRow
                      key={g.key}
                      onClick={() => !isSingleton && toggleExpanded(g.key)}
                      className={
                        isSingleton ? '' : 'cursor-pointer hover:bg-accent/50'
                      }
                    >
                      <TableCell>
                        {!isSingleton &&
                          (isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          ))}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {new Date(g.date).toLocaleString('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell>
                        <TypeBadge type={g.type} />
                      </TableCell>
                      <TableCell>
                        {isSingleton ? (
                          g.items[0]!.product ? (
                            <>
                              <span className="font-medium">
                                {g.items[0]!.product!.name}
                              </span>{' '}
                              <span className="text-xs text-muted-foreground">
                                {g.items[0]!.product!.sku ?? ''}
                              </span>
                            </>
                          ) : (
                            '—'
                          )
                        ) : (
                          <span className="font-mono text-sm">
                            {g.reference ?? '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          g.qtyTotal < 0 ? 'text-destructive' : 'text-stock-ok'
                        }`}
                      >
                        {isSingleton ? (
                          <>
                            {g.qtyTotal > 0 ? '+' : ''}
                            {g.qtyTotal}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {g.itemCount} item{g.itemCount === 1 ? '' : 's'} ·{' '}
                            <span
                              className={
                                g.qtyTotal < 0
                                  ? 'text-destructive'
                                  : 'text-stock-ok'
                              }
                            >
                              {g.qtyTotal > 0 ? '+' : ''}
                              {g.qtyTotal}
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {isSingleton && g.items[0]!.unitCost
                          ? formatCurrency(g.items[0]!.unitCost!)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {g.reference ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {g.items[0]!.user?.email ?? '—'}
                      </TableCell>
                    </TableRow>
                    {isOpen &&
                      !isSingleton &&
                      g.items.map((m) => (
                        <TableRow key={`${g.key}::${m.id}`} className="bg-muted/30">
                          <TableCell />
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {new Date(m.createdAt).toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell />
                          <TableCell>
                            {m.product ? (
                              <>
                                <span className="text-sm">
                                  {m.product.name}
                                </span>{' '}
                                <span className="text-xs text-muted-foreground">
                                  {m.product.sku ?? ''}
                                </span>
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
                          <TableCell />
                          <TableCell />
                        </TableRow>
                      ))}
                  </>
                );
              })}
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
    // Ronda 7 — la devolución dañada no toca stock; usamos color destructivo
    // suave para diferenciarla visualmente de las que sí afectan inventario.
    RETURN_IN_DAMAGED: {
      label: 'Dev. dañada (sin stock)',
      cls: 'bg-destructive/15 text-destructive',
    },
    TRANSFER_OUT: {
      label: 'Transf. salida',
      cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    },
    TRANSFER_IN: {
      label: 'Transf. entrada',
      cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    },
    // Ronda 8 — eventos audit-only de guía de despacho y cancelación de
    // devoluciones dañadas. No tocan stock; los pintamos con un color
    // neutro para distinguirlos de los movimientos "reales".
    DISPATCH_OUT: {
      label: 'Guía generada',
      cls: 'bg-muted text-muted-foreground',
    },
    DISPATCH_VOIDED: {
      label: 'Guía anulada',
      cls: 'bg-muted text-muted-foreground',
    },
    RETURN_DAMAGED_CANCELLED: {
      label: 'Dev. dañada cancelada',
      cls: 'bg-muted text-muted-foreground',
    },
  };
  const { label, cls } = map[type];
  return (
    <Badge className={`border-transparent ${cls}`} variant="default">
      {label}
    </Badge>
  );
}
