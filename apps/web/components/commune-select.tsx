'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { listCommunes } from '@/lib/customers-api';
import { cn } from '@/lib/utils';
import type { CommuneDto } from '@inventory/shared';

interface Props {
  value: string | null;
  onChange: (communeId: string | null, commune?: CommuneDto) => void;
  /** Comuna ya elegida (para mostrar nombre antes de cargar el catálogo). */
  initialCommune?: CommuneDto | null;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Combobox con búsqueda para elegir una de las 346 comunas chilenas.
 * Usa `CommandDialog` para que la búsqueda funcione bien con catálogos largos.
 * Las comunas se cargan al abrir el dialog (lazy) y se cachean por 1 hora.
 */
export function CommuneSelect({
  value,
  onChange,
  initialCommune,
  placeholder = 'Seleccionar comuna...',
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  const communes = useQuery({
    queryKey: ['communes'],
    queryFn: () => listCommunes(),
    staleTime: 60 * 60 * 1000, // 1h: el catálogo cambia muy raramente
    enabled: open || !!value, // si ya hay un value, cargo para mostrar el nombre
  });

  const selected =
    communes.data?.find((c) => c.id === value) ?? initialCommune ?? null;

  // Agrupar por región para una experiencia más navegable
  const grouped = communes.data
    ? Object.entries(
        communes.data.reduce<Record<string, CommuneDto[]>>((acc, c) => {
          (acc[c.region] ??= []).push(c);
          return acc;
        }, {}),
      )
    : [];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between font-normal"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <span className={cn(!selected && 'text-muted-foreground')}>
          {selected ? `${selected.name} (${selected.region})` : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar comuna o región..." />
        <CommandList>
          {communes.isLoading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Cargando comunas...
            </div>
          )}
          {communes.isError && (
            <div className="px-4 py-6 text-center text-sm text-destructive">
              No se pudieron cargar las comunas.
            </div>
          )}
          {communes.data && communes.data.length === 0 && (
            <CommandEmpty>Sin comunas en el catálogo.</CommandEmpty>
          )}
          <CommandEmpty>Sin coincidencias.</CommandEmpty>
          {value && (
            <CommandGroup heading="Acción">
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Quitar selección
              </CommandItem>
            </CommandGroup>
          )}
          {grouped.map(([region, items]) => (
            <CommandGroup key={region} heading={region}>
              {items.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.region}`}
                  onSelect={() => {
                    onChange(c.id, c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === c.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
