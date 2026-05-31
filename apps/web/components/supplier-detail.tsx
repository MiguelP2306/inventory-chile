'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatCurrency } from '@/lib/format';
import { listPurchases } from '@/lib/inventory-api';
import type { SupplierDto } from '@inventory/shared';

/**
 * <SupplierDetail> — Rediseño UI (look de ProveedoresView detalle).
 *
 * SOLO UI/UX. Recibe el mismo prop `supplier: SupplierDto` que la versión
 * previa (el server component /proveedores/[id] sigue haciendo el fetch y
 * notFound, sin cambios).
 *
 * Cambios visuales: header con back redondeado + nombre + RUT, tab bar custom
 * (Datos / Compras), card de datos en grid de 2 columnas y tabla de compras.
 *
 * ⚠️ Pestaña "Compras": el mock lista las compras del proveedor. Acá las traigo
 * con listPurchases({ supplierId }). Si tu <SupplierDetail> original ya recibía
 * las compras por prop o por otro endpoint, reemplazá esta query por esa
 * fuente (marcado con TODO). Los nombres de campo (p.date/p.total/p.invoices)
 * siguen el mismo DTO que usa /compras — confirmá que calcen.
 */
export function SupplierDetail({ supplier }: { supplier: SupplierDto }) {
  const [activeTab, setActiveTab] = useState<'datos' | 'compras'>('datos');

  // TODO: confirmá la fuente real de compras del proveedor.
  const purchasesQ = useQuery({
    queryKey: ['purchases', { supplierId: supplier.id, page: 1 }],
    queryFn: () => listPurchases({ supplierId: supplier.id, page: 1, pageSize: 50 }),
    enabled: activeTab === 'compras',
  });
  const purchases = purchasesQ.data?.items ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex select-none items-center gap-3">
        <Link
          href="/proveedores"
          title="Volver"
          className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white md:text-2xl">
            {supplier.name}
          </h1>
          <p className="mt-0.5 text-xs font-bold text-slate-400">
            {supplier.taxId ? `RUT: ${supplier.taxId}` : 'Sin RUT'}
          </p>
        </div>
      </div>

      {/* ============================================================
          TAB BAR
          ============================================================ */}
      <div className="flex select-none gap-2">
        {(['datos', 'compras'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`cursor-pointer rounded-xl px-4 py-2.5 text-xs font-black transition-all ${
              activeTab === tab
                ? 'border border-slate-100 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-[#11151C] dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'datos' ? 'Datos' : 'Compras'}
          </button>
        ))}
      </div>

      {/* ============================================================
          TAB: DATOS
          ============================================================ */}
      {activeTab === 'datos' && (
        <div className="select-none rounded-2xl border border-slate-100 bg-white p-8 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
          <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
            <Field label="Nombre / Razón social" value={supplier.name} strong />
            <Field label="RUT / NIT" value={supplier.taxId} />
            <Field label="Email" value={supplier.email} />
            <Field label="Teléfono" value={supplier.phone} />
            <div className="col-span-1 border-t border-slate-50 pt-5 dark:border-slate-900/50 md:col-span-2">
              <Field label="Dirección" value={supplier.address} />
            </div>
            {supplier.legalName && (
              <div className="col-span-1 border-t border-slate-50 pt-5 dark:border-slate-900/50">
                <Field label="Razón social complementaria" value={supplier.legalName} />
              </div>
            )}
            {supplier.contactPerson && (
              <div className="col-span-1 border-t border-slate-50 pt-5 dark:border-slate-900/50">
                <Field label="Contacto vendedor" value={supplier.contactPerson} />
              </div>
            )}
            {supplier.notes && (
              <div className="col-span-1 border-t border-slate-50 pt-5 dark:border-slate-900/50 md:col-span-2">
                <Field label="Notas" value={supplier.notes} multiline />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          TAB: COMPRAS
          ============================================================ */}
      {activeTab === 'compras' && (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
          <div className="overflow-x-auto">
            {purchasesQ.isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : purchases.length > 0 ? (
              <table className="w-full min-w-[500px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/30 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
                    <th className="w-[20%] py-4 pl-6">Fecha</th>
                    <th className="py-4">Notas</th>
                    <th className="py-4 text-right">Total</th>
                    <th className="w-[120px] py-4 text-center">Facturas</th>
                    <th className="w-[90px] py-4 pr-6 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 dark:divide-slate-850 dark:text-slate-300">
                  {purchases.map((p) => {
                    const invoiceCount = p.invoices?.length ?? 0;
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="py-4 pl-6 font-semibold">
                          {new Date(p.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                        </td>
                        <td className="max-w-[200px] truncate py-4 text-slate-500">{p.notes ?? '—'}</td>
                        <td className="py-4 text-right font-mono font-bold text-slate-950 dark:text-white">
                          {formatCurrency(p.total)}
                        </td>
                        <td className="py-4 text-center">
                          {invoiceCount > 0 ? (
                            <div className="inline-flex justify-center gap-1 text-slate-400">
                              {Array.from({ length: Math.min(3, invoiceCount) }).map((_, i) => (
                                <Paperclip key={i} className="h-3.5 w-3.5" />
                              ))}
                              {invoiceCount > 3 && (
                                <span className="text-[9px] font-bold">+{invoiceCount - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-4 pr-6 text-center">
                          <Link
                            href={`/compras/${p.id}`}
                            title="Ver detalle de entrada"
                            className="inline-flex cursor-pointer items-center p-1.5 text-slate-400 transition-colors hover:text-[#2F6BFF]"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="select-none py-16 text-center text-xs font-bold text-slate-400">
                No se registran compras para este proveedor.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  strong,
  multiline,
}: {
  label: string;
  value?: string | null;
  strong?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <p
        className={`text-sm ${
          strong ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'
        } ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}
      >
        {value && value.trim() !== '' ? value : '—'}
      </p>
    </div>
  );
}
