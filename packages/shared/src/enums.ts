export const InventoryMovementType = {
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  RETURN_IN: 'RETURN_IN',
  RETURN_OUT: 'RETURN_OUT',
  // Fase 7.5 — transferencias entre bodegas. No tocan caja.
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  // Ronda 7 — devolución cuyo producto está dañado. El item NO vuelve al
  // stock vendible (es una pérdida del negocio), pero el evento queda
  // registrado en el historial para auditoría. `qty` se guarda como
  // referencia informativa (cantidad reportada por el cliente). La tabla
  // `stocks` NO se modifica para este tipo.
  RETURN_IN_DAMAGED: 'RETURN_IN_DAMAGED',
  // Ronda 8 — auditoría de guía de despacho. El stock real ya bajó con el
  // `SALE_OUT` al confirmar la venta; estos tipos sólo dejan rastro en
  // /inventario/movimientos para trazabilidad del despacho físico y su
  // eventual anulación. La tabla `stocks` NO se modifica.
  DISPATCH_OUT: 'DISPATCH_OUT',
  DISPATCH_VOIDED: 'DISPATCH_VOIDED',
  // Ronda 8 — cancelación de una devolución cuyo item era DAMAGED. El
  // original tampoco tocó `stocks` (RETURN_IN_DAMAGED es audit-only), así
  // que la cancelación queda como evento informativo para que el historial
  // refleje el cambio de estado.
  RETURN_DAMAGED_CANCELLED: 'RETURN_DAMAGED_CANCELLED',
} as const;
export type InventoryMovementType =
  (typeof InventoryMovementType)[keyof typeof InventoryMovementType];

export const TransferStatus = {
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];

export const QuotationStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONVERTED: 'CONVERTED',
  EXPIRED: 'EXPIRED',
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const SaleStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  TRANSFER: 'TRANSFER',
  // Ronda 9 — desdoblamiento del antiguo `CARD`. Cada subtipo tiene su
  // propia comisión configurable en `CompanySettings`. Las ventas
  // históricas con `CARD` se migran a `CARD_CREDIT` (más conservador).
  CARD_DEBIT: 'CARD_DEBIT',
  CARD_CREDIT: 'CARD_CREDIT',
  PAYMENT_LINK: 'PAYMENT_LINK',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Métodos de pago que pagan comisión (tarjeta + link). Útil para form/reportes. */
export const PAYMENT_METHODS_WITH_COMMISSION: PaymentMethod[] = [
  PaymentMethod.CARD_DEBIT,
  PaymentMethod.CARD_CREDIT,
  PaymentMethod.PAYMENT_LINK,
];

export const CashTransactionType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
} as const;
export type CashTransactionType =
  (typeof CashTransactionType)[keyof typeof CashTransactionType];

export const CashTransactionSource = {
  SALE: 'SALE',
  PURCHASE: 'PURCHASE',
  MANUAL: 'MANUAL',
  // Fase 7.6 — reembolsos por devoluciones (no son cancelaciones de la venta/compra
  // original, sino devoluciones parciales o totales con su propio registro de caja).
  SALE_RETURN: 'SALE_RETURN',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  // Fase 12 — capital inicial. Una sola transacción de tipo INCOME que se
  // registra antes de cualquier otro movimiento para reflejar el saldo de
  // arranque de la empresa. Solo es editable mientras no haya otros
  // movimientos (ventas, compras, gastos manuales, etc.).
  OPENING: 'OPENING',
} as const;
export type CashTransactionSource =
  (typeof CashTransactionSource)[keyof typeof CashTransactionSource];

export const ReturnType = {
  CUSTOMER: 'CUSTOMER',
  SUPPLIER: 'SUPPLIER',
} as const;
export type ReturnType = (typeof ReturnType)[keyof typeof ReturnType];

