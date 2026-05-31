'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Building,
  Search,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Permission, useCan } from '@/lib/current-user-context';
import { formatCurrency } from '@/lib/format';
import { listMovements, listStock } from '@/lib/inventory-api';
import { listTransfers } from '@/lib/transfers-api';
import { getWarehouse } from '@/lib/warehouses-api';

type TabKey = 'datos' | 'stock' | 'movimientos' | 'transferencias';

/**
 * /almacenes/[id] — Rediseño UI (look de WarehouseDetail).
 *
 * SOLO UI/UX. Toda la lógica de datos es idéntica a la versión previa:
 *  · warehouseQ / stockQ / movementsQ + merge de transfersFrom/To.
 *  · KPIs derivados del stock (productCount, outOfStock, lowStock, valueCost/Price).
 *  · canSeeCost (Permission.PRODUCT_VIEW_COST) decide qué valor mostrar.
 *
 * Cambios visuales:
 *  · Tab bar custom (segmented) en vez de <Tabs> shadcn.
 *  · Card de datos con ícono + KPIs en bento de colores (rose/amber).
 *  · Buscadores locales en Stock y Movimientos (filtro 100% client-side,
 *    no toca las queries).
 *  · Tablas en "sheet" rounded-3xl y cards de transferencia.
 */
