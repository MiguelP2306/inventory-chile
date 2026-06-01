'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, Paperclip, Pencil, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ExpenseFormDialog } from '@/components/forms/expense-form';
import { apiAbsoluteUrl } from '@/lib/api';
import { listExpenseCategories, listExpenses, publicDocumentUrl, voidExpense } from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { ExpenseDto, PaymentMethodDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const METHOD_LABELS: Record<PaymentMethodDto, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

const FIELD =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-700 transition-all focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white';

export default function GastosPage() {
  const qc = useQueryClient();
  const filters = useUrlFilters({ category: '', method: '', dateFrom: '', dateTo: '', q: '', voided: '', page: '' });
  const { values, setFilter, clear } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const category = values.category || ALL;
  const method = values.method || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const q = values.q ?? '';
  const includeVoided = values.voided === '1';
  const page = Number(values.page || '1');

  const filtersActive =
    category !== ALL || method !== ALL || dateFrom !== '' || dateTo !== '' || q !== '' || includeVoided;

  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => listExpenseCategories() });

  const list = useQuery({
    queryKey: ['expenses', { category, method, dateFrom, dateTo, q, includeVoided, page }],
    queryFn: () =>
      listExpenses({
        categoryId: category === ALL ? undefined : category,
        paymentMethod: method === ALL ? undefined : (method as PaymentMethodDto),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        q: q || undefined,
        includeVoided,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const periodTotal = useMemo(
    () => items.filter((e) => !e.voidedAt).reduce((acc, e) => acc + Number(e.amount), 0),
    [items],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  const [voidTarget, setVoidTarget] = useState<ExpenseDto | null>(null);

  const voidMut = useMutation({
    mutationFn: (id: string) => voidExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      toast.success('Gasto anulado');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo anular')),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Gastos</h1>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <a
            href={apiAbsoluteUrl(
              `expenses/export.xlsx${buildGastosExportQuery({
                categoryId: category === ALL ? undefined : category,
                paymentMethod: method === ALL ? undefined : method,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                q: q || undefined,
                includeVoided: includeVoided ? '1' : undefined,
              })}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Download className="h-4 w-4 text-slate-400" />
            Exportar Excel
          </a>
          <button
            onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90"
          >
            <Plus className="h-4 w-4" />
            Nuevo gasto
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search.value}
              onChange={(e) => search.setValue(e.target.value)}
              placeholder="Buscar descripción o N°…"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-medium text-slate-700 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
            />
          </div>
          <select value={category} onChange={(e) => { setFilter('category', e.target.value === ALL ? null : e.target.value); setFilter('page', null); }} className={FIELD}>
            <option value={ALL}>Todas las categorías</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={method} onChange={(e) => { setFilter('method', e.target.value === ALL ? null : e.target.value); setFilter('page', null); }} className={FIELD}>
            <option value={ALL}>Todos los métodos</option>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => { setFilter('dateFrom', e.target.value || null); setFilter('page', null); }} className={FIELD} />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={includeVoided}
              onChange={(e) => { setFilter('voided', e.target.checked ? '1' : null); setFilter('page', null); }}
              className="h-4 w-4 rounded border-slate-300 accent-[#2F6BFF] dark:border-slate-700"
            />
            Incluir anulados
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
                <th className="py-4 pl-6">N°</th>
                <th className="py-4">Fecha</th>
                <th className="py-4">Categoría</th>
                <th className="py-4">Descripción</th>
                <th className="py-4">Método</th>
                <th className="py-4 text-right">Monto</th>
                <th className="py-4 text-center">Comp.</th>
                <th className="w-[100px] py-4 pr-6 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {list.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-6 py-5"><div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></td></tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center font-bold text-slate-400">Sin gastos en el período.</td></tr>
              )}

              {items.map((e) => {
                const voided = !!e.voidedAt;
                const url = publicDocumentUrl(e.receiptUrl);
                return (
                  <tr key={e.id} className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10 ${voided ? 'opacity-55' : ''}`}>
                    <td className="py-5 pl-6 font-mono font-bold text-slate-900 dark:text-white">{e.number}</td>
                    <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                      {new Date(e.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                    </td>
                    <td className="py-5 font-medium text-slate-600 dark:text-slate-400">{e.category?.name ?? '—'}</td>
                    <td className="max-w-[260px] truncate py-5 font-bold text-slate-950 dark:text-white">{e.description}</td>
                    <td className="py-5 font-medium text-slate-500 dark:text-slate-400">{METHOD_LABELS[e.paymentMethod]}</td>
                    <td className="py-5 text-right font-mono text-[13px] font-black tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(e.amount)}
                    </td>
                    <td className="py-5 text-center">
                      {voided ? (
                        <span className="inline-flex items-center rounded-lg bg-rose-50 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-rose-500 dark:bg-rose-950/20 dark:text-rose-400">
                          Anulado
                        </span>
                      ) : url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" title="Ver comprobante" className="inline-flex text-slate-400 transition-colors hover:text-[#2F6BFF]">
                          <Paperclip className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="font-mono text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-5 pr-6 text-right">
                      {!voided && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditing(e); setDialogOpen(true); }}
                            title="Editar"
                            className="cursor-pointer p-2 text-slate-400 transition-colors hover:text-[#2F6BFF]"
                          >
                            <Pencil className="h-[17px] w-[17px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setVoidTarget(e)}
                            title="Anular"
                            className="cursor-pointer p-2 text-slate-400 transition-colors hover:text-rose-500"
                          >
                            <Ban className="h-[17px] w-[17px]" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINACIÓN */}
      <div className="flex flex-col gap-2 text-xs font-medium text-slate-400 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {total} gasto{total === 1 ? '' : 's'}
          {total > 0 ? ` · página ${page} de ${totalPages}` : ''}
          {' · '}Total página (no anulados):{' '}
          <span className="font-black tabular-nums text-slate-700 dark:text-slate-200">{formatCurrency(periodTotal.toFixed(2))}</span>
        </span>
        {total > 0 && (
          <div className="flex gap-2">
            <button onClick={() => setFilter('page', String(Math.max(1, page - 1)))} disabled={page === 1} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900">Anterior</button>
            <button onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))} disabled={page >= totalPages} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900">Siguiente</button>
          </div>
        )}
      </div>

      <ExpenseFormDialog open={dialogOpen} expense={editing} onClose={() => setDialogOpen(false)} />

      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title="¿Anular gasto?"
        description={
          voidTarget ? (
            <>
              El gasto <strong>{voidTarget.number}</strong> se marcará como anulado y se generará una
              transacción de compensación en caja (ingreso por el mismo monto).
            </>
          ) : null
        }
        confirmLabel="Anular"
        variant="destructive"
        onConfirm={async () => {
          if (voidTarget) await voidMut.mutateAsync(voidTarget.id);
        }}
      />
    </div>
  );
}

function buildGastosExportQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '') as [string, string][];
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
