'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Paperclip, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExpenseFormDialog } from '@/components/forms/expense-form';
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
  listExpenseCategories,
  listExpenses,
  publicDocumentUrl,
  voidExpense,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { ExpenseDto, PaymentMethodDto } from '@inventory/shared';

const ALL = '__all__';
const PAGE_SIZE = 20;

const METHOD_LABELS: Record<PaymentMethodDto, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
};

export default function GastosPage() {
  const qc = useQueryClient();
  const { values, setFilter, clear } = useUrlFilters({
    category: '',
    method: '',
    dateFrom: '',
    dateTo: '',
    q: '',
    voided: '',
    page: '',
  });
  const category = values.category || ALL;
  const method = values.method || ALL;
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';
  const q = values.q ?? '';
  const includeVoided = values.voided === '1';
  const page = Number(values.page || '1');

  const filtersActive =
    category !== ALL ||
    method !== ALL ||
    dateFrom !== '' ||
    dateTo !== '' ||
    q !== '' ||
    includeVoided;

  const categories = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => listExpenseCategories(),
  });

  const list = useQuery({
    queryKey: [
      'expenses',
      { category, method, dateFrom, dateTo, q, includeVoided, page },
    ],
    queryFn: () =>
      listExpenses({
        categoryId: category === ALL ? undefined : category,
        paymentMethod:
          method === ALL ? undefined : (method as PaymentMethodDto),
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nuevo gasto
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <Input
          placeholder="Buscar (descripción/N°)"
          value={q}
          onChange={(e) => {
            setFilter('q', e.target.value || null);
            setFilter('page', null);
          }}
          className="md:col-span-2"
        />
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
        <Select
          value={method}
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
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={includeVoided}
            onChange={(e) => {
              setFilter('voided', e.target.checked ? '1' : null);
              setFilter('page', null);
            }}
            className="h-4 w-4 rounded border-input"
          />
          Incluir anulados
        </label>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Limpiar filtros
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead></TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Sin gastos en el período.
                </TableCell>
              </TableRow>
            )}
            {items.map((e) => {
              const voided = !!e.voidedAt;
              const url = publicDocumentUrl(e.receiptUrl);
              return (
                <TableRow key={e.id} className={voided ? 'opacity-60' : ''}>
                  <TableCell className="font-mono text-xs">{e.number}</TableCell>
                  <TableCell>
                    {new Date(e.date).toLocaleDateString('es-CL', {
                      dateStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.category?.name ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate">
                    {e.description}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {METHOD_LABELS[e.paymentMethod]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(e.amount)}
                  </TableCell>
                  <TableCell>
                    {voided ? (
                      <Badge variant="outline" className="text-destructive">
                        Anulado
                      </Badge>
                    ) : url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        title="Ver comprobante"
                      >
                        <Paperclip className="h-4 w-4" />
                      </a>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {!voided && (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(e);
                            setDialogOpen(true);
                          }}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (
                              confirm(
                                `¿Anular ${e.number}? Se generará una compensación en caja.`,
                              )
                            )
                              voidMut.mutate(e.id);
                          }}
                          title="Anular"
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} gasto{total === 1 ? '' : 's'}
          {total > 0 ? ` · página ${page} de ${totalPages}` : ''}
          {' · '}Total página (no anulados):{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(periodTotal.toFixed(2))}
          </span>
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

      <ExpenseFormDialog
        open={dialogOpen}
        expense={editing}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
