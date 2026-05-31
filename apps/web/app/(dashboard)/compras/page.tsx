'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Eye, Paperclip, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiAbsoluteUrl } from '@/lib/api';
import { publicDocumentUrl } from '@/lib/cashbox-api';
import { formatCurrency } from '@/lib/format';
import { getPurchasesKpis, listPurchases, listSuppliers } from '@/lib/inventory-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { listWarehouses } from '@/lib/warehouses-api';
import type { WarehouseDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

/**
 * /compras — Rediseño UI (look de PurchasesList).
 *
 * SOLO UI/UX. La lógica es idéntica a la versión previa:
 *  · useUrlFilters (q, supplier, warehouse, dateFrom, dateTo, totalMin, totalMax, page).
 *  · useDebouncedUrlFilter para q (búsqueda libre) + totalMin/totalMax.
 *  · getPurchasesKpis() (KPIs del mes, server-side, independientes de filtros).
 *  · listPurchases con todos los filtros + paginación server-side.
 *  · Export Excel respetando filtros (apiAbsoluteUrl + buildPurchasesExportQuery).
 *
 * Cambios visuales: header font-black, KPIs en cards rounded-2xl, search libre
 * + grid de filtros redondeados (selects nativos + inputs), tabla en sheet
 * rounded-3xl con filas clickeables, chip de facturas (×N) y footer de paginación.
 *
 * Búsqueda libre: `q` matchea proveedor (nombre/RUT) o notas de la compra
 * (ListPurchasesQueryDto.q). El mismo `q` se aplica al export Excel, que usa
 * el mismo DTO que el listado.
 */
export default function ComprasPage() {
  const router = useRouter();
  const filters = useUrlFilters({
    q: '',
    supplier: '',
    warehouse: '',
    dateFrom: '',
    dateTo: '',
    totalMin: '',
    totalMax: '',
    page: '',
  });
  const { values, setFilter, clear } = filters;
  const qFilter = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const supplierId = values.supplier || ALL;
  const warehouseId = values.warehouse || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const totalMinFilter = useDebouncedUrlFilter(filters, 'totalMin', { resetKeys: ['page'] });
  const totalMaxFilter = useDebouncedUrlFilter(filters, 'totalMax', { resetKeys: ['page'] });
  const totalMin = values.totalMin ?? '';
  const totalMax = values.totalMax ?? '';
  const page = Number(values.page || '1');

  const filtersActive =
    qFilter.value.trim() !== '' ||
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
  const warehouseList = (Array.isArray(warehouses.data)
    ? warehouses.data
    : warehouses.data?.items ?? []) as WarehouseDto[];

  const kpis = useQuery({
    queryKey: ['purchases', 'kpis'],
    queryFn: () => getPurchasesKpis(),
  });

  const list = useQuery({
    queryKey: [
      'purchases',
      { q: values.q, supplierId, warehouseId, dateFrom, dateTo, totalMin, totalMax, page },
    ],
    queryFn: () =>
      listPurchases({
        q: values.q || undefined,
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

  const exportHref = apiAbsoluteUrl(
    `purchases/export.xlsx${buildPurchasesExportQuery({
      q: values.q || undefined,
      supplierId: supplierId === ALL ? undefined : supplierId,
      warehouseId: warehouseId === ALL ? undefined : warehouseId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      totalMin: totalMin || undefined,
      totalMax: totalMax || undefined,
    })}`,
  );

  const fieldCls =
    'w-full text-xs font-semibold px-3 py-3 bg-white dark:bg-[#11151C] text-slate-700 dark:text-white border border-slate-200 dark:border-slate-850 rounded-2xl focus:outline-none focus:border-[#2F6BFF] transition-all';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Compras
        </h1>
        <div className="flex w-full gap-2.5 self-start sm:w-auto sm:self-auto">
          <a
            href={exportHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-900 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-white dark:hover:bg-slate-900 sm:flex-initial"
          >
            <Download className="h-4 w-4 text-slate-400" />
            <span>Exportar Excel</span>
          </a>
          <Link
            href="/compras/nuevo"
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs font-bold text-white shadow-md transition-all hover:opacity-95 dark:bg-white dark:text-slate-950 sm:flex-initial"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva entrada</span>
          </Link>
        </div>
      </div>

      {/* ============================================================
          KPIs
          ============================================================ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total comprado (mes)"
          value={kpis.data ? formatCurrency(kpis.data.totalAmount) : '—'}
          hint={kpis.data ? `${kpis.data.count} ${kpis.data.count === 1 ? 'compra' : 'compras'}` : 'Cargando…'}
        />
        <KpiCard
          label="Promedio por compra"
          value={kpis.data ? formatCurrency(kpis.data.averageAmount) : '—'}
          hint="Mes actual"
        />
        <KpiCard
          label="Devoluciones a proveedor"
          value={kpis.data ? formatCurrency(kpis.data.returnsAmount) : '—'}
          hint={kpis.data ? `${kpis.data.returnsCount} ${kpis.data.returnsCount === 1 ? 'devolución' : 'devoluciones'}` : 'Cargando…'}
          accent="danger"
        />
        <KpiCard
          label="Última compra"
          value={kpis.data?.lastPurchase ? formatCurrency(kpis.data.lastPurchase.total) : '—'}
          hint={
            kpis.data?.lastPurchase
              ? `${kpis.data.lastPurchase.supplierName} · ${new Date(
                  kpis.data.lastPurchase.date,
                ).toLocaleDateString('es-CL')}`
              : 'Sin compras'
          }
          truncateValue
        />
      </div>

      {/* ============================================================
          FILTROS
          ============================================================ */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={qFilter.value}
            onChange={(e) => qFilter.setValue(e.target.value)}
            placeholder="Buscar por proveedor, RUT o notas…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-semibold text-slate-700 transition-all placeholder:text-slate-400 placeholder:font-medium focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <select
            value={supplierId}
            onChange={(e) => {
              setFilter('supplier', e.target.value === ALL ? null : e.target.value);
              setFilter('page', null);
            }}
            className={fieldCls}
          >
            <option value={ALL}>Todos los proveedores</option>
            {suppliers.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={warehouseId}
            onChange={(e) => {
              setFilter('warehouse', e.target.value === ALL ? null : e.target.value);
              setFilter('page', null);
            }}
            className={fieldCls}
          >
            <option value={ALL}>Todas las bodegas</option>
            {warehouseList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {!w.isActive ? ' (inactiva)' : ''}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setFilter('dateFrom', e.target.value || null);
              setFilter('page', null);
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setFilter('dateTo', e.target.value || null);
              setFilter('page', null);
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-medium text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Total mínimo (CLP)"
            value={totalMinFilter.value}
            onChange={(e) => totalMinFilter.setValue(e.target.value)}
            className={fieldCls}
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Total máximo (CLP)"
            value={totalMaxFilter.value}
            onChange={(e) => totalMaxFilter.setValue(e.target.value)}
            className={fieldCls}
          />
          {filtersActive ? (
            <button
              onClick={clear}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-900 dark:hover:text-slate-200"
            >
              Limpiar filtros
            </button>
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
      </div>

      {/* ============================================================
          TABLA
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="w-[12%] py-4 pl-6">Fecha</th>
                <th className="py-4">Proveedor</th>
                <th className="py-4">Bodega</th>
                <th className="py-4">Notas</th>
                <th className="py-4 text-right">Subtotal</th>
                <th className="py-4 text-right">IVA</th>
                <th className="py-4 text-right">Total</th>
                <th className="py-4 text-center">Facturas</th>
                <th className="w-[60px] py-4 pr-6 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center font-bold text-slate-400">
                    Ninguna compra coincide con los criterios de búsqueda o filtros.
                  </td>
                </tr>
              )}

              {items.map((p) => {
                const invoiceCount = p.invoices?.length ?? 0;
                const firstInvoice = invoiceCount > 0 ? p.invoices![0] : null;
                const firstUrl = firstInvoice ? publicDocumentUrl(firstInvoice.url) : null;
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/compras/${p.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                  >
                    <td className="py-5 pl-6 font-medium text-slate-500 dark:text-slate-400">
                      <Link
                        href={`/compras/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {new Date(p.date).toLocaleDateString('es-CL', { dateStyle: 'medium' })}
                      </Link>
                    </td>
                    <td className="py-5 font-bold text-slate-950 transition-colors group-hover:text-[#2F6BFF] dark:text-white">
                      {p.supplier?.name ?? '—'}
                    </td>
                    <td className="py-5 font-medium text-slate-600 dark:text-slate-400">
                      {p.warehouse?.name ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="max-w-[150px] truncate py-5 italic text-slate-500">
                      {p.notes ?? '—'}
                    </td>
                    <td className="py-5 text-right font-mono font-medium text-slate-500">
                      {formatCurrency(p.subtotal)}
                    </td>
                    <td className="py-5 text-right font-mono font-medium text-slate-500">
                      {formatCurrency(p.taxAmount)}
                    </td>
                    <td className="py-5 text-right font-mono text-[13px] font-black text-slate-950 dark:text-white">
                      {formatCurrency(p.total)}
                    </td>
                    <td className="py-5 text-center">
                      {invoiceCount > 0 && firstUrl ? (
                        <a
                          href={firstUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={invoiceCount === 1 ? 'Ver factura' : `${invoiceCount} archivos — abrir primero`}
                          className="inline-flex items-center gap-1 rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-slate-500 hover:text-[#2F6BFF] dark:border-slate-800 dark:bg-[#1C202B] dark:text-slate-400"
                        >
                          <Paperclip className="h-3 w-3 text-slate-400" />
                          <span>×{invoiceCount}</span>
                        </a>
                      ) : (
                        <span className="font-mono text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-5 pr-6 text-right">
                      <Link
                        href={`/compras/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Ver detalle"
                        className="inline-flex items-center justify-center p-2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-white"
                      >
                        <Eye className="h-[18px] w-[18px]" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          PAGINACIÓN
          ============================================================ */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-400 dark:text-slate-500">
          <span>
            {total} compra{total === 1 ? '' : 's'} · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Anterior
            </button>
            <button
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
              disabled={page >= totalPages}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Siguiente
            </button>
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
  accent,
  truncateValue,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'danger';
  truncateValue?: boolean;
}) {
  return (
    <div className="select-none space-y-1 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span
        className={`block text-[18px] font-black tracking-tight md:text-[20px] ${
          truncateValue ? 'truncate ' : ''
        }${accent === 'danger' ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}
      >
        {value}
      </span>
      {hint && (
        <span className="block truncate text-[10.5px] font-bold text-slate-400 dark:text-slate-500">
          {hint}
        </span>
      )}
    </div>
  );
}

function buildPurchasesExportQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v != null && v !== '',
  ) as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