export default function AlmacenDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [activeTab, setActiveTab] = useState<TabKey>('datos');
  const [stockSearch, setStockSearch] = useState('');
  const [movSearch, setMovSearch] = useState('');

  const warehouseQ = useQuery({
    queryKey: ['warehouse', id],
    queryFn: () => getWarehouse(id),
    enabled: !!id,
  });
  const warehouse = warehouseQ.data;

  const stockQ = useQuery({
    queryKey: ['stock', { warehouseId: id }],
    queryFn: () => listStock({ warehouseId: id }),
    enabled: !!id,
  });
  const stock = useMemo(() => stockQ.data ?? [], [stockQ.data]);

  const canSeeCost = useCan(Permission.PRODUCT_VIEW_COST);

  const kpis = useMemo(() => {
    const withStock = stock.filter((s) => s.quantity > 0);
    const out = stock.filter((s) => s.status === 'out').length;
    const low = stock.filter((s) => s.status === 'low').length;
    const valueCost = withStock.reduce(
      (acc, s) => acc + s.quantity * parseFloat(s.product.cost ?? '0'),
      0,
    );
    const valuePrice = withStock.reduce(
      (acc, s) => acc + s.quantity * parseFloat(s.product.price ?? '0'),
      0,
    );
    return {
      productCount: withStock.length,
      outOfStock: out,
      lowStock: low,
      valueCost,
      valuePrice,
    };
  }, [stock]);

  const movementsQ = useQuery({
    queryKey: ['movements', { warehouseId: id, page: 1 }],
    queryFn: () => listMovements({ warehouseId: id, page: 1, pageSize: 20 }),
    enabled: !!id,
  });
  const movements = movementsQ.data?.items ?? [];

  const transfersFromQ = useQuery({
    queryKey: ['transfers', { fromWarehouseId: id }],
    queryFn: () => listTransfers({ fromWarehouseId: id, page: 1, pageSize: 20 }),
    enabled: !!id,
  });
  const transfersToQ = useQuery({
    queryKey: ['transfers', { toWarehouseId: id }],
    queryFn: () => listTransfers({ toWarehouseId: id, page: 1, pageSize: 20 }),
    enabled: !!id,
  });
  const transfers = useMemo(() => {
    const merged = [
      ...(transfersFromQ.data?.items ?? []),
      ...(transfersToQ.data?.items ?? []),
    ];
    const dedup = new Map(merged.map((t) => [t.id, t]));
    return Array.from(dedup.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [transfersFromQ.data, transfersToQ.data]);

  // ----- Filtros locales (solo UI, no tocan las queries) -----
  const filteredStock = useMemo(() => {
    const q = stockSearch.toLowerCase().trim();
    if (!q) return stock;
    return stock.filter(
      (s) =>
        (s.product.name ?? '').toLowerCase().includes(q) ||
        (s.product.sku ?? '').toLowerCase().includes(q) ||
        (s.locationCode ?? '').toLowerCase().includes(q),
    );
  }, [stock, stockSearch]);

  const filteredMovements = useMemo(() => {
    const q = movSearch.toLowerCase().trim();
    if (!q) return movements;
    return movements.filter(
      (m) =>
        (m.product?.name ?? '').toLowerCase().includes(q) ||
        (m.type ?? '').toLowerCase().includes(q) ||
        (m.reference ?? '').toLowerCase().includes(q) ||
        (m.id ?? '').toLowerCase().includes(q),
    );
  }, [movements, movSearch]);

  const transfersLoading = transfersFromQ.isLoading || transfersToQ.isLoading;

  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'datos', label: 'Datos' },
    { key: 'stock', label: `Stock (${stock.length})` },
    { key: 'movimientos', label: `Movimientos (${movements.length})` },
    { key: 'transferencias', label: `Transferencias (${transfers.length})` },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          TOP BAR
          ============================================================ */}
      <div className="flex items-center gap-3">
        <Link
          href="/almacenes"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        </Link>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {warehouseQ.isLoading
              ? 'Cargando…'
              : (warehouse?.name ?? 'Bodega no encontrada')}
          </h1>
          {warehouse && !warehouse.isActive && (
            <span className="rounded-full bg-slate-100/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Inactiva
            </span>
          )}
        </div>
      </div>

      {/* ============================================================
          TAB BAR
          ============================================================ */}
      <div className="flex max-w-sm select-none rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:max-w-2xl">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 cursor-pointer rounded-xl px-4 py-2.5 text-center text-[12px] font-bold transition-all ${
              activeTab === t.key
                ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============================================================
          TAB: DATOS
          ============================================================ */}
      {activeTab === 'datos' && (
        <div className="space-y-6">
          {warehouseQ.isLoading && (
            <div className="h-32 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
          )}

          {warehouse && (
            <>
              {/* Card datos generales */}
              <div className="flex items-start gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800/80 dark:bg-slate-900">
                  <Building className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <p className="flex items-center gap-2 text-slate-800 dark:text-white">
                    <span className="font-bold text-slate-400">Nombre:</span>
                    <span className="text-[13.5px] font-extrabold">{warehouse.name}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-slate-400">Dirección:</span>
                    <span className="font-black text-slate-800 dark:text-slate-300">
                      {warehouse.address ?? '—'}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-slate-400">Estado:</span>
                    {warehouse.isActive ? (
                      <span className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-wide text-emerald-500">
                        ● Activa
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                        ● Inactiva
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* KPIs bento */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Productos con stock */}
                <div className="flex h-[135px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
                  <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase leading-none tracking-widest text-slate-400 dark:text-slate-500">
                    <Boxes className="h-4 w-4 text-slate-400" />
                    <span>Productos con stock</span>
                  </div>
                  <div className="mt-auto space-y-0.5">
                    <h2 className="font-sans text-3xl font-black leading-none text-slate-900 dark:text-white">
                      {kpis.productCount}
                    </h2>
                    <p className="text-[11.5px] font-bold text-slate-400 dark:text-slate-500">
                      de {stock.length} listados
                    </p>
                  </div>
                </div>

                {/* Stock crítico */}
                <div
                  className={`flex h-[135px] flex-col justify-between rounded-3xl border p-6 shadow-sm ${
                    kpis.outOfStock > 0
                      ? 'border-rose-100/60 bg-rose-50/15 dark:border-rose-900/30 dark:bg-rose-950/5'
                      : 'border-slate-100 bg-white dark:border-slate-850 dark:bg-[#11151C]'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 text-[10px] font-extrabold uppercase leading-none tracking-widest ${
                      kpis.outOfStock > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <AlertTriangle className={`h-4 w-4 ${kpis.outOfStock > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
                    <span>Stock Crítico</span>
                  </div>
                  <div className="mt-auto space-y-0.5">
                    <h2
                      className={`font-sans text-3xl font-black leading-none ${
                        kpis.outOfStock > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {kpis.outOfStock}
                    </h2>
                    <p
                      className={`text-[11.5px] font-bold ${
                        kpis.outOfStock > 0 ? 'text-rose-500 dark:text-rose-400/80' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      En 0 unidades
                    </p>
                  </div>
                </div>

                {/* Bajo stock */}
                <div
                  className={`flex h-[135px] flex-col justify-between rounded-3xl border p-6 shadow-sm ${
                    kpis.lowStock > 0
                      ? 'border-amber-100/60 bg-amber-50/15 dark:border-amber-900/30 dark:bg-amber-950/5'
                      : 'border-slate-100 bg-white dark:border-slate-850 dark:bg-[#11151C]'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 text-[10px] font-extrabold uppercase leading-none tracking-widest ${
                      kpis.lowStock > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <AlertTriangle className={`h-4 w-4 ${kpis.lowStock > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                    <span>Bajo Stock</span>
                  </div>
                  <div className="mt-auto space-y-0.5">
                    <h2
                      className={`font-sans text-3xl font-black leading-none ${
                        kpis.lowStock > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {kpis.lowStock}
                    </h2>
                    <p
                      className={`text-[11.5px] font-bold ${
                        kpis.lowStock > 0 ? 'text-amber-500 dark:text-amber-400/80' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      Bajo el mínimo
                    </p>
                  </div>
                </div>

                {/* Valor inventario — depende de canSeeCost */}
                <div className="flex h-[135px] flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
                  <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase leading-none tracking-widest text-slate-400 dark:text-slate-500">
                    <Boxes className="h-4 w-4 text-slate-400" />
                    <span>{canSeeCost ? 'Valor inventario (costo)' : 'Valor inventario (precio)'}</span>
                  </div>
                  <div className="mt-auto space-y-0.5">
                    <h2 className="font-sans text-[20px] font-black leading-none tracking-tight text-slate-900 dark:text-white">
                      {canSeeCost
                        ? formatCurrency(kpis.valueCost.toFixed(2))
                        : formatCurrency(kpis.valuePrice.toFixed(2))}
                    </h2>
                    {canSeeCost && (
                      <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                        A precio: {formatCurrency(kpis.valuePrice.toFixed(2))}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================
          TAB: STOCK
          ============================================================ */}
      {activeTab === 'stock' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              placeholder="Buscar en el stock de esta bodega…"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-semibold shadow-sm focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/10 dark:border-slate-800 dark:bg-[#11151C]"
            />
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase text-slate-400 dark:border-slate-800 dark:bg-slate-900/10">
                    <th className="py-3 pl-6">SKU</th>
                    <th className="py-3">Producto</th>
                    <th className="py-3">Ubicación</th>
                    <th className="py-3">Estado</th>
                    <th className="py-3 pr-6 text-right">Stock Aquí</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {stockQ.isLoading && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                      </td>
                    </tr>
                  )}
                  {!stockQ.isLoading && filteredStock.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center font-bold text-slate-400">
                        Sin productos en esta bodega.
                      </td>
                    </tr>
                  )}
                  {filteredStock.map((s) => (
                    <tr key={s.product.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/10">
                      <td className="py-4 pl-6 font-mono font-bold text-slate-400">
                        <Link href={`/productos/${s.product.id}`} className="hover:underline">
                          {s.product.sku ?? '—'}
                        </Link>
                      </td>
                      <td className="py-4 font-extrabold text-slate-900 dark:text-white">
                        {s.product.name}
                      </td>
                      <td className="py-4 font-semibold text-slate-500">
                        {s.locationCode ?? '—'}
                      </td>
                      <td className="py-4">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="py-4 pr-6 text-right">
                        <span
                          className={`font-mono text-sm font-black ${
                            s.status === 'out'
                              ? 'text-rose-500'
                              : s.status === 'low'
                                ? 'text-amber-500'
                                : 'text-emerald-500'
                          }`}
                        >
                          {s.quantity} un.
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB: MOVIMIENTOS
          ============================================================ */}
      {activeTab === 'movimientos' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={movSearch}
              onChange={(e) => setMovSearch(e.target.value)}
              placeholder="Buscar movimientos en esta bodega por producto, tipo o referencia…"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-semibold shadow-sm focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/10 dark:border-slate-800 dark:bg-[#11151C]"
            />
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase text-slate-400 dark:border-slate-800 dark:bg-slate-900/10">
                    <th className="py-3 pl-6">Fecha</th>
                    <th className="py-3">Tipo</th>
                    <th className="py-3">Producto</th>
                    <th className="py-3 text-right">Cantidad</th>
                    <th className="py-3 pr-6">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {movementsQ.isLoading && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                      </td>
                    </tr>
                  )}
                  {!movementsQ.isLoading && filteredMovements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center font-bold text-slate-400">
                        Sin movimientos en esta bodega.
                      </td>
                    </tr>
                  )}
                  {filteredMovements.map((m) => {
                    const isPositive = (m.qty ?? 0) > 0;
                    return (
                      <tr key={m.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/10">
                        <td className="py-4 pl-6 font-mono text-slate-500">
                          {new Date(m.createdAt).toLocaleString('es-CL')}
                        </td>
                        <td className="py-4 font-bold">
                          {isPositive ? (
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
                              {m.type}
                            </span>
                          ) : (
                            <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
                              {m.type}
                            </span>
                          )}
                        </td>
                        <td className="py-4 font-extrabold text-slate-900 dark:text-white">
                          {m.product?.name ?? '—'}
                        </td>
                        <td
                          className={`py-4 text-right font-mono font-black ${
                            isPositive ? 'text-emerald-600' : 'text-rose-500'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {m.qty} un.
                        </td>
                        <td className="max-w-xs truncate py-4 pr-6 font-semibold text-slate-600 dark:text-slate-400">
                          {m.reference ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {movements.length > 0 && (
              <div className="border-t border-slate-100 p-3 text-right text-xs font-bold text-slate-400 dark:border-slate-800">
                <Link href={`/inventario/movimientos?warehouseId=${id}`} className="hover:underline">
                  Ver todos los movimientos →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          TAB: TRANSFERENCIAS
          ============================================================ */}
      {activeTab === 'transferencias' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
              <Truck className="h-5 w-5 text-[#2F6BFF]" />
              <span>Transferencias entre Almacenes</span>
            </h3>

            {transfersLoading && (
              <div className="h-20 w-full animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            )}

            {!transfersLoading && transfers.length === 0 && (
              <p className="py-8 text-center text-xs font-bold text-slate-400">
                Sin transferencias.
              </p>
            )}

            <div className="space-y-3">
              {transfers.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-xs dark:border-slate-850 dark:bg-slate-900/10 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/transferencias/${t.id}`}
                        className="font-mono font-black text-slate-500 hover:underline"
                      >
                        {t.number}
                      </Link>
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[9.5px] font-bold uppercase text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
                        {t.status}
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-500 dark:text-slate-400">
                      Desde:{' '}
                      <span className="font-black text-slate-700 dark:text-slate-200">
                        {t.fromWarehouse?.name ?? '—'}
                      </span>{' '}
                      → Hacia:{' '}
                      <span className="font-black text-slate-700 dark:text-slate-200">
                        {t.toWarehouse?.name ?? '—'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-bold text-slate-400">Fecha</p>
                    <p className="mt-0.5 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {new Date(t.date).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   STATUS BADGE — mapea s.status ('ok' | 'low' | 'out')
   ============================================================ */
function StatusBadge({ status }: { status: 'ok' | 'low' | 'out' }) {
  const map: Record<typeof status, { label: string; cls: string }> = {
    ok: {
      label: 'OK',
      cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400',
    },
    low: {
      label: 'Bajo',
      cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400',
    },
    out: {
      label: 'Crítico',
      cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400',
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}
