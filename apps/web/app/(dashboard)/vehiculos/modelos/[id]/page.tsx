'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  listVehicleMakes,
  listVehicleModels,
  productsByVehicle,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';

/**
 * /vehiculos/modelos/[id] — Rediseño UI (look de VehiculosView).
 *
 * SOLO UI/UX. Toda la lógica se preserva 1:1 desde page-6b2cefb8:
 *  · makesQ + modelsQ ('all') para resolver el nombre del modelo y su marca.
 *  · productsQ = productsByVehicle({ modelId }) → productos compatibles.
 *  Pantalla de solo lectura (sin CRUD).
 *
 * Cambios visuales: la <Table> genérica pasa a un sheet rounded-3xl con el
 * mismo estilo del resto del módulo (header back + título font-black, tabla
 * SKU / Nombre / Categoría / Marca producto / Precio).
 */
export default function VehicleModelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // Cargamos todos los modelos y todas las marcas para resolver el nombre
  // del modelo + su marca (las queries son pequeñas y se cachean).
  const makesQ = useQuery({
    queryKey: ['vehicle-makes'],
    queryFn: listVehicleMakes,
  });
  const modelsQ = useQuery({
    queryKey: ['vehicle-models', 'all'],
    queryFn: () => listVehicleModels(),
  });
  const model = (modelsQ.data ?? []).find((m) => m.id === id) ?? null;
  const make = model
    ? (makesQ.data ?? []).find((m) => m.id === model.makeId) ?? null
    : null;

  const productsQ = useQuery({
    queryKey: ['products-by-vehicle', { modelId: id }],
    queryFn: () => productsByVehicle({ modelId: id }),
    enabled: !!id,
  });
  const products = productsQ.data ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          BACK LINK
          ============================================================ */}
      <Link
        href="/vehiculos"
        className="group inline-flex w-fit items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Volver a marcas</span>
      </Link>

      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="min-w-0">
        {make?.name && (
          <span className="text-[12px] font-bold text-slate-400">{make.name}</span>
        )}
        <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          {model?.name ?? 'Modelo'}
        </h1>
        <p className="mt-1.5 text-xs font-bold text-slate-500">
          <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
            {products.length}
          </strong>{' '}
          {products.length === 1 ? 'producto compatible' : 'productos compatibles'}
        </p>
      </div>

      {/* ============================================================
          PRODUCTS TABLE
          ============================================================ */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="w-32 py-3.5 pl-6 pr-3">SKU</th>
                <th className="py-3.5 px-3">Nombre</th>
                <th className="w-40 py-3.5 px-3">Categoría</th>
                <th className="w-44 py-3.5 px-3">Marca producto</th>
                <th className="w-40 py-3.5 pr-6 pl-3 text-right">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {productsQ.isLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-4">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </td>
                </tr>
              )}

              {!productsQ.isLoading && products.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-xs font-medium italic text-slate-400"
                  >
                    Ningún producto del catálogo es compatible con este modelo.
                  </td>
                </tr>
              )}

              {products.map((p) => (
                <tr
                  key={p.id}
                  className="group text-xs transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/10"
                >
                  <td className="py-4 pl-6 pr-3">
                    <Link
                      href={`/productos/${p.id}`}
                      className="font-mono text-[11px] font-bold text-slate-500 underline-offset-2 transition-colors hover:text-[#2F6BFF] hover:underline dark:text-slate-400"
                    >
                      {p.sku}
                    </Link>
                  </td>
                  <td className="py-4 px-3">
                    <Link
                      href={`/productos/${p.id}`}
                      className="font-black uppercase tracking-tight text-slate-900 underline-offset-2 transition-colors hover:text-[#2F6BFF] hover:underline dark:text-white"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-4 px-3 font-bold text-slate-500 dark:text-slate-400">
                    {p.category?.name ?? '—'}
                  </td>
                  <td className="py-4 px-3 font-bold text-slate-500 dark:text-slate-400">
                    {p.brand?.name ?? '—'}
                  </td>
                  <td className="py-4 pr-6 pl-3 text-right font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
                    {formatCurrency(p.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
