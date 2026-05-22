'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listCustomers } from '@/lib/customers-api';
import { listSuppliers } from '@/lib/inventory-api';
import { cn } from '@/lib/utils';
import { formatRutPretty } from '@/lib/validators/rut';
import type { CustomerDto, SupplierDto } from '@inventory/shared';

// Ronda 13 — filtro combinado de "Contacto" (cliente o proveedor) para la
// página de movimientos. Único select pero con 2 tabs internas para que el
// operador pueda buscar entre clientes o proveedores sin amontonar dos
// dropdowns en la grilla de filtros.

export type ContactKind = 'customer' | 'supplier';

export interface ContactValue {
  kind: ContactKind;
  id: string;
  name: string;
  taxId: string | null;
}

interface Props {
  value: ContactValue | null;
  onChange: (next: ContactValue | null) => void;
}

export function ContactFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ContactKind>(value?.kind ?? 'customer');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Resetear búsqueda al cerrar el popover.
  useEffect(() => {
    if (!open) {
      setQ('');
      setDebouncedQ('');
    } else {
      // Al abrir, posicionar la tab en el tipo del contacto actual.
      if (value) setTab(value.kind);
    }
  }, [open, value]);

  const customers = useQuery({
    queryKey: ['contact-filter-customers', { q: debouncedQ }],
    queryFn: () =>
      listCustomers({
        q: debouncedQ || undefined,
        page: 1,
        pageSize: 15,
      }),
    enabled: open && tab === 'customer',
  });

  const suppliers = useQuery({
    queryKey: ['contact-filter-suppliers', { q: debouncedQ }],
    queryFn: () => listSuppliers(debouncedQ || undefined),
    enabled: open && tab === 'supplier',
  });

  const customerItems: CustomerDto[] = customers.data
    ? Array.isArray(customers.data)
      ? customers.data
      : customers.data.items
    : [];

  const supplierItems: SupplierDto[] = suppliers.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between gap-2 font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {value ? value.name : 'Cliente o proveedor'}
            </span>
            {value?.taxId && (
              <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                · {formatRutPretty(value.taxId)}
              </span>
            )}
          </span>
          {value ? (
            <X
              className="h-4 w-4 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="space-y-2 p-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as ContactKind)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="customer">Cliente</TabsTrigger>
              <TabsTrigger value="supplier">Proveedor</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                tab === 'customer' ? 'Buscar cliente…' : 'Buscar proveedor…'
              }
              className="h-9 pl-7"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto border-t">
          {tab === 'customer' && (
            <>
              {customers.isLoading && (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              )}
              {!customers.isLoading && customerItems.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {debouncedQ ? 'Sin resultados.' : 'Escribí para buscar.'}
                </p>
              )}
              {customerItems.map((c) => (
                <ContactRow
                  key={c.id}
                  active={value?.kind === 'customer' && value.id === c.id}
                  onClick={() => {
                    onChange({
                      kind: 'customer',
                      id: c.id,
                      name: c.name,
                      taxId: c.taxId,
                    });
                    setOpen(false);
                  }}
                  name={c.name}
                  taxId={c.taxId}
                  secondary={c.phone ?? undefined}
                />
              ))}
            </>
          )}
          {tab === 'supplier' && (
            <>
              {suppliers.isLoading && (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              )}
              {!suppliers.isLoading && supplierItems.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {debouncedQ ? 'Sin resultados.' : 'Escribí para buscar.'}
                </p>
              )}
              {supplierItems.map((s) => (
                <ContactRow
                  key={s.id}
                  active={value?.kind === 'supplier' && value.id === s.id}
                  onClick={() => {
                    onChange({
                      kind: 'supplier',
                      id: s.id,
                      name: s.name,
                      taxId: s.taxId,
                    });
                    setOpen(false);
                  }}
                  name={s.name}
                  taxId={s.taxId}
                  secondary={s.contactPerson ?? undefined}
                />
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ContactRow({
  active,
  onClick,
  name,
  taxId,
  secondary,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  taxId: string | null;
  secondary?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
        active && 'bg-accent',
      )}
    >
      <span className="font-medium">{name}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {taxId && <span className="font-mono">{formatRutPretty(taxId)}</span>}
        {secondary && <span>· {secondary}</span>}
      </span>
    </button>
  );
}
