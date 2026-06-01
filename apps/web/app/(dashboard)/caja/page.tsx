'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpToLine, Download, Sparkles, Wallet } from 'lucide-react';
import { useState } from 'react';
import { OpeningBalanceDialog } from '@/components/forms/opening-balance-form';
import { apiAbsoluteUrl } from '@/lib/api';
import { getCashboxBalance, listCashTransactions, listExpenseCategories } from '@/lib/cashbox-api';
import { formatCurrency } from '@/lib/format';
import { useUrlFilters } from '@/lib/use-url-filters';
import type {
  CashTransactionSourceDto,
  CashTransactionTypeDto,
  PaymentMethodDto,
} from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 50;

const METHOD_LABEL: Record<PaymentMethodDto, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

const SOURCE_LABEL: Record<CashTransactionSourceDto, string> = {
  SALE: 'Venta',
  PURCHASE: 'Compra',
  MANUAL: 'Manual',
  SALE_RETURN: 'Devolución venta',
  PURCHASE_RETURN: 'Devolución compra',
  OPENING: 'Capital inicial',
};

const FIELD =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white';
const BTN_OUTLINE =
  'inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900';

/**
 * /caja — Rediseño UI (look de la web). SOLO UI/UX. Lógica idéntica:
 * balance global, listCashTransactions paginado con filtros, export Excel,
 * OpeningBalanceDialog (capitales iniciales).
 */
