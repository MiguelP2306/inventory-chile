'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  FileDown,
  Filter as FilterIcon,
  Package as PackageIcon,
  Search,
  Tag as TagIcon,
  User as UserIcon,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ContactFilter, type ContactValue } from '@/components/movement-cards/contact-filter';
import { ProductFilter, type ProductValue } from '@/components/movement-cards/product-filter';
import { MovementCard } from '@/components/movement-cards';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { apiAbsoluteUrl } from '@/lib/api';
import { getProduct } from '@/lib/catalog-api';
import { getCustomer } from '@/lib/customers-api';
import { getSupplier, listMovementCards } from '@/lib/inventory-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { cn } from '@/lib/utils';
import { listWarehouses } from '@/lib/warehouses-api';
import type { MovementDto, WarehouseDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const MOVEMENT_TYPES: Array<{ value: MovementDto['type']; label: string }> = [
  { value: 'PURCHASE_IN', label: 'Compra' },
  { value: 'SALE_OUT', label: 'Venta' },
  { value: 'ADJUSTMENT', label: 'Ajuste manual' },
  { value: 'RETURN_IN', label: 'Devolución (entrada)' },
  { value: 'RETURN_OUT', label: 'Devolución (salida)' },
  { value: 'RETURN_IN_DAMAGED', label: 'Dev. dañada (auditoría)' },
  { value: 'RETURN_DAMAGED_CANCELLED', label: 'Dev. dañada cancelada (auditoría)' },
  { value: 'TRANSFER_OUT', label: 'Transferencia salida' },
  { value: 'TRANSFER_IN', label: 'Transferencia entrada' },
  { value: 'DISPATCH_OUT', label: 'Guía despacho (auditoría)' },
  { value: 'DISPATCH_VOIDED', label: 'Guía anulada (auditoría)' },
];

type StatusFilter = '' | 'active' | 'cancelled';

/**
 * Movimientos de inventario — diseño N2 Smart Filters.
 *
 * UI nueva:
 *  · Search prominente + filtros como chips compactos en una sola toolbar.
 *  · Barra de "Filtros activos" con tags removibles individualmente.
 *  · Status toggle (Todos / Activos / Cancelados) a la derecha.
 *  · Cards intactas (MovementCard) — preservan toda la lógica de Ronda 13.
 *
 * Lógica original preservada 1:1:
 *  · useUrlFilters con los mismos 10 keys (type, warehouseId, dateFrom, dateTo,
 *    q, customerId, supplierId, productId, status, page).
 *  · useDebouncedUrlFilter para el search.
 *  · Hidratación de contacto/producto desde URL con useQuery + enabled.
 *  · Limpieza automática de IDs fantasma si el GET devuelve 404.
 *  · listMovementCards con todos los filtros.
 *  · Reglas customerId/supplierId mutuamente excluyentes.
 */
export default function MovimientosPage() {
  const filters = useUrlFilters({
    type: '',
    warehouseId: '',
    dateFrom: '',
    dateTo: '',
    q: '',
    customerId: '',
    supplierId: '',
    productId: '',
    status: '',
    page: '',
  });
  const { values, setFilter, setFilters, clear } = filters;
  const { value: qLocal, setValue: setQ } = useDebouncedUrlFilter(filters, 'q', {
    resetKeys: ['page'],
  });
  const type = values.type || ALL;
  const warehouseId = values.warehouseId || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const customerId = values.customerId || '';
  const supplierId = values.supplierId || '';
  const productId = values.productId || '';
  const status = (values.status || '') as StatusFilter;
  const page = Number(values.page || '1');

  const filtersActive =
    type !== ALL ||
    warehouseId !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    qLocal.trim() !== '' ||
    customerId !== '' ||
    supplierId !== '' ||
    productId !== '' ||
    status !== '';

  // ============================================================
  // Hidratación de contacto / producto desde URL (preservada 1:1)
  // ============================================================
  const customerQuery = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomer(customerId),
    enabled: !!customerId,
    staleTime: 5 * 60_000,
  });
  const supplierQuery = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => getSupplier(supplierId),
    enabled: !!supplierId,
    staleTime: 5 * 60_000,
  });
  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId),
    enabled: !!productId,
    staleTime: 5 * 60_000,
  });

  const contactValue: ContactValue | null = useMemo(() => {
    if (customerId && customerQuery.data) {
      return {
        kind: 'customer',
        id: customerQuery.data.id,
        name: customerQuery.data.name,
        taxId: customerQuery.data.taxId,
      };
    }
    if (supplierId && supplierQuery.data) {
      return {
        kind: 'supplier',
        id: supplierQuery.data.id,
        name: supplierQuery.data.name,
        taxId: supplierQuery.data.taxId,
      };
    }
    return null;
  }, [customerId, customerQuery.data, supplierId, supplierQuery.data]);

  const productValue: ProductValue | null = useMemo(() => {
    if (!productId || !productQuery.data) return null;
    return {
      id: productQuery.data.id,
      sku: productQuery.data.sku,
      name: productQuery.data.name,
    };
  }, [productId, productQuery.data]);

  useEffect(() => {
    if (customerId && customerQuery.isError) setFilter('customerId', null);
  }, [customerId, customerQuery.isError, setFilter]);
  useEffect(() => {
    if (supplierId && supplierQuery.isError) setFilter('supplierId', null);
  }, [supplierId, supplierQuery.isError, setFilter]);
  useEffect(() => {
    if (productId && productQuery.isError) setFilter('productId', null);
  }, [productId, productQuery.isError, setFilter]);

  const warehouses = useQuery({
    queryKey: ['warehouses', { all: true }],
    queryFn: () => listWarehouses({}),
  });
  const warehousesList: WarehouseDto[] = useMemo(() => {
    const data = warehouses.data;
    if (!data) return [];
    return Array.isArray(data) ? data : data.items;
  }, [warehouses.data]);

  const cards = useQuery({
    queryKey: [
      'movements-cards',
      {
        type,
        warehouseId,
        dateFrom,
        dateTo,
        q: values.q,
        customerId,
        supplierId,
        productId,
        status,
        page,
      },
    ],
    queryFn: () =>
      listMovementCards({
        type: type === ALL ? undefined : (type as MovementDto['type']),
        warehouseId: warehouseId === ALL ? undefined : warehouseId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        q: values.q || undefined,
        customerId: customerId || undefined,
        supplierId: supplierId || undefined,
        productId: productId || undefined,
        status: status === '' ? undefined : status,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((cards.data?.total ?? 0) / PAGE_SIZE)),
    [cards.data],
  );

  const selectedType = MOVEMENT_TYPES.find((t) => t.value === type);
  const selectedWarehouse = warehousesList.find((w) => w.id === warehouseId);

  return (
    <div className="flex flex-col gap-4">
      {/* ============================================================
          PAGE HEAD
          ============================================================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Movimientos de inventario
          </h1>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Cada card muestra una transacción completa (venta, compra, devolución,
            transferencia, ajuste o evento de auditoría).
            {cards.data && (
              <>
                {' · '}
                <strong className="font-medium tabular-nums text-foreground">
                  {cards.data.total}
                </strong>{' '}
                transacciones
              </>
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={apiAbsoluteUrl(
              `inventory/movements.xlsx${buildMovementsExportQuery({
                productId: values.productId || undefined,
                warehouseId: values.warehouseId || undefined,
                type: values.type || undefined,
                dateFrom: values.dateFrom || undefined,
                dateTo: values.dateTo || undefined,
              })}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            title="Exporta movimientos atómicos respetando los filtros de producto, bodega, tipo y fecha. Los filtros de cliente/proveedor/búsqueda libre se aplican solo a la vista de cards."
          >
            <FileDown className="h-4 w-4" />
            Exportar Excel
          </a>
        </Button>
      </div>

      {/* ============================================================
          SMART TOOLBAR — search + chips + status toggle
          ============================================================ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex h-9 min-w-[260px] max-w-[420px] flex-1 items-center gap-2 rounded-lg border bg-card px-3 transition-shadow focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={qLocal}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nro, cliente, proveedor o producto…"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {qLocal && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className='flex flex-col gap-2 w-full sm:flex-row'>
          {/* Cliente o proveedor — wrap del ContactFilter para que parezca chip */}
          <ContactFilter
            value={contactValue}
            onChange={(next) => {
              if (!next) {
                setFilters({ customerId: null, supplierId: null, page: null });
              } else if (next.kind === 'customer') {
                setFilters({ customerId: next.id, supplierId: null, page: null });
              } else {
                setFilters({ supplierId: next.id, customerId: null, page: null });
              }
            }}
          />

          {/* Producto — idem */}
          <ProductFilter
            value={productValue}
            onChange={(next) =>
              setFilters({ productId: next?.id ?? null, page: null })
            }
          />
        </div>

        {/* Tipo */}
        <ChipPopover
          icon={<TagIcon className="h-3.5 w-3.5" />}
          label="Tipo"
          value={type !== ALL ? selectedType?.label : null}
          active={type !== ALL}
        >
          {(close) => (
            <SimpleList
              title="Tipo de movimiento"
              current={type}
              onClear={() => {
                setFilter('type', null);
                setFilter('page', null);
                close();
              }}
              options={[
                { value: ALL, label: 'Todos los tipos' },
                ...MOVEMENT_TYPES,
              ]}
              onPick={(v) => {
                setFilter('type', v === ALL ? null : v);
                setFilter('page', null);
                close();
              }}
            />
          )}
        </ChipPopover>

        {/* Bodega */}
        <ChipPopover
          icon={<WarehouseIcon className="h-3.5 w-3.5" />}
          label="Bodega"
          value={warehouseId !== ALL ? selectedWarehouse?.name ?? null : null}
          active={warehouseId !== ALL}
          disabled={warehousesList.length === 0}
        >
          {(close) => (
            <SimpleList
              title="Bodega"
              current={warehouseId}
              onClear={() => {
                setFilter('warehouseId', null);
                setFilter('page', null);
                close();
              }}
              options={[
                { value: ALL, label: 'Todas las bodegas' },
                ...warehousesList.map((w) => ({ value: w.id, label: w.name })),
              ]}
              onPick={(v) => {
                setFilter('warehouseId', v === ALL ? null : v);
                setFilter('page', null);
                close();
              }}
            />
          )}
        </ChipPopover>


        {/* Fechas — popover con 2 inputs date */}
        <ChipPopover
          icon={<CalendarIcon className="h-3.5 w-3.5" />}
          label="Fechas"
          value={
            dateFrom || dateTo ? `${dateFrom || '…'} → ${dateTo || '…'}` : null
          }
          active={dateFrom !== '' || dateTo !== ''}
        >
          {() => (
            <div className="space-y-3 p-1">
              <div className="flex items-center justify-between border-b px-1 pb-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Rango de fechas
                </span>
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('dateFrom', null);
                      setFilter('dateTo', null);
                      setFilter('page', null);
                    }}
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 px-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setFilter('dateFrom', e.target.value || null);
                      setFilter('page', null);
                    }}
                    className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setFilter('dateTo', e.target.value || null);
                      setFilter('page', null);
                    }}
                    className="h-8 w-full rounded-md border bg-card px-2 text-xs outline-none focus:border-foreground"
                  />
                </div>
              </div>
            </div>
          )}
        </ChipPopover>

        <span className="flex-1" />

        {/* Status toggle (Ronda 13) — preservado */}
        <StatusToggle
          value={status}
          onChange={(next) => {
            setFilters({ status: next === '' ? null : next, page: null });
          }}
        />
      </div>

      {/* ============================================================
          APPLIED FILTERS BAR — tags removibles individualmente
          ============================================================ */}
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros activos
          </span>
          {qLocal.trim() !== '' && (
            <FilterTag k="Texto" v={`"${qLocal.trim()}"`} onRemove={() => setQ('')} />
          )}
          {type !== ALL && selectedType && (
            <FilterTag
              k="Tipo"
              v={selectedType.label}
              onRemove={() => setFilter('type', null)}
            />
          )}
          {warehouseId !== ALL && selectedWarehouse && (
            <FilterTag
              k="Bodega"
              v={selectedWarehouse.name}
              onRemove={() => setFilter('warehouseId', null)}
            />
          )}
          {contactValue && (
            <FilterTag
              k={contactValue.kind === 'customer' ? 'Cliente' : 'Proveedor'}
              v={contactValue.name}
              onRemove={() =>
                setFilters({ customerId: null, supplierId: null, page: null })
              }
            />
          )}
          {productValue && (
            <FilterTag
              k="Producto"
              v={productValue.sku ?? ''}
              onRemove={() => setFilter('productId', null)}
            />
          )}
          {(dateFrom || dateTo) && (
            <FilterTag
              k="Fechas"
              v={`${dateFrom || '…'} → ${dateTo || '…'}`}
              onRemove={() => {
                setFilter('dateFrom', null);
                setFilter('dateTo', null);
              }}
            />
          )}
          {status !== '' && (
            <FilterTag
              k="Estado"
              v={status === 'active' ? 'Activos' : 'Cancelados'}
              onRemove={() => setFilter('status', null)}
            />
          )}
          <button
            type="button"
            onClick={clear}
            className="ml-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* ============================================================
          CARDS LIST
          ============================================================ */}
      <div className="flex flex-col gap-2.5">
        {cards.isLoading && (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </>
        )}
        {cards.data && cards.data.items.length === 0 && (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">
            <p className="text-sm font-medium">Sin movimientos en el período</p>
            <p className="mt-1 text-xs">
              Probá ajustar los filtros o ampliar el rango de fechas.
            </p>
            {filtersActive && (
              <button
                type="button"
                onClick={clear}
                className="mt-3 text-xs underline-offset-2 hover:text-foreground hover:underline"
              >
                Limpiar todos los filtros
              </button>
            )}
          </div>
        )}
        {cards.data &&
          cards.data.items.map((card) => (
            <MovementCard key={card.groupKey} card={card} />
          ))}
      </div>

      {/* ============================================================
          PAGER
          ============================================================ */}
      {cards.data && cards.data.total > 0 && (
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground shadow-sm">
          <span>
            Mostrando{' '}
            <strong className="font-semibold tabular-nums text-foreground">
              {cards.data.items.length}
            </strong>{' '}
            de{' '}
            <strong className="font-semibold tabular-nums text-foreground">
              {cards.data.total}
            </strong>{' '}
            · página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CHIP POPOVER — pill style trigger + popover content
   ============================================================ */
function ChipPopover({
  icon,
  label,
  value,
  active,
  disabled,
  children,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
  active?: boolean;
  disabled?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex h-9 max-w-[260px] items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium shadow-sm transition-colors',
            'hover:bg-accent hover:text-foreground',
            active &&
            'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background',
            disabled && 'cursor-not-allowed opacity-50 hover:bg-card',
          )}
        >
          <span className="opacity-75">{icon}</span>
          <span>{label}</span>
          {value && (
            <span
              className={cn(
                'ml-0.5 max-w-[140px] truncate border-l pl-2 font-medium',
                active ? 'border-white/20' : 'border-border',
              )}
            >
              {value}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-2">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   SIMPLE LIST — list of options with checkmark
   ============================================================ */
function SimpleList({
  title,
  options,
  current,
  onPick,
  onClear,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  current: string;
  onPick: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 flex items-center justify-between border-b px-1 pb-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {current !== ALL && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>
      <div className="max-h-[280px] overflow-auto">
        {options.map((o) => {
          const isOn = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onPick(o.value)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent',
                isOn && 'bg-accent text-foreground',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                  isOn
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card',
                )}
              >
                {isOn && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l5 5 11-12" />
                  </svg>
                )}
              </span>
              <span className="flex-1 truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   STATUS TOGGLE (Ronda 13) — preservado de la versión original
   ============================================================ */
function StatusToggle({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
}) {
  const options: Array<{ value: StatusFilter; label: string }> = [
    { value: '', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'cancelled', label: 'Cancelados' },
  ];
  return (
    <div className="inline-flex h-9 items-stretch rounded-lg border bg-card p-0.5 shadow-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-md px-3 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   FILTER TAG — pill removible en la barra de filtros activos
   ============================================================ */
function FilterTag({
  k,
  v,
  onRemove,
}: {
  k: string;
  v: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 pl-2.5 pr-1 text-[11px] text-muted-foreground">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {k}
      </span>
      <span className="max-w-[140px] truncate font-medium text-foreground">{v}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Quitar filtro ${k}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function buildMovementsExportQuery(
  params: Record<string, string | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
