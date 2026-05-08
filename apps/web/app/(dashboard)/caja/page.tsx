'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpToLine, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getCashboxBalance,
  listCashTransactions,
  listExpenseCategories,
} from '@/lib/cashbox-api';
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
  CARD: 'Tarjeta',
};

const SOURCE_LABEL: Record<CashTransactionSourceDto, string> = {
  SALE: 'Venta',
  PURCHASE: 'Compra',
  MANUAL: 'Manual',
};

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

  const balance = useQuery({
    queryKey: ['cashbox-balance'],
    queryFn: getCashboxBalance,
  });

  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => listExpenseCategories(),
  });

  const txs = useQuery({
    queryKey: [
      'cash-transactions',
      { type, source, methodVal, category, dateFrom, dateTo, includeVoided, page },
    ],
    queryFn: () =>
      listCashTransactions({
        type: type === ALL ? undefined : (type as CashTransactionTypeDto),
        source: source === ALL ? undefined : (source as CashTransactionSourceDto),
        paymentMethod:
          methodVal === ALL ? undefined : (methodVal as PaymentMethodDto),
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

  // Totales del período visible (página actual). El saldo global vive en /balance.
  const periodIncome = items
    .filter((t) => !t.isVoided && t.type === 'INCOME')
    .reduce((acc, t) => acc + Number(t.amount), 0);
  const periodExpense = items
    .filter((t) => !t.isVoided && t.type === 'EXPENSE')
    .reduce((acc, t) => acc + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Libro de caja</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <BalanceCard
          label="Saldo total"
          icon={<Wallet className="h-4 w-4" />}
          value={balance.data?.total ?? '0.00'}
          isLoading={balance.isLoading}
        />
        <BalanceCard
          label="Efectivo"
          value={balance.data?.byMethod.CASH ?? '0.00'}
          isLoading={balance.isLoading}
        />
        <BalanceCard
          label="Transferencia"
          value={balance.data?.byMethod.TRANSFER ?? '0.00'}
          isLoading={balance.isLoading}
        />
        <BalanceCard
          label="Tarjeta"
          value={balance.data?.byMethod.CARD ?? '0.00'}
          isLoading={balance.isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        <Select
          value={type}
          onValueChange={(v) => {
            setFilter('type', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            <SelectItem value="INCOME">Ingreso</SelectItem>
            <SelectItem value="EXPENSE">Egreso</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={source}
          onValueChange={(v) => {
            setFilter('source', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Origen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los orígenes</SelectItem>
            <SelectItem value="SALE">Venta</SelectItem>
            <SelectItem value="PURCHASE">Compra</SelectItem>
            <SelectItem value="MANUAL">Manual (gasto/ingreso)</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={methodVal}
          onValueChange={(v) => {
            setFilter('method', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Método" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los métodos</SelectItem>
            <SelectItem value="CASH">Efectivo</SelectItem>
            <SelectItem value="TRANSFER">Transferencia</SelectItem>
            <SelectItem value="CARD">Tarjeta</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(v) => {
            setFilter('category', v === ALL ? null : v);
            setFilter('page', null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las categorías</SelectItem>
            {categories.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setFilter('dateFrom', e.target.value || null);
            setFilter('page', null);
          }}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setFilter('dateTo', e.target.value || null);
            setFilter('page', null);
          }}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeVoided}
            onChange={(e) => {
              setFilter('voided', e.target.checked ? '1' : null);
              setFilter('page', null);
            }}
            className="h-4 w-4 rounded border-input"
          />
          Incluir anuladas
        </label>
      </div>

      {filtersActive && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txs.isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!txs.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin movimientos en el período.
                </TableCell>
              </TableRow>
            )}
            {items.map((t) => (
              <TableRow key={t.id} className={t.isVoided ? 'opacity-50 line-through' : ''}>
                <TableCell className="font-mono text-xs">
                  {new Date(t.date).toLocaleDateString('es-CL', {
                    dateStyle: 'short',
                  })}
                </TableCell>
                <TableCell>
                  {t.type === 'INCOME' ? (
                    <Badge className="bg-stock-ok/15 text-stock-ok border-transparent">
                      <ArrowUpToLine className="h-3 w-3" /> Ingreso
                    </Badge>
                  ) : (
                    <Badge className="bg-stock-out/15 text-stock-out border-transparent">
                      <ArrowDownToLine className="h-3 w-3" /> Egreso
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {SOURCE_LABEL[t.source]}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.expenseCategory?.name ?? '—'}
                </TableCell>
                <TableCell className="max-w-[280px] truncate">
                  {t.description ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {METHOD_LABEL[t.paymentMethod]}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${
                    t.type === 'INCOME' ? 'text-stock-ok' : 'text-destructive'
                  }`}
                >
                  {t.type === 'INCOME' ? '+' : '−'}
                  {formatCurrency(t.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} movimiento{total === 1 ? '' : 's'}
          {total > 0 ? ` · página ${page} de ${totalPages}` : ''}
          {' · '}
          <span className="text-stock-ok">+{formatCurrency(periodIncome.toFixed(2))}</span>
          {' / '}
          <span className="text-destructive">
            −{formatCurrency(periodExpense.toFixed(2))}
          </span>{' '}
          (página actual)
        </span>
        {total > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setFilter('page', String(Math.min(totalPages, page + 1)))
              }
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceCard({
  label,
  icon,
  value,
  isLoading,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">
        {isLoading ? <Skeleton className="h-6 w-24" /> : formatCurrency(value)}
      </div>
    </div>
  );
}
