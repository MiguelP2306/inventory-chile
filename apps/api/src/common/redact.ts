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
 *
 * Siempre agrega `hasCost`: el vendedor no puede ver el monto, pero la UI sí
 * necesita saber que el producto no tiene costo cargado para avisarle que no
 * se puede vender hasta corregirlo (la venta se rechaza en el backend).
 */
export function redactProductCost<
  T extends { cost?: string | null; isService?: boolean },
>(product: T, viewer: Viewer): T & { hasCost: boolean } {
  // Los servicios (flete, mano de obra) no son inventario y legítimamente no
  // tienen costo: cuentan como "con costo" para no bloquear su venta.
  const hasCost = !!product.isService || Number(product.cost ?? 0) > 0;
  if (viewerCan(viewer, Permission.PRODUCT_VIEW_COST)) {
    return { ...product, hasCost };
  }
  return { ...product, cost: null, hasCost };
}

/**
 * Misma idea pero sobre listados — no rompe el shape del array y mantiene
 * el orden original. Apto para usar en `list()` que devuelve `{ items, total }`
 * o array plano.
 */
export function redactProductCostList<
  T extends { cost?: string | null; isService?: boolean },
>(items: T[], viewer: Viewer): Array<T & { hasCost: boolean }> {
  return items.map((i) => redactProductCost(i, viewer));
}

/**
 * Redacta el desglose financiero de una venta cuando el viewer no tiene
 * `SALE_VIEW_FINANCIAL_BREAKDOWN`. Setea a null comisión, subtotal e IVA —
 * el USER solo ve el total final.
 *
 * `paymentMethod` NO se redacta: es dato operativo (el vendedor es quien
 * cobra y lo registra al crear la venta), no parte del margen.
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
    subtotal: null,
    taxAmount: null,
  }));
}

export function viewerHas(viewer: Viewer, perm: Permission): boolean {
  return viewerCan(viewer, perm);
}
