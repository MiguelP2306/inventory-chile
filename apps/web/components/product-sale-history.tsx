'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProductSales } from '@/lib/catalog-api';
import { Permission, useCan } from '@/lib/current-user-context';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Historial de ventas del producto (última venta + anteriores + acumulados).
 * Espejo de `ProductPurchaseHistory`, pero del lado de la salida: se monta en
 * el tab "Ventas" del producto. A diferencia de Compras, lo ve cualquier rol;
 * el backend manda costo/ganancia en null cuando el viewer no ve costos, así
 * que esas columnas se ocultan solas.
 * Cada fila linkea a la venta (`/ventas/[saleId]`).
 */
export function ProductSaleHistory({ productId }: { productId: string }) {
  const router = useRouter();
  const canSeeCost = useCan(Permission.PRODUCT_VIEW_COST);
  const sales = useQuery({
    queryKey: ['product-sales', productId],
    queryFn: () => getProductSales(productId),
  });

  const rows = sales.data?.rows ?? [];
  const last = rows[0];
  const showProfit = canSeeCost && sales.data?.totalProfit != null;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { dateStyle: 'medium' });

  if (sales.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <Receipt className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">
          Este producto todavía no se vendió.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Las ventas se registran desde{' '}
          <Link href="/ventas" className="underline">
            Ventas
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Acumulados — sobre TODAS las ventas no canceladas, no solo las listadas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Unidades vendidas"
          value={`${sales.data?.totalQty ?? 0} un.`}
        />
        <Kpi label="Ventas" value={String(sales.data?.salesCount ?? 0)} />
        <Kpi
          label="Monto vendido"
          value={formatCurrency(sales.data?.totalAmount)}
        />
        {showProfit && (
          <Kpi
            label="Ganancia"
            value={formatCurrency(sales.data?.totalProfit)}
            positive={Number(sales.data?.totalProfit ?? 0) >= 0}
          />
        )}
      </div>

      {/* Última venta destacada */}
      {last && (
        <Link
          href={`/ventas/${last.saleId}`}
          className="block rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 transition-colors hover:bg-emerald-500/10"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Última venta · {last.number}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Ver venta <ExternalLink className="h-3 w-3" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Fecha" value={fmtDate(last.date)} />
            <Stat label="Cantidad" value={`${last.qty} un.`} />
            <Stat
              label="Precio venta (unit.)"
              value={formatCurrency(last.unitPrice)}
            />
            <Stat label="Cliente" value={last.customerName ?? '—'} />
          </div>
        </Link>
      )}

      {/* Historial completo */}
      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/20 px-4 py-2.5">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Historial de ventas ({rows.length})
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Fecha</th>
                <th className="py-2.5">Venta</th>
                <th className="py-2.5">Cliente</th>
                <th className="py-2.5 text-right">Cant.</th>
                <th className="py-2.5 text-right">Precio unit.</th>
                <th
                  className={cn('py-2.5 text-right', !showProfit && 'px-4')}
                >
                  Subtotal
                </th>
                {showProfit && (
                  <th className="px-4 py-2.5 text-right">Ganancia</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => {
                const cancelled = r.status === 'CANCELLED';
                return (
                  <tr
                    key={`${r.saleId}-${i}`}
                    onClick={() => router.push(`/ventas/${r.saleId}`)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-accent/40',
                      cancelled && 'opacity-60',
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-muted-foreground">
                      {fmtDate(r.date)}
                    </td>
                    <td className="py-3">
                      <span
                        className={cn(
                          'font-mono font-semibold',
                          cancelled && 'line-through',
                        )}
                      >
                        {r.number}
                      </span>
                      <StatusTag status={r.status} />
                    </td>
                    <td className="max-w-[180px] truncate py-3 font-semibold">
                      {r.customerName ?? '—'}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {r.qty}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {formatCurrency(r.unitPrice)}
                    </td>
                    <td
                      className={cn(
                        'py-3 text-right font-mono font-bold tabular-nums',
                        !showProfit && 'px-4',
                      )}
                    >
                      {formatCurrency(r.subtotal)}
                    </td>
                    {showProfit && (
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-mono font-bold tabular-nums',
                          Number(r.profit ?? 0) >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-destructive',
                        )}
                      >
                        {formatCurrency(r.profit)}
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

/** Badge chico inline al lado del número de venta. Solo si no está pagada. */
function StatusTag({ status }: { status: 'PENDING' | 'PAID' | 'CANCELLED' }) {
  if (status === 'PAID') return null;
  return (
    <span
      className={cn(
        'ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider',
        status === 'CANCELLED'
          ? 'bg-destructive/15 text-destructive'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      )}
    >
      {status === 'CANCELLED' ? 'Cancelada' : 'Pendiente'}
    </span>
  );
}

function Kpi({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 px-3.5 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 truncate font-mono text-sm font-bold tabular-nums',
          positive === undefined
            ? 'text-foreground'
            : positive
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-destructive',
        )}
      >
        {value}
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
