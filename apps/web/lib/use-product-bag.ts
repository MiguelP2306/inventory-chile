'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * "Bolso" temporal de productos — vive en localStorage del navegador.
 * Sirve como carrito de acciones rápidas: el operador busca productos en
 * Cmd+K, los va sumando, y al final convierte el bolso en cotización o
 * venta sin tener que repetir la búsqueda en el form.
 *
 * Persiste entre navegación y refresh; se pierde al cerrar el navegador
 * o cambiar de dispositivo (decisión del cliente — no es estado
 * sincronizado entre operadores).
 */

const STORAGE_KEY = 'inventory-chile:bag:v1';

/**
 * Clave de LÍNEA del bolso: producto + bodega. Permite tener el MISMO producto
 * en líneas separadas si se agregó desde bodegas distintas (Fase 12). Si el
 * item no trae bodega, la clave cae sólo al productId.
 */
export function bagLineKey(item: {
  productId: string;
  warehouseId?: string | null;
}): string {
  return `${item.productId}::${item.warehouseId ?? ''}`;
}

export interface BagItem {
  productId: string;
  sku: string | null;
  name: string;
  // Número de parte del fabricante — se muestra en el bolso (Fase 12).
  partNumber?: string | null;
  unitPrice: string; // bruto, formato "0.00"
  qty: number;
  coverUrl: string | null; // ya resuelta a URL absoluta cuando se agregó
  // Bodega elegida en el modal "Agregar al bolso" (Fase 12). Se recuerda para
  // mostrarla en el bolso y para predefinir la bodega al crear la venta. El
  // `warehouseQty` es el stock que tenía esa bodega al momento de agregar.
  warehouseId?: string | null;
  warehouseName?: string | null;
  warehouseAddress?: string | null;
  locationCode?: string | null;
  warehouseQty?: number | null;
  addedAt: number; // timestamp ms para ordenar
}

interface BagState {
  items: BagItem[];
}

type Listener = () => void;

class BagStore {
  private state: BagState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = this.readFromStorage();
    // Sincroniza el estado entre pestañas del mismo browser.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.state = this.readFromStorage();
          this.notify();
        }
      });
    }
  }

  private readFromStorage(): BagState {
    if (typeof window === 'undefined') return { items: [] };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { items: [] };
      const parsed = JSON.parse(raw) as BagState;
      if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
      return parsed;
    } catch {
      return { items: [] };
    }
  }

  private writeToStorage() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // localStorage lleno o privacidad — ignoramos.
    }
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = (): BagState => this.state;

  add(input: Omit<BagItem, 'addedAt'>) {
    // Identidad por producto + bodega: el mismo producto desde dos bodegas
    // distintas son DOS líneas separadas.
    const key = bagLineKey(input);
    const existingIdx = this.state.items.findIndex(
      (i) => bagLineKey(i) === key,
    );
    let nextItems: BagItem[];
    if (existingIdx >= 0) {
      // Mismo producto Y misma bodega → sumamos la cantidad.
      nextItems = this.state.items.map((it, i) =>
        i === existingIdx
          ? {
              ...it,
              qty: it.qty + input.qty,
              warehouseQty: input.warehouseQty ?? it.warehouseQty,
            }
          : it,
      );
    } else {
      nextItems = [...this.state.items, { ...input, addedAt: Date.now() }];
    }
    this.state = { items: nextItems };
    this.writeToStorage();
    this.notify();
  }

  setQty(key: string, qty: number) {
    if (qty <= 0) {
      this.remove(key);
      return;
    }
    this.state = {
      items: this.state.items.map((i) =>
        bagLineKey(i) === key ? { ...i, qty } : i,
      ),
    };
    this.writeToStorage();
    this.notify();
  }

  remove(key: string) {
    this.state = {
      items: this.state.items.filter((i) => bagLineKey(i) !== key),
    };
    this.writeToStorage();
    this.notify();
  }

  removeMany(keys: string[]) {
    if (keys.length === 0) return;
    const set = new Set(keys);
    this.state = {
      items: this.state.items.filter((i) => !set.has(bagLineKey(i))),
    };
    this.writeToStorage();
    this.notify();
  }

  clear() {
    this.state = { items: [] };
    this.writeToStorage();
    this.notify();
  }
}

// Singleton compartido por toda la app — un solo bolso por pestaña.
const store = new BagStore();

const EMPTY_SNAPSHOT: BagState = { items: [] };

/**
 * Hook React con `useSyncExternalStore` para evitar mismatches de SSR.
 * Devuelve el estado del bolso y los handlers de mutación.
 */
export function useProductBag() {
  // Server snapshot: bolso vacío. En cliente, leemos del store real.
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );

  const add = useCallback((input: Omit<BagItem, 'addedAt'>) => {
    store.add(input);
  }, []);
  // `key` es la clave de línea (producto + bodega) — ver bagLineKey.
  const setQty = useCallback((key: string, qty: number) => {
    store.setQty(key, qty);
  }, []);
  const remove = useCallback((key: string) => {
    store.remove(key);
  }, []);
  const clear = useCallback(() => {
    store.clear();
  }, []);

  const { count, totalAmount } = useMemo(() => {
    let c = 0;
    let amt = 0;
    for (const it of snapshot.items) {
      c += it.qty;
      amt += Number(it.unitPrice) * it.qty;
    }
    return { count: c, totalAmount: amt };
  }, [snapshot.items]);

  return {
    items: snapshot.items,
    count,
    totalAmount,
    add,
    setQty,
    remove,
    clear,
  };
}

// Listener global no-React para que cualquier flujo (ej: onSuccess del form
// de cotización) limpie el bolso sin re-renderizar nada.
export function clearProductBag() {
  store.clear();
}

// Quita solo un subconjunto del bolso (ej: tras convertir en venta/cotización
// las líneas que el operador seleccionó, dejando el resto en el bolso). Recibe
// CLAVES de línea (producto + bodega) — ver bagLineKey.
export function clearProductBagItems(keys: string[]) {
  store.removeMany(keys);
}

/**
 * Hook auxiliar para componentes que solo necesitan saber si hay items
 * (sin reaccionar al detalle). Cero costo en re-renders cuando cambian
 * las cantidades pero el "hay items o no" sigue igual.
 */
export function useProductBagCount(): number {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );
  // Memo para no recalcular si los items son los mismos.
  return useMemo(
    () => snapshot.items.reduce((acc, i) => acc + i.qty, 0),
    [snapshot.items],
  );
}

// Por compatibilidad con módulos que no quieren importar useMemo.
export type { BagState };
