'use client';

/* ============================================================================
 *  BasuraPage (Fase 12) — listado SOLO LECTURA de productos eliminados por
 *  soft delete. Por ahora: no se restauran ni se editan, solo se visualizan
 *  para mantener trazabilidad histórica.
 * ========================================================================== */

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import { listDeletedProducts, publicImageUrl } from '@/lib/catalog-api';
import { Permission, useCan } from '@/lib/current-user-context';
import { formatCurrency } from '@/lib/format';

export default function BasuraPage() {
  const canSeeCost = useCan(Permission.PRODUCT_VIEW_COST);
  const query = useQuery({
    queryKey: ['products-trash'],
    queryFn: listDeletedProducts,
  });

  const items = query.data ?? [];
  const colCount = canSeeCost ? 6 : 5;

  return (
    <div className="flex flex-col gap-5 text-slate-800 dark:text-slate-200">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <Link
            href="/productos"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
            aria-label="Volver a productos"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              <Trash2 className="h-5 w-5 text-slate-400" />
              Basura
            </h1>
            <p className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="tabular-nums">
                {items.length.toLocaleString('es-CL')}
              </span>{' '}
              {items.length === 1
                ? 'producto eliminado'
                : 'productos eliminados'}
            </p>
          </div>
        </div>
      </div>

      {/* Aviso */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-300">
        Estos productos fueron eliminados (soft delete). No aparecen en
        listados, búsquedas ni ventas, pero se conservan para trazabilidad
        histórica. Por ahora son <strong>solo lectura</strong>: no se pueden
        restaurar ni editar.
      </div>

      {/* Tabla */}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-[#11151C]">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="w-[50px] px-4 py-3" />
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Nombre</th>
                <th className="px-3 py-3">Categoría</th>
                <th className="px-3 py-3">Marca</th>
                {canSeeCost && <th className="px-3 py-3 text-right">Precio</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {query.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={colCount} className="px-3">
                      <Skeleton className="my-1 h-10 w-full" />
                    </td>
                  </tr>
                ))}

              {!query.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={colCount}>
                    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Trash2 className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        La basura está vacía
                      </p>
                      <p className="text-xs text-slate-400">
                        Los productos que elimines aparecerán acá.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!query.isLoading &&
                items.map((p) => {
                  const cover = publicImageUrl(p.coverUrl ?? null);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-slate-50 dark:border-slate-800/50"
                    >
                      <td className="py-2.5 pl-4 pr-1">
                        <span className="inline-block opacity-60 grayscale">
                          <ProductThumbnail src={cover} size={42} />
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11.5px] font-medium text-slate-400 dark:text-slate-500">
                        {p.sku ?? '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-bold tracking-tight text-slate-700 line-through decoration-slate-300 dark:text-slate-300">
                          {p.name}
                        </span>
                        {p.partNumber && (
                          <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                            N° parte: {p.partNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {p.category?.name ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {p.brand?.name ?? '—'}
                      </td>
                      {canSeeCost && (
                        <td className="px-3 py-3 text-right font-mono text-[12px] font-medium tabular-nums text-slate-400">
                          {formatCurrency(p.price)}
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