export default function CajaPage() {
  const { values, setFilter, clear } = useUrlFilters({
    type: '',
    source: '',
    method: '',
    category: '',
    dateFrom: '',
    dateTo: '',
    voided: '',
    page: '',
  });
  const type = values.type || ALL;
  const source = values.source || ALL;
  const methodVal = values.method || ALL;
  const category = values.category || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const includeVoided = values.voided === '1';
  const page = Number(values.page || '1');

  const filtersActive =
    type !== ALL ||
    source !== ALL ||
    methodVal !== ALL ||
    category !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    includeVoided;

  const [openingDialogOpen, setOpeningDialogOpen] = useState(false);

  const balance = useQuery({ queryKey: ['cashbox-balance'], queryFn: getCashboxBalance });
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => listExpenseCategories() });

  const txs = useQuery({
    queryKey: ['cash-transactions', { type, source, methodVal, category, dateFrom, dateTo, includeVoided, page }],
    queryFn: () =>
      listCashTransactions({
        type: type === ALL ? undefined : (type as CashTransactionTypeDto),
        source: source === ALL ? undefined : (source as CashTransactionSourceDto),
        paymentMethod: methodVal === ALL ? undefined : (methodVal as PaymentMethodDto),
        expenseCategoryId: category === ALL ? undefined : category,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        includeVoided,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = txs.data?.items ?? [];
  const total = txs.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const periodIncome = items.filter((t) => !t.isVoided && t.type === 'INCOME').reduce((acc, t) => acc + Number(t.amount), 0);
  const periodExpense = items.filter((t) => !t.isVoided && t.type === 'EXPENSE').reduce((acc, t) => acc + Number(t.amount), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Libro de caja
        </h1>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button onClick={() => setOpeningDialogOpen(true)} className={BTN_OUTLINE}>
            <Sparkles className="h-4 w-4 text-[#2F6BFF]" />
            Capitales iniciales
          </button>
          <a
            href={apiAbsoluteUrl(
              `cashbox/transactions.xlsx${buildCajaExportQuery({
                type: type === ALL ? undefined : type,
                source: source === ALL ? undefined : source,
                paymentMethod: methodVal === ALL ? undefined : methodVal,
                expenseCategoryId: category === ALL ? undefined : category,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                includeVoided: includeVoided ? '1' : undefined,
              })}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className={BTN_OUTLINE}
          >
            <Download className="h-4 w-4 text-slate-400" />
            Exportar Excel
          </a>
        </div>
      </div>

      {/* BALANCE */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BalanceCard label="Saldo total" icon={<Wallet className="h-3.5 w-3.5" />} value={balance.data?.total ?? '0.00'} isLoading={balance.isLoading} accent />
        <BalanceCard label="Efectivo" value={balance.data?.byMethod.CASH ?? '0.00'} isLoading={balance.isLoading} />
        <BalanceCard label="Transferencia" value={balance.data?.byMethod.TRANSFER ?? '0.00'} isLoading={balance.isLoading} />
        <BalanceCard label="Tarjeta" value={balance.data?.byMethod.CARD ?? '0.00'} isLoading={balance.isLoading} />
      </div>

      {/* FILTROS */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <select value={type} onChange={(e) => { setFilter('type', e.target.value === ALL ? null : e.target.value); setFilter('page', null); }} className={FIELD}>
            <option value={ALL}>Todos los tipos</option>
            <option value="INCOME">Ingreso</option>
            <option value="EXPENSE">Egreso</option>
          </select>
          <select value={source} onChange={(e) => { setFilter('source', e.target.value === ALL ? null : e.target.value); setFilter('page', null); }} className={FIELD}>
            <option value={ALL}>Todos los orígenes</option>
            <option value="SALE">Venta</option>
            <option value="PURCHASE">Compra</option>
            <option value="MANUAL">Manual (gasto/ingreso)</option>
            <option value="OPENING">Capital inicial</option>
          </select>
          <select value={methodVal} onChange={(e) => { setFilter('method', e.target.value === ALL ? null : e.target.value); setFilter('page', null); }} className={FIELD}>
            <option value={ALL}>Todos los métodos</option>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
          </select>
          <select value={category} onChange={(e) => { setFilter('category', e.target.value === ALL ? null : e.target.value); setFilter('page', null); }} className={FIELD}>
            <option value={ALL}>Todas las categorías</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setFilter('dateFrom', e.target.value || null); setFilter('page', null); }} className={FIELD} />
          <input type="date" value={dateTo} onChange={(e) => { setFilter('dateTo', e.target.value || null); setFilter('page', null); }} className={FIELD} />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={includeVoided}
              onChange={(e) => { setFilter('voided', e.target.checked ? '1' : null); setFilter('page', null); }}
              className="h-4 w-4 rounded border-slate-300 accent-[#2F6BFF] dark:border-slate-700"
            />
            Incluir anuladas
          </label>
          {filtersActive && (
            <button onClick={clear} className="cursor-pointer rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* TABLA */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Fecha</th>
                <th className="py-4">Tipo</th>
                <th className="py-4">Origen</th>
                <th className="py-4">Categoría</th>
                <th className="py-4">Descripción</th>
                <th className="py-4">Método</th>
                <th className="py-4 pr-6 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {txs.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-6 py-5"><div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></td></tr>
                ))}

              {!txs.isLoading && items.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center font-bold text-slate-400">Sin movimientos en el período.</td></tr>
              )}

              {items.map((t) => (
                <tr key={t.id} className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10 ${t.isVoided ? 'opacity-50 line-through' : ''}`}>
                  <td className="py-4 pl-6 font-mono text-slate-500 dark:text-slate-400">
                    {new Date(t.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                  </td>
                  <td className="py-4">
                    {t.source === 'OPENING' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#2F6BFF]/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#2F6BFF]">
                        <Sparkles className="h-3 w-3" /> Capital inicial
                      </span>
                    ) : t.type === 'INCOME' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400">
                        <ArrowUpToLine className="h-3 w-3" /> Ingreso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
                        <ArrowDownToLine className="h-3 w-3" /> Egreso
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-slate-500 dark:text-slate-400">{SOURCE_LABEL[t.source]}</td>
                  <td className="py-4 text-slate-500 dark:text-slate-400">{t.expenseCategory?.name ?? '—'}</td>
                  <td className="max-w-[280px] truncate py-4 font-medium text-slate-700 dark:text-slate-300">{t.description ?? '—'}</td>
                  <td className="py-4 text-slate-500 dark:text-slate-400">{METHOD_LABEL[t.paymentMethod]}</td>
                  <td className={`py-4 pr-6 text-right font-mono text-[13px] font-black tabular-nums ${t.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                    {t.type === 'INCOME' ? '+' : '−'}
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINACIÓN */}
      <div className="flex flex-col gap-2 text-xs font-medium text-slate-400 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {total} movimiento{total === 1 ? '' : 's'}
          {total > 0 ? ` · página ${page} de ${totalPages}` : ''}
          {' · '}
          <span className="font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(periodIncome.toFixed(2))}</span>
          {' / '}
          <span className="font-bold text-rose-500 dark:text-rose-400">−{formatCurrency(periodExpense.toFixed(2))}</span>{' '}
          (página actual)
        </span>
        {total > 0 && (
          <div className="flex gap-2">
            <button onClick={() => setFilter('page', String(Math.max(1, page - 1)))} disabled={page === 1} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900">Anterior</button>
            <button onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))} disabled={page >= totalPages} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900">Siguiente</button>
          </div>
        )}
      </div>

      <OpeningBalanceDialog open={openingDialogOpen} onClose={() => setOpeningDialogOpen(false)} />
    </div>
  );
}

function BalanceCard({
  label,
  icon,
  value,
  isLoading,
  accent,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  isLoading?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="select-none space-y-1.5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      {isLoading ? (
        <div className="h-7 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div className={`text-[22px] font-black tracking-tight tabular-nums ${accent ? 'text-[#2F6BFF]' : 'text-slate-900 dark:text-white'}`}>
          {formatCurrency(value)}
        </div>
      )}
    </div>
  );
}

function buildCajaExportQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
