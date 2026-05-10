'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UrlFilters } from './use-url-filters';

/**
 * Estado local + push debounceado a la URL para inputs de búsqueda libre.
 *
 * **Por qué este hook:** atar `<Input value={values.q} onChange={...setFilter}/>`
 * directo al estado de URL provoca que cada tecla dispare `router.replace`,
 * lo que reordena el árbol de React y descarta caracteres si el usuario
 * escribe rápido. Aquí mantenemos un `localValue` (sincronizado con el input
 * en cada keystroke) y empujamos a la URL solo cuando el usuario deja de
 * escribir por `delayMs`.
 *
 * También sincroniza `localValue` cuando el filtro cambia desde afuera
 * (back/forward del navegador, click en "limpiar filtros", link compartido).
 */
export function useDebouncedUrlFilter<K extends string>(
  filters: UrlFilters<K>,
  key: K,
  options: { delayMs?: number; resetKeys?: K[] } = {},
): { value: string; setValue: (next: string) => void } {
  const { delayMs = 300, resetKeys } = options;
  const urlValue = filters.values[key] ?? '';

  const [localValue, setLocalValue] = useState(urlValue);

  // Sincronizar local cuando la URL cambia desde afuera (no por nuestro propio push).
  const lastPushedRef = useRef(urlValue);
  useEffect(() => {
    if (urlValue !== lastPushedRef.current) {
      setLocalValue(urlValue);
      lastPushedRef.current = urlValue;
    }
  }, [urlValue]);

  const setValue = useCallback((next: string) => {
    setLocalValue(next);
  }, []);

  // Push debounceado a la URL.
  useEffect(() => {
    if (localValue === lastPushedRef.current) return;
    const t = setTimeout(() => {
      lastPushedRef.current = localValue;
      const patch: Record<string, string | null> = {
        [key]: localValue === '' ? null : localValue,
      };
      if (resetKeys) {
        for (const rk of resetKeys) patch[rk] = null;
      }
      filters.setFilters(patch as Parameters<typeof filters.setFilters>[0]);
    }, delayMs);
    return () => clearTimeout(t);
  }, [localValue, delayMs, key, filters, resetKeys]);

  return { value: localValue, setValue };
}
