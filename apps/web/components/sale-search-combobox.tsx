'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { listSales } from '@/lib/sales-api';
import type { SaleDto } from '@inventory/shared';

interface Props {
  onPick: (sale: SaleDto) => void;
  // Si true, solo ventas no canceladas (default). Útil para devoluciones/
  // garantías/guías que requieren ventas activas.
  activeOnly?: boolean;
}

/**
 * Ronda 9 — combobox de búsqueda de venta. Lo usan los dialogs de
 * operaciones rápidas (`/devoluciones`, `/garantias`, `/guias`) para
 * elegir la venta sin tener que abrir su detalle primero.
 *
 * Busca por número, nombre o RUT del cliente. Debounce 250ms.
 */
export function SaleSearchCombobox({ onPick, activeOnly = true }: Props) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ['sales-search', { q: debouncedQ, activeOnly }],
    queryFn: () =>
      listSales({
        q: debouncedQ || undefined,
        status: activeOnly ? 'PAID' : undefined,
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
          placeholder="Buscar por número (VTA-...), RUT o nombre del cliente"
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
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className="flex w-full items-center justify-between gap-3 border-b p-3 text-left hover:bg-accent last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-medium">{s.number}</div>
                <div className="truncate text-sm">
                  {s.customer?.name ?? '—'}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.customer?.taxId ?? 'sin RUT'} ·{' '}
                  {new Date(s.date).toLocaleDateString('es-CL')}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular-nums text-sm font-medium">
                  {formatCurrency(s.total)}
                </div>
                <div className="text-xs text-muted-foreground">{s.status}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
