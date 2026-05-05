export const InventoryMovementType = {
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  ADJUSTMENT: 'ADJUSTMENT',
  RETURN_IN: 'RETURN_IN',
  RETURN_OUT: 'RETURN_OUT',
} as const;
export type InventoryMovementType =
  (typeof InventoryMovementType)[keyof typeof InventoryMovementType];

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
