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
} as const;
export type CashTransactionSource =
  (typeof CashTransactionSource)[keyof typeof CashTransactionSource];

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
