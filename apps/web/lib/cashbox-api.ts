// Helpers tipados sobre axios para Caja, Gastos, Categorías de gasto y Settings.

import type {
  CashTransactionDto,
  CashboxBalanceDto,
  CashTransactionSourceDto,
  CashTransactionTypeDto,
  CompanySettingsDto,
  ExpenseCategoryDto,
  ExpenseDto,
  PaginatedResult,
  PaymentMethodDto,
} from '@inventory/shared';
import { api } from './api';

// ---------- Cashbox (libro de caja) ----------

export interface ListCashTransactionsParams {
  type?: CashTransactionTypeDto;
  source?: CashTransactionSourceDto;
  paymentMethod?: PaymentMethodDto;
  expenseCategoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  includeVoided?: boolean;
  page?: number;
  pageSize?: number;
}

export const listCashTransactions = (params: ListCashTransactionsParams = {}) =>
  api
    .get<PaginatedResult<CashTransactionDto>>('/cashbox/transactions', { params })
    .then((r) => r.data);

export const getCashboxBalance = () =>
  api.get<CashboxBalanceDto>('/cashbox/balance').then((r) => r.data);

// ---------- Capital inicial (Fase 12 — múltiples) ----------

export interface OpeningBalanceListResponse {
  transactions: CashTransactionDto[];
}

export interface OpeningBalanceInput {
  amount: string;
  paymentMethod: PaymentMethodDto;
  date?: string;
}

export const listOpeningBalances = () =>
  api
    .get<OpeningBalanceListResponse>('/cashbox/opening-balance')
    .then((r) => r.data);

export const createOpeningBalance = (input: OpeningBalanceInput) =>
  api
    .post<CashTransactionDto>('/cashbox/opening-balance', input)
    .then((r) => r.data);

export const updateOpeningBalance = (id: string, input: OpeningBalanceInput) =>
  api
    .patch<CashTransactionDto>(`/cashbox/opening-balance/${id}`, input)
    .then((r) => r.data);

export const deleteOpeningBalance = (id: string) =>
  api
    .delete<{ deleted: boolean }>(`/cashbox/opening-balance/${id}`)
    .then((r) => r.data);

// ---------- Expense categories ----------

export const listExpenseCategories = (q?: string) =>
  api
    .get<ExpenseCategoryDto[]>('/expense-categories', { params: q ? { q } : {} })
    .then((r) => r.data);

export interface CreateExpenseCategoryInput {
  name: string;
}

export const createExpenseCategory = (input: CreateExpenseCategoryInput) =>
  api.post<ExpenseCategoryDto>('/expense-categories', input).then((r) => r.data);

export const updateExpenseCategory = (
  id: string,
  input: Partial<CreateExpenseCategoryInput>,
) => api.patch<ExpenseCategoryDto>(`/expense-categories/${id}`, input).then((r) => r.data);

export const deleteExpenseCategory = (id: string) =>
  api.delete(`/expense-categories/${id}`).then((r) => r.data);

// ---------- Expenses ----------

export interface ListExpensesParams {
  categoryId?: string;
  paymentMethod?: PaymentMethodDto;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  includeVoided?: boolean;
  page?: number;
  pageSize?: number;
}

export const listExpenses = (params: ListExpensesParams = {}) =>
  api
    .get<PaginatedResult<ExpenseDto>>('/expenses', { params })
    .then((r) => r.data);

export const getExpense = (id: string) =>
  api.get<ExpenseDto>(`/expenses/${id}`).then((r) => r.data);

export interface ExpenseInput {
  date: string; // ISO string
  categoryId: string;
  amount: string;
  paymentMethod: PaymentMethodDto;
  description: string;
  receiptUrl?: string | null;
}

export const createExpense = (input: ExpenseInput) =>
  api.post<ExpenseDto>('/expenses', input).then((r) => r.data);

export const updateExpense = (id: string, input: Partial<ExpenseInput>) =>
  api.patch<ExpenseDto>(`/expenses/${id}`, input).then((r) => r.data);

export const voidExpense = (id: string) =>
  api.post<ExpenseDto>(`/expenses/${id}/void`).then((r) => r.data);

// ---------- Uploads (purchase invoice / expense receipt) ----------

export interface UploadResultDto {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export const uploadPurchaseInvoice = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api
    .post<UploadResultDto>('/uploads/purchase-invoice', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const uploadExpenseReceipt = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api
    .post<UploadResultDto>('/uploads/expense-receipt', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

// La API devuelve URLs relativas tipo `/uploads/<subdir>/<file>`. Para
// renderizarlas o descargarlas, prependemos la URL pública del API.
export function publicDocumentUrl(relativeUrl: string | null | undefined): string | null {
  if (!relativeUrl) return null;
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  return `${base}${relativeUrl}`;
}

// ---------- Settings ----------

export const getCompanySettings = () =>
  api.get<CompanySettingsDto>('/settings/company').then((r) => r.data);

export interface UpdateCompanySettingsInput {
  name?: string;
  // Encabezado/pie del documento de cotización.
  legalName?: string | null;
  businessActivity?: string | null;
  bankDetails?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
  currency?: string;
  quotationFooter?: string | null;
  defaultValidityDays?: number;
  taxRate?: string;
  // Ronda 9 — `cardCommissionRate` queda como legacy (ya no se edita desde
  // la UI). Las comisiones reales viven en los 3 campos desdoblados.
  cardCommissionRate?: string;
  cardDebitCommissionRate?: string;
  cardCreditCommissionRate?: string;
  paymentLinkCommissionRate?: string;
  defaultLeadTimeDays?: number;
  // Fase 8.5
  followUpHoursDefault?: number;
  hubspotEnabled?: boolean;
  hubspotDefaultOwnerId?: string | null;
  whatsappFollowUpTemplate?: string | null;
}

export const updateCompanySettings = (input: UpdateCompanySettingsInput) =>
  api.patch<CompanySettingsDto>('/settings/company', input).then((r) => r.data);
