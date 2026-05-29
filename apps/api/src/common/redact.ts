import {
  Permission,
  roleHasPermission,
  type UserRole,
} from '@inventory/shared';
import type { JwtPayload } from '../auth/types';

/**
 * Helpers de "redacción" de campos sensibles según el rol del viewer.
 *
 * Filosofía: defense in depth. El backend responde sin los campos que el
 * frontend no debería mostrar, así un USER que abra DevTools no ve costos
 * o comisiones por casualidad. El frontend también esconde la UI, pero el
 * backend es la fuente de verdad de los permisos.
 */

export type Viewer = JwtPayload | { role: UserRole } | undefined;

function viewerRole(v: Viewer): UserRole | undefined {
  return v?.role;
}

function viewerCan(v: Viewer, perm: Permission): boolean {
  const role = viewerRole(v);
  if (!role) return false;
  return roleHasPermission(role, perm);
}

/**
 * Redacta `cost` (y derivados) de un producto cuando el viewer no tiene
 * `PRODUCT_VIEW_COST`. No muta la entrada — devuelve una copia.
 */
export function redactProductCost<T extends { cost?: string | null }>(
  product: T,
  viewer: Viewer,
): T {
  if (viewerCan(viewer, Permission.PRODUCT_VIEW_COST)) return product;
  return { ...product, cost: null };
}

/**
 * Misma idea pero sobre listados — no rompe el shape del array y mantiene
 * el orden original. Apto para usar en `list()` que devuelve `{ items, total }`
 * o array plano.
 */
export function redactProductCostList<T extends { cost?: string | null }>(
  items: T[],
  viewer: Viewer,
): T[] {
  if (viewerCan(viewer, Permission.PRODUCT_VIEW_COST)) return items;
  return items.map((i) => ({ ...i, cost: null }));
}

/**
 * Redacta el desglose financiero de una venta cuando el viewer no tiene
 * `SALE_VIEW_FINANCIAL_BREAKDOWN`. Setea a null los campos de comisión y
 * método de pago — el USER solo ve el total final.
 */
export function redactSaleBreakdown<
  T extends {
    commissionAmount?: string | null;
    paymentMethod?: unknown;
    subtotal?: string | null;
    taxAmount?: string | null;
  },
>(sale: T, viewer: Viewer): T {
  if (viewerCan(viewer, Permission.SALE_VIEW_FINANCIAL_BREAKDOWN)) return sale;
  return {
    ...sale,
    commissionAmount: null,
    paymentMethod: null,
    subtotal: null,
    taxAmount: null,
  };
}

export function redactSaleBreakdownList<
  T extends {
    commissionAmount?: string | null;
    paymentMethod?: unknown;
    subtotal?: string | null;
    taxAmount?: string | null;
  },
>(sales: T[], viewer: Viewer): T[] {
  if (viewerCan(viewer, Permission.SALE_VIEW_FINANCIAL_BREAKDOWN)) return sales;
  return sales.map((s) => ({
    ...s,
    commissionAmount: null,
    paymentMethod: null,
    subtotal: null,
    taxAmount: null,
  }));
}

export function viewerHas(viewer: Viewer, perm: Permission): boolean {
  return viewerCan(viewer, perm);
}