export const ReturnStatus = {
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReturnStatus = (typeof ReturnStatus)[keyof typeof ReturnStatus];

// Estado del producto devuelto. RESELLABLE emite movimiento de stock;
// DAMAGED no (queda como pérdida del negocio sin restock).
export const ReturnItemCondition = {
  RESELLABLE: 'RESELLABLE',
  DAMAGED: 'DAMAGED',
} as const;
export type ReturnItemCondition =
  (typeof ReturnItemCondition)[keyof typeof ReturnItemCondition];

// Ronda 9 — modo de reembolso de una devolución.
//  - MONEY: el cliente/proveedor recibe el dinero (default histórico).
//  - CREDIT: solo aplica a devoluciones a proveedor → genera un
//    `SupplierCredit` que se aplica como descuento en compras futuras.
//  - EXCHANGE: solo aplica a devoluciones de cliente → el operador carga
//    items de reemplazo en `return_replacement_items`. Si la diferencia
//    bruta es positiva el cliente paga, si es negativa el sistema le
//    reembolsa la diferencia.
export const RefundMode = {
  MONEY: 'MONEY',
  CREDIT: 'CREDIT',
  EXCHANGE: 'EXCHANGE',
} as const;
export type RefundMode = (typeof RefundMode)[keyof typeof RefundMode];

// Estado de un saldo a favor con un proveedor.
//  - ACTIVE: tiene balance disponible para aplicar.
//  - SPENT: balance llegó a 0 — totalmente aplicado.
//  - VOIDED: anulado manualmente (ej. cuando la devolución original se
//    cancela y todavía no se había usado).
export const SupplierCreditStatus = {
  ACTIVE: 'ACTIVE',
  SPENT: 'SPENT',
  VOIDED: 'VOIDED',
} as const;
export type SupplierCreditStatus =
  (typeof SupplierCreditStatus)[keyof typeof SupplierCreditStatus];

export const WarrantyStatus = {
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RESOLVED: 'RESOLVED',
} as const;
export type WarrantyStatus =
  (typeof WarrantyStatus)[keyof typeof WarrantyStatus];

// Estado de la guía de despacho. Una venta puede tener varias guías a lo
// largo del tiempo (si la primera tuvo error y se regeneró) pero solo UNA
// activa simultáneamente. Las anuladas se preservan para auditoría.
export const DispatchStatus = {
  ACTIVE: 'ACTIVE',
  VOIDED: 'VOIDED',
} as const;
export type DispatchStatus =
  (typeof DispatchStatus)[keyof typeof DispatchStatus];

// Origen de la guía de despacho:
//  - SALE: nace desde una venta ya existente (flujo histórico). Los items y
//    el cliente se leen prestados de la venta origen.
//  - INDEPENDENT: se crea de cero, sin venta previa (guía primero, venta
//    después). Lleva su propio cliente y sus propios items (producto + cantidad,
//    sin precios). El stock NO se mueve hasta que la guía se convierte en venta.
export const DispatchOrigin = {
  SALE: 'SALE',
  INDEPENDENT: 'INDEPENDENT',
} as const;
export type DispatchOrigin =
  (typeof DispatchOrigin)[keyof typeof DispatchOrigin];

export const UserRole = {
  ADMIN: 'ADMIN',
  // USER = vendedor/cliente. Mismo acceso de navegación que ADMIN pero con
  // los datos financieros sensibles (costo, margen, comisión por método
  // de pago) filtrados tanto en backend como en la UI.
  USER: 'USER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Permisos finos. Por ahora solo derivados del rol, pero la capa de
// permisos queda separada para que en el futuro un USER puntual pueda
// recibir un permiso extra (o un ADMIN restringirse) sin tocar UI.
export const Permission = {
  PRODUCT_VIEW_COST: 'PRODUCT_VIEW_COST',
  SALE_VIEW_FINANCIAL_BREAKDOWN: 'SALE_VIEW_FINANCIAL_BREAKDOWN',
  USER_MANAGE: 'USER_MANAGE',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    Permission.PRODUCT_VIEW_COST,
    Permission.SALE_VIEW_FINANCIAL_BREAKDOWN,
    Permission.USER_MANAGE,
  ],
  USER: [],
};

export function roleHasPermission(role: UserRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

// Producto: original o alternativo (Fase 4B). El cliente lo usa para
// distinguir repuestos OEM vs equivalentes/alternativos del mercado.
export const ProductKind = {
  ORIGINAL: 'ORIGINAL',
  ALTERNATIVE: 'ALTERNATIVE',
} as const;
export type ProductKind = (typeof ProductKind)[keyof typeof ProductKind];

// Tipos de código adicional en `product_codes` (Fase 4B).
// Por ahora solo se usa COMPATIBLE — el universal vive en `products.universalCode`
// como columna directa. Dejamos el enum para que sea fácil sumar tipos sin
// cambiar el schema.
export const ProductCodeKind = {
  COMPATIBLE: 'COMPATIBLE',
} as const;
export type ProductCodeKind =
  (typeof ProductCodeKind)[keyof typeof ProductCodeKind];

// ---------- Fase 8.5 — Lead lifecycle + HubSpot ----------

// Canal por el que llegó el cliente (Fase 8.5). Informativo, no afecta lógica.
export const CustomerSource = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  IN_PERSON: 'IN_PERSON',
  OTHER: 'OTHER',
} as const;
export type CustomerSource =
  (typeof CustomerSource)[keyof typeof CustomerSource];

// Estado comercial del cliente. Se calcula automáticamente a partir de
// eventos del sistema (crear cotización → QUOTED, confirmar venta → WON,
// cron de timeout → FOLLOW_UP). Solo LOST se setea manualmente.
export const LifecycleStatus = {
  NEW: 'NEW',
  QUOTED: 'QUOTED',
  FOLLOW_UP: 'FOLLOW_UP',
  WON: 'WON',
  LOST: 'LOST',
} as const;
export type LifecycleStatus =
  (typeof LifecycleStatus)[keyof typeof LifecycleStatus];

// Tipo de evento en `lead_events`. Bitácora — no es la fuente de verdad
// del estado actual (esa es `Customer.lifecycleStatus`).
export const LeadEventType = {
  QUOTATION_CREATED: 'QUOTATION_CREATED',
  QUOTATION_SENT: 'QUOTATION_SENT',
  SALE_CONFIRMED: 'SALE_CONFIRMED',
  LOST_MARKED: 'LOST_MARKED',
  FOLLOW_UP_TRIGGERED: 'FOLLOW_UP_TRIGGERED',
  MANUAL_CONTACT: 'MANUAL_CONTACT',
} as const;
export type LeadEventType =
  (typeof LeadEventType)[keyof typeof LeadEventType];

// Estado de cada job en la outbox `hubspot_sync_jobs`. PENDING → PROCESSING
// → DONE (ok) / FAILED (3 attempts fallidos) / SKIPPED (hubspotEnabled=off).
export const HubspotSyncJobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type HubspotSyncJobStatus =
  (typeof HubspotSyncJobStatus)[keyof typeof HubspotSyncJobStatus];
