export const InventoryMovementType = {
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  RETURN_IN: 'RETURN_IN',
  RETURN_OUT: 'RETURN_OUT',
  // Fase 7.5 — transferencias entre bodegas. No tocan caja.
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
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
  CARD: 'CARD',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

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

export const UserRole = {
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

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
