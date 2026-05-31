'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Package as PackageIcon,
  Search,
  SlidersHorizontal,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ContactFilter, type ContactValue } from '@/components/movement-cards/contact-filter';
import { ProductFilter, type ProductValue } from '@/components/movement-cards/product-filter';
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
import type { MovementCardDto, MovementDto, WarehouseDto } from '@inventory/shared';
import Link from 'next/link';

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
 * Movimientos de inventario — Rediseño N3 ("Soft Cards").
 *
 * SOLO UI/UX. La lógica de datos es idéntica a la versión previa:
 *  · useUrlFilters con los mismos 10 keys (type, warehouseId, dateFrom, dateTo,
 *    q, customerId, supplierId, productId, status, page).
 *  · useDebouncedUrlFilter para el search.
 *  · Hidratación de contacto/producto desde URL con useQuery + enabled.
 *  · Limpieza automática de IDs fantasma si el GET devuelve 404.
 *  · listMovementCards con todos los filtros.
 *  · Reglas customerId/supplierId mutuamente excluyentes.
 *
 * Cambios visuales:
 *  · Cards rounded-3xl con sombra suave, badge de color por tipo, acordeón.
 *  · Search grande + selectores Cliente/Producto en grid + pills "Tipo: valor".
 *  · Acento azul #2F6BFF + colores por tipo de movimiento.
 *  · <MovementCard> reemplazada por <MovementTransactionCard> en línea.
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
    <div className="flex flex-col gap-6">
      {/* ============================================================
          PAGE HEAD
          ============================================================ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Movimientos de inventario
          </h1>
          <p className="mt-1 max-w-2xl text-xs font-medium text-slate-500 dark:text-slate-400">
            Cada card muestra una transacción completa (venta, compra, devolución,
            transferencia, ajuste o evento de auditoría).
            {cards.data && (
              <>
                {' · '}
                <strong className="font-extrabold tabular-nums text-[#2F6BFF] dark:text-blue-400">
                  {cards.data.total}
                </strong>{' '}
                transacciones
              </>
            )}
          </p>
        </div>
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
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 sm:self-auto"
        >
          <FileSpreadsheet className="h-[18px] w-[18px] text-emerald-500" />
          <span>Exportar Excel</span>
        </a>
      </div>

      {/* ============================================================
          FILTERS — search + selectores + pills + status toggle
          ============================================================ */}
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={qLocal}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nro, cliente, proveedor o producto…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-xs text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/10 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-200"
          />
          {qLocal && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              aria-label="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Cliente o proveedor + Producto
            NOTE: ContactFilter/ProductFilter conservan TODA su lógica.
            Para que su caja externa calce 100% con este rediseño (borde
            rounded-2xl, ícono + chevron como en la captura), aplicá las
            mismas clases dentro de esos componentes, o pasámelos y los
            reestilizo. Acá quedan envueltos en el grid del layout objetivo. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <ProductFilter
            value={productValue}
            onChange={(next) =>
              setFilters({ productId: next?.id ?? null, page: null })
            }
          />
        </div>

        {/* Pills + Status toggle */}
        <div className="flex flex-col justify-between gap-4 pt-1 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {/* Tipo */}
            <PillPopover
              icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
              label="Tipo"
              value={type !== ALL ? selectedType?.label ?? 'Todos' : 'Todos'}
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
                  options={[{ value: ALL, label: 'Todos los tipos' }, ...MOVEMENT_TYPES]}
                  onPick={(v) => {
                    setFilter('type', v === ALL ? null : v);
                    setFilter('page', null);
                    close();
                  }}
                />
              )}
            </PillPopover>

            {/* Bodega */}
            <PillPopover
              icon={<Building2 className="h-3.5 w-3.5" />}
              label="Bodega"
              value={
                warehouseId !== ALL ? selectedWarehouse?.name ?? 'Todos' : 'Todos'
              }
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
            </PillPopover>

            {/* Fechas */}
            <PillPopover
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Fechas"
              value={dateFrom || dateTo ? `${dateFrom || '…'} → ${dateTo || '…'}` : 'Todos'}
            >
              {() => (
                <div className="space-y-3 p-1">
                  <div className="flex items-center justify-between border-b px-1 pb-2 dark:border-slate-800">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
                        className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline dark:hover:text-slate-200"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Desde
                      </label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          setFilter('dateFrom', e.target.value || null);
                          setFilter('page', null);
                        }}
                        className="h-8 w-full rounded-lg border bg-white px-2 text-xs outline-none focus:border-[#2F6BFF] dark:border-slate-800 dark:bg-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Hasta
                      </label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          setFilter('dateTo', e.target.value || null);
                          setFilter('page', null);
                        }}
                        className="h-8 w-full rounded-lg border bg-white px-2 text-xs outline-none focus:border-[#2F6BFF] dark:border-slate-800 dark:bg-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}
            </PillPopover>
          </div>

          {/* Status toggle (Ronda 13) — preservado */}
          <StatusToggle
            value={status}
            onChange={(next) => {
              setFilters({ status: next === '' ? null : next, page: null });
            }}
          />
        </div>
      </div>

      {/* ============================================================
          APPLIED FILTERS BAR — tags removibles individualmente
          ============================================================ */}
      {filtersActive && (
        <div className="-mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Filtros activos
          </span>
          {qLocal.trim() !== '' && (
            <FilterTag k="Texto" v={`"${qLocal.trim()}"`} onRemove={() => setQ('')} />
          )}
          {type !== ALL && selectedType && (
            <FilterTag k="Tipo" v={selectedType.label} onRemove={() => setFilter('type', null)} />
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
            className="ml-1 text-[11px] text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* ============================================================
          CARDS LIST
          ============================================================ */}
      <div className="flex flex-col gap-4">
        {cards.isLoading && (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-3xl" />
            ))}
          </>
        )}
        {cards.data && cards.data.items.length === 0 && (
          <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center dark:border-slate-850 dark:bg-[#11151C]">
            <PackageIcon className="mx-auto mb-3 h-9 w-9 text-slate-300" />
            <p className="text-xs font-bold text-slate-500">Sin movimientos en el período</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Probá ajustar los filtros o ampliar el rango de fechas.
            </p>
            {filtersActive && (
              <button
                type="button"
                onClick={clear}
                className="mt-3 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline dark:hover:text-slate-200"
              >
                Limpiar todos los filtros
              </button>
            )}
          </div>
        )}
        {cards.data &&
          cards.data.items.map((card) => (
            <MovementTransactionCard key={card.groupKey} card={card} />
          ))}
      </div>

      {/* ============================================================
          PAGER
          ============================================================ */}
      {cards.data && cards.data.total > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-[11.5px] font-semibold text-slate-500 shadow-sm dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-400">
          <span>
            Mostrando{' '}
            <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
              {cards.data.items.length}
            </strong>{' '}
            de{' '}
            <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
              {cards.data.total}
            </strong>{' '}
            · página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
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

/* ============================================================
   MOVEMENT TRANSACTION CARD  (reemplaza <MovementCard>)
   ------------------------------------------------------------
   Toda la presentación de la tarjeta vive acá. La data entra por
   `card` (el item que devuelve listMovementCards). Como no tengo el
   type exacto del DTO, normalizo con `normalizeCard` y dejo marcados
   con TODO los nombres de campo que debés confirmar/ajustar.
   ============================================================ */

/** Categoría visual derivada del `kind` discriminador del MovementCardDto. */
type CardKind =
  | 'Compra'
  | 'Venta'
  | 'Devolución'
  | 'Transferencia'
  | 'Ajuste'
  | 'Despacho'
  | 'Otro';

const KIND_THEME: Record<
  CardKind,
  { badge: string; icon: string; iconBg: string }
> = {
  Compra: {
    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
    icon: 'text-emerald-500',
    iconBg: 'bg-emerald-50/60 border border-emerald-100 dark:bg-emerald-950/20 dark:border-transparent',
  },
  Venta: {
    badge: 'bg-blue-50 text-[#2F6BFF] dark:bg-blue-950/30 dark:text-blue-400',
    icon: 'text-blue-500',
    iconBg: 'bg-blue-50/60 border border-blue-100 dark:bg-blue-950/20 dark:border-transparent',
  },
  Devolución: {
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
    icon: 'text-amber-500',
    iconBg: 'bg-amber-50/60 border border-amber-100 dark:bg-amber-950/20 dark:border-transparent',
  },
  Transferencia: {
    badge: 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400',
    icon: 'text-purple-500',
    iconBg: 'bg-purple-50/60 border border-purple-100 dark:bg-purple-950/20 dark:border-transparent',
  },
  Ajuste: {
    badge: 'bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400',
    icon: 'text-orange-500',
    iconBg: 'bg-orange-50/60 border border-orange-100 dark:bg-orange-950/20 dark:border-transparent',
  },
  Despacho: {
    badge: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400',
    icon: 'text-indigo-500',
    iconBg: 'bg-indigo-50/60 border border-indigo-100 dark:bg-indigo-950/20 dark:border-transparent',
  },
  Otro: {
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300',
    icon: 'text-slate-500',
    iconBg: 'bg-slate-100/70 border border-slate-200 dark:bg-slate-800/30 dark:border-transparent',
  },
};

function formatMoney(val: number): string {
  return (
    '$ ' +
    Number(val || 0).toLocaleString('es-CL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatCardDate(value: string | number | Date): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const day = dt
    .toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
    .replace(/\//g, '-');
  const time = dt
    .toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace('am', 'a. m.')
    .replace('pm', 'p. m.');
  return `${day}, ${time}`;
}

type NormalizedLine = {
  productName: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
};

type NormalizedCard = {
  kind: CardKind;
  label: string;
  folio: string;
  contact: string;
  warehouse: string;
  date: string;
  user: string;
  lines: NormalizedLine[];
  totalUnits: number;
  itemCount: number;
  subtotal: number;
  tax: number;
  total: number;
  isCancelled: boolean;
  viewHref: string | null;
  viewLabel: string | null;
};

/** Los montos llegan como `string` (precisión decimal); los pasamos a número. */
function moneyNum(value: string | number | null | undefined): number {
  return Number(value ?? 0) || 0;
}

function sumUnits(lines: NormalizedLine[]): number {
  return lines.reduce((acc, l) => acc + Math.abs(l.quantity), 0);
}

/**
 * Normaliza un `MovementCardDto` (unión discriminada por `kind`) a la forma
 * plana que pinta la tarjeta. La data real vive anidada bajo la entidad padre
 * (`card.sale`, `card.purchase`, …), por eso se hace `switch` por `kind` — el
 * `default: never` garantiza que un nuevo kind rompa la compilación.
 */
function normalizeCard(card: MovementCardDto): NormalizedCard {
  const user = card.user?.email ?? '';

  switch (card.kind) {
    case 'SALE': {
      const s = card.sale;
      const lines: NormalizedLine[] = s.items.map((it) => ({
        productName: it.product.name,
        productId: it.product.sku ?? '',
        quantity: it.qty,
        price: moneyNum(it.unitPrice),
        total: moneyNum(it.subtotal),
      }));
      return {
        kind: 'Venta',
        label: 'Venta',
        folio: s.number,
        contact: s.customer?.name ?? 'Sin cliente',
        warehouse: s.warehouse.name,
        date: s.date,
        user,
        lines,
        totalUnits: sumUnits(lines),
        itemCount: lines.length,
        subtotal: moneyNum(s.subtotal),
        tax: moneyNum(s.taxAmount),
        total: moneyNum(s.total),
        isCancelled: s.status === 'CANCELLED',
        viewHref: `/ventas/${s.id}`,
        viewLabel: 'Ver venta',
      };
    }
    case 'PURCHASE': {
      const p = card.purchase;
      const lines: NormalizedLine[] = p.items.map((it) => ({
        productName: it.product.name,
        productId: it.product.sku ?? '',
        quantity: it.qty,
        price: moneyNum(it.unitCost),
        total: moneyNum(it.subtotal),
      }));
      return {
        kind: 'Compra',
        label: 'Compra',
        folio: p.id.slice(0, 8),
        contact: p.supplier?.name ?? 'Sin proveedor',
        warehouse: p.warehouse?.name ?? '—',
        date: p.date,
        user,
        lines,
        totalUnits: sumUnits(lines),
        itemCount: lines.length,
        subtotal: moneyNum(p.subtotal),
        tax: moneyNum(p.taxAmount),
        total: moneyNum(p.total),
        isCancelled: false,
        viewHref: `/compras/${p.id}`,
        viewLabel: 'Ver compra',
      };
    }
    case 'RETURN': {
      const r = card.return;
      const contact = r.type === 'CUSTOMER' ? r.customer : r.supplier;
      const lines: NormalizedLine[] = r.items.map((it) => ({
        productName: it.product.name,
        productId: it.product.sku ?? '',
        quantity: it.qty,
        price: moneyNum(it.unitPrice),
        total: moneyNum(it.subtotal),
      }));
      const refund = moneyNum(r.refundAmount);
      return {
        kind: 'Devolución',
        label: r.type === 'CUSTOMER' ? 'Devolución cliente' : 'Devolución proveedor',
        folio: r.number,
        contact: contact?.name ?? 'Sin contacto',
        warehouse: r.warehouse.name,
        date: r.date,
        user,
        lines,
        totalUnits: sumUnits(lines),
        itemCount: lines.length,
        subtotal: refund,
        tax: 0,
        total: refund,
        isCancelled: r.status === 'CANCELLED',
        viewHref: `/devoluciones/${r.id}`,
        viewLabel: 'Ver devolución',
      };
    }
    case 'TRANSFER': {
      const t = card.transfer;
      const lines: NormalizedLine[] = t.items.map((it) => {
        const price = moneyNum(it.unitCost);
        return {
          productName: it.product.name,
          productId: it.product.sku ?? '',
          quantity: it.qty,
          price,
          total: price * it.qty,
        };
      });
      return {
        kind: 'Transferencia',
        label: 'Transferencia',
        folio: t.number,
        contact: `${t.fromWarehouse.name} → ${t.toWarehouse.name}`,
        warehouse: t.toWarehouse.name,
        date: t.date,
        user,
        lines,
        totalUnits: sumUnits(lines),
        itemCount: lines.length,
        subtotal: 0,
        tax: 0,
        total: lines.reduce((acc, l) => acc + l.total, 0),
        isCancelled: t.status === 'CANCELLED',
        viewHref: `/transferencias/${t.id}`,
        viewLabel: 'Ver transferencia',
      };
    }
    case 'DISPATCH': {
      const d = card.dispatch;
      const lines: NormalizedLine[] = card.movements.map((m) => ({
        productName: m.product.name,
        productId: m.product.sku ?? '',
        quantity: m.qty,
        price: 0,
        total: 0,
      }));
      return {
        kind: 'Despacho',
        label: d.eventType === 'DISPATCH_VOIDED' ? 'Guía anulada' : 'Guía despacho',
        folio: d.number,
        contact: d.customer?.name ?? 'Sin cliente',
        warehouse: card.movements[0]?.warehouse.name ?? '—',
        date: d.dispatchedAt,
        user,
        lines,
        totalUnits: sumUnits(lines),
        itemCount: lines.length,
        subtotal: 0,
        tax: 0,
        total: 0,
        isCancelled: d.status === 'VOIDED',
        viewHref: `/guias/${d.id}`,
        viewLabel: 'Ver guía',
      };
    }
    case 'ADJUSTMENT': {
      const m = card.movements[0];
      const lines: NormalizedLine[] = m
        ? [
            {
              productName: m.product.name,
              productId: m.product.sku ?? '',
              quantity: m.qty,
              price: moneyNum(m.unitCost),
              total: moneyNum(m.unitCost) * Math.abs(m.qty),
            },
          ]
        : [];
      const qty = m?.qty ?? 0;
      return {
        kind: 'Ajuste',
        label: 'Ajuste manual',
        folio: m ? `${qty > 0 ? '+' : ''}${qty} u` : '',
        contact: m?.product.name ?? '—',
        warehouse: m?.warehouse.name ?? '—',
        date: m?.createdAt ?? card.latestAt,
        user,
        lines,
        totalUnits: sumUnits(lines),
        itemCount: lines.length,
        subtotal: 0,
        tax: 0,
        total: 0,
        isCancelled: false,
        viewHref: null,
        viewLabel: null,
      };
    }
    case 'ORPHAN': {
      const lines: NormalizedLine[] = card.movements.map((m) => ({
        productName: m.product.name,
        productId: m.product.sku ?? '',
        quantity: m.qty,
        price: 0,
        total: 0,
      }));
      return {
        kind: 'Otro',
        label: 'Movimiento',
        folio: card.reference ?? '',
        contact: card.rawType,
        warehouse: card.movements[0]?.warehouse.name ?? '—',
        date: card.movements[0]?.createdAt ?? card.latestAt,
        user,
        lines,
        totalUnits: sumUnits(lines),
        itemCount: lines.length,
        subtotal: 0,
        tax: 0,
        total: 0,
        isCancelled: false,
        viewHref: null,
        viewLabel: null,
      };
    }
    default: {
      // Exhaustividad: si TS marca acá, hay un nuevo kind sin normalizar.
      const _exhaustive: never = card;
      void _exhaustive;
      throw new Error('Unhandled movement card kind');
    }
  }
}

function MovementTransactionCard({ card }: { card: MovementCardDto }) {
  const [expanded, setExpanded] = useState(false);
  const c = useMemo(() => normalizeCard(card), [card]);
  const theme = KIND_THEME[c.kind];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border bg-white p-5 shadow-sm transition-all dark:bg-[#11151C]',
        c.isCancelled && 'opacity-55 dark:opacity-40',
        expanded
          ? 'border-[#2F6BFF]/25 ring-2 ring-[#2F6BFF]/5'
          : 'border-slate-100 hover:border-slate-200 dark:border-slate-850 dark:hover:border-slate-800',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-[44px] w-[44px] items-center justify-center rounded-2xl shadow-sm',
              theme.iconBg,
            )}
          >
            <PackageIcon className={cn('h-[22px] w-[22px]', theme.icon)} />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide',
                  theme.badge,
                )}
              >
                {c.label}
              </span>
              <h4 className="text-[13.5px] font-extrabold tracking-tight text-slate-800 dark:text-white">
                {c.label} {c.folio}
              </h4>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.contact}</p>
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] font-semibold leading-tight text-slate-400 dark:text-slate-500">
          <div>{formatCardDate(c.date)}</div>
          {c.user && <div className="mt-1 text-[10px] text-slate-400">por {c.user}</div>}
        </div>
      </div>

      {/* Summary line */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-50 pt-4 text-xs font-semibold text-slate-600 dark:border-slate-850/80 dark:text-slate-400">
        <span>
          {c.itemCount} {c.itemCount === 1 ? 'ítem' : 'ítems'}
        </span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span>{c.totalUnits} unidades</span>
        <span className="mx-1 text-slate-300 dark:text-slate-700">·</span>
        <span className="text-[13.5px] font-extrabold text-slate-900 dark:text-white">
          {formatMoney(c.total)}
        </span>
        <span className="mx-1 text-slate-300 dark:text-slate-700">•</span>
        <span className="font-bold text-slate-400 dark:text-slate-500">Bodega: {c.warehouse}</span>
      </div>

      {/* Collapsed toggle */}
      {!expanded && (
        <div className="mt-4 flex items-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1.5 text-[11.5px] font-black text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-300"
          >
            <ChevronDown className="h-4 w-4 text-slate-400" />
            <span>Ver detalle</span>
          </button>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-[18px] dark:border-slate-850 dark:bg-slate-900/10">
            <div>
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Bodega destino
              </p>
              <p className="mt-1 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                {c.warehouse}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <p className="mb-2.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Ítems
              </p>
              <div className="space-y-2">
                {c.lines.map((it, idx) => {
                  const isPositive =
                    c.kind === 'Compra' ||
                    c.kind === 'Devolución' ||
                    (c.kind === 'Ajuste' && it.quantity > 0);
                  return (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'font-mono font-black',
                            isPositive ? 'text-emerald-500' : 'text-rose-500',
                          )}
                        >
                          {isPositive ? '+' : ''}
                          {it.quantity} u
                        </span>
                        <span className="truncate font-extrabold text-slate-800 dark:text-slate-200">
                          {it.productName}
                        </span>
                        {it.productId && (
                          <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:border-transparent dark:bg-slate-800 dark:text-slate-400">
                            {it.productId}
                          </span>
                        )}
                      </div>
                      <div className="whitespace-nowrap font-mono font-semibold text-slate-500 dark:text-slate-400">
                        {formatMoney(it.price)}{' '}
                        <span className="mx-1 text-slate-300 dark:text-slate-800">·</span>{' '}
                        <span className="font-black text-slate-800 dark:text-white">
                          {formatMoney(it.total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col items-end space-y-1 border-t border-slate-100 pt-3.5 text-xs dark:border-slate-800/60">
              <div className="flex w-64 justify-between font-bold text-slate-500 dark:text-slate-400">
                <span>Subtotal (neto)</span>
                <span className="font-mono font-semibold">{formatMoney(c.subtotal)}</span>
              </div>
              <div className="flex w-64 justify-between font-bold text-slate-500 dark:text-slate-400">
                <span>IVA</span>
                <span className="font-mono font-semibold">{formatMoney(c.tax)}</span>
              </div>
              <div className="flex w-64 justify-between border-t border-slate-100 pt-1.5 text-[13px] font-black text-slate-900 dark:border-slate-800/80 dark:text-white">
                <span>Total bruto</span>
                <span className="font-mono">{formatMoney(c.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1.5 text-[11.5px] font-black text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-300"
            >
              <ChevronUp className="h-4 w-4 text-slate-400" />
              <span>Ocultar detalle</span>
            </button>
            {c.viewHref && (
              <Link
                href={c.viewHref}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              >
                <Eye className="h-4 w-4 text-slate-400" />
                <span>{c.viewLabel}</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PILL POPOVER — trigger estilo "Tipo: valor" + popover
   ============================================================ */
function PillPopover({
  icon,
  label,
  value,
  disabled,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
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
            'inline-flex max-w-[280px] items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-[11.5px] font-bold shadow-sm transition-colors',
            'hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-900/60',
            disabled && 'cursor-not-allowed opacity-50 hover:bg-white',
          )}
        >
          <span className="text-slate-400">{icon}</span>
          <span className="truncate text-slate-600 dark:text-slate-350">
            {label}: <span className="text-[#2F6BFF] dark:text-blue-400">{value}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] rounded-2xl p-2">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
   SIMPLE LIST — lista de opciones con check
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
      <div className="mb-1 flex items-center justify-between border-b px-1 pb-2 dark:border-slate-800">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        {current !== ALL && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline dark:hover:text-slate-200"
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
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800',
                isOn && 'bg-slate-100 dark:bg-slate-800',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                  isOn
                    ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                    : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
                )}
              >
                {isOn && (
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
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
   STATUS TOGGLE (Ronda 13) — preservado, restyleado
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
    <div className="flex shrink-0 self-end rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 lg:self-auto">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-xl px-4 py-1.5 text-[11.5px] font-bold transition-all',
            value === opt.value
              ? 'bg-[#2F6BFF] font-black text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
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
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-slate-200/70 bg-slate-100/70 pl-2.5 pr-1 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/60">
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{k}</span>
      <span className="max-w-[140px] truncate font-bold text-slate-700 dark:text-slate-200">{v}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800"
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
