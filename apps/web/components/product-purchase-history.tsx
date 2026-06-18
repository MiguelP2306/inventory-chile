'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProductPurchases } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';

/**
 * Historial de compras del producto (última compra + anteriores). Solo se monta
 * en el tab "Compras" del producto, que el form muestra únicamente a roles con
 * permiso de ver costos. Cada fila linkea a la compra (`/compras/[entryId]`).
 */
export function ProductPurchaseHistory({ productId }: { productId: string }) {
  const router = useRouter();
  const purchases = useQuery({
    queryKey: ['product-purchases', productId],
    queryFn: () => getProductPurchases(productId),
  });

  const rows = purchases.data ?? [];
  const last = rows[0];

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { dateStyle: 'medium' });

  if (purchases.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <ShoppingCart className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">
          Este producto todavía no tiene compras registradas.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Las compras se cargan desde{' '}
          <Link href="/compras" className="underline">
            Compras
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Última compra destacada */}
      {last && (
        <Link
          href={`/compras/${last.entryId}`}
          className="block rounded-xl border border-[#2F6BFF]/30 bg-[#2F6BFF]/5 p-4 transition-colors hover:bg-[#2F6BFF]/10"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#2F6BFF]">
              Última compra
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F6BFF]">
              Ver compra <ExternalLink className="h-3 w-3" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Fecha" value={fmtDate(last.date)} />
            <Stat label="Cantidad" value={`${last.qty} un.`} />
            <Stat
              label="Precio compra (unit.)"
              value={formatCurrency(last.unitCost)}
            />
            <Stat label="Proveedor" value={last.supplierName ?? '—'} />
          </div>
        </Link>
      )}

      {/* Historial completo */}
      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/20 px-4 py-2.5">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Historial de compras ({rows.length})
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Fecha</th>
                <th className="py-2.5">Proveedor</th>
                <th className="py-2.5 text-right">Cant.</th>
                <th className="py-2.5 text-right">Precio unit.</th>
                <th className="px-4 py-2.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr
                  key={`${r.entryId}-${i}`}
                  onClick={() => router.push(`/compras/${r.entryId}`)}
                  className="cursor-pointer transition-colors hover:bg-accent/40"
                >
                  <td className="px-4 py-3 font-medium text-muted-foreground">
                    {fmtDate(r.date)}
                  </td>
                  <td className="max-w-[200px] truncate py-3 font-semibold">
                    {r.supplierName ?? '—'}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {r.qty}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {formatCurrency(r.unitCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                    {formatCurrency(r.subtotal)}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-bold text-foreground">
        {value}
      </div>
    </div>
  );
}
