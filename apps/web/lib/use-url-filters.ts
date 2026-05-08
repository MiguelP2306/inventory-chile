'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Hook chico para sincronizar filtros con la URL (?clave=valor).
 *
 * - Lee los filtros desde `useSearchParams`, así sirve también para landings
 *   compartidas (el estado vive en la URL, no en useState).
 * - `setFilter` reemplaza la URL con `router.replace` (no agrega al historial).
 * - Cuando se setea un valor "vacío" (null, undefined o ''), se borra la query.
 *
 * **Por qué el `pendingRef`:** dos llamadas a `setFilter` en el mismo tick
 * (típico en selects que setean su key + resetean `page`) — sin el ref, la
 * segunda lee el `search` capturado por el callback antes del re-render y
 * sobreescribe la primera. El ref guarda la última URL "intendida" y cada
 * `setFilter` parte de ahí, así el chained update funciona. El `useEffect`
 * sincroniza el ref cuando la URL cambia desde afuera (back/forward del
 * navegador, link externo, clear).
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

  const searchString = search.toString();
  const pendingRef = useRef<string>(searchString);

  useEffect(() => {
    pendingRef.current = searchString;
  }, [searchString]);

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
      pendingRef.current = qs;
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setFilter = useCallback(
    (key: K, value: string | null | undefined) => {
      const params = new URLSearchParams(pendingRef.current);
      if (value == null || value === '') params.delete(key);
      else params.set(key, value);
      replace(params);
    },
    [replace],
  );

  const setFilters = useCallback(
    (patch: Partial<Record<K, string | null | undefined>>) => {
      const params = new URLSearchParams(pendingRef.current);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') params.delete(k);
        else params.set(k, v as string);
      }
      replace(params);
    },
    [replace],
  );

  const clear = useCallback(() => {
    replace(new URLSearchParams());
  }, [replace]);

  return { values, setFilter, setFilters, clear };
}
