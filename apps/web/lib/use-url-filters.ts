'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Hook chico para sincronizar filtros con la URL (?clave=valor).
 *
 * - Lee los filtros desde `useSearchParams`, así sirve también para landings
 *   compartidas (el estado vive en la URL, no en useState).
 * - `setFilter` reemplaza la URL con `router.replace` (no agrega al historial).
 * - Cuando se setea un valor "vacío" (null, undefined o ''), se borra la query.
 *
 * Los `defaults` definen las claves manejadas; sus valores son siempre `string`
 * en `values` (string vacío si no hay query).
 */
export interface UrlFilters<K extends string> {
  values: Record<K, string>;
  setFilter: (key: K, value: string | null | undefined) => void;
  setFilters: (patch: Partial<Record<K, string | null | undefined>>) => void;
  clear: () => void;
}

export function useUrlFilters<K extends string>(
  defaults: Record<K, string>,
): UrlFilters<K> {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const values = useMemo(() => {
    const out = { ...defaults } as Record<K, string>;
    for (const key of Object.keys(defaults) as K[]) {
      const v = search.get(key);
      if (v != null && v !== '') out[key] = v;
    }
    return out;
  }, [search, defaults]);

  const replace = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setFilter = useCallback(
    (key: K, value: string | null | undefined) => {
      const params = new URLSearchParams(search.toString());
      if (value == null || value === '') params.delete(key);
      else params.set(key, value);
      replace(params);
    },
    [search, replace],
  );

  const setFilters = useCallback(
    (patch: Partial<Record<K, string | null | undefined>>) => {
      const params = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') params.delete(k);
        else params.set(k, v as string);
      }
      replace(params);
    },
    [search, replace],
  );

  const clear = useCallback(() => {
    replace(new URLSearchParams());
  }, [replace]);

  return { values, setFilter, setFilters, clear };
}
