'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { listPurchases } from '@/lib/inventory-api';
import type { PurchaseEntryDto } from '@inventory/shared';

interface Props {
  onPick: (purchase: PurchaseEntryDto) => void;
}

/**
 * Ronda 11 — combobox de búsqueda de compras. Análogo a `<SaleSearchCombobox>`,
 * lo usa el dialog de "Nueva devolución a proveedor" para elegir la compra
 * de la cual se devuelve sin tener que entrar al detalle.
 *
 * Busca por nombre/RUT del proveedor o por notas de la compra. Debounce 250ms.
 */
export function PurchaseSearchCombobox({ onPick }: Props) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ['purchases-search', { q: debouncedQ }],
    queryFn: () =>
      listPurchases({
        q: debouncedQ || undefined,
        page: 1,
        pageSize: 10,
      }),
    enabled: debouncedQ.length > 0,
  });

  const items = results.data?.items ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-md border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por proveedor (nombre o RUT) o notas"
          className="border-0 focus-visible:ring-0"
        />
      </div>
      {debouncedQ.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Escribí al menos 1 caracter para buscar.
        </p>
      ) : (
        <div className="rounded-md border bg-card">
          {results.isLoading && (
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}
          {!results.isLoading && items.length === 0 && (
            <div className="p-3 text-center text-sm text-muted-foreground">
              Sin resultados. Probá con otro término.
            </div>
          )}
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full items-center justify-between gap-3 border-b p-3 text-left hover:bg-accent last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {p.supplier?.name ?? '—'}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.supplier?.taxId ?? 'sin RUT'} ·{' '}
                  {new Date(p.date).toLocaleDateString('es-CL')}
                  {p.warehouse?.name ? ` · ${p.warehouse.name}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular-nums text-sm font-medium">
                  {formatCurrency(p.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.items?.length ?? 0} ítem
                  {(p.items?.length ?? 0) === 1 ? '' : 's'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
