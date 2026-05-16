'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/format';
import { cashFlowReportCsvUrl, getCashFlowReport } from '@/lib/reports-api';
import { useUrlFilters } from '@/lib/use-url-filters';

const SOURCE_LABEL: Record<string, string> = {
  SALE: 'Venta',
  PURCHASE: 'Compra',
  MANUAL: 'Manual',
  SALE_RETURN: 'Devolución venta',
  PURCHASE_RETURN: 'Devolución compra',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
};

export default function ReporteFlujoCajaPage() {
  const { values, setFilter } = useUrlFilters({ dateFrom: '', dateTo: '' });
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';

  const params = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const report = useQuery({
    queryKey: ['report', 'cash-flow', dateFrom, dateTo],
    queryFn: () => getCashFlowReport(params),
  });

  const data = report.data;
  const rows = data?.rows ?? [];
  const netN = data ? Number(data.net) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Flujo de caja</h1>
        <p className="text-sm text-muted-foreground">
          Ingresos vs. egresos del período. Incluye ventas (ingreso),
          compras (egreso), devoluciones y movimientos manuales.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-card p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setFilter('dateFrom', e.target.value || null)}
              className="w-44"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setFilter('dateTo', e.target.value || null)}
              className="w-44"
            />
          </div>
        </div>
        <a
          href={cashFlowReportCsvUrl(params)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button type="button">
            <Download className="h-4 w-4" />
            Descargar CSV
          </Button>
        </a>
      </div>

      {data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryCard
            label="Total ingresos"
            value={formatCurrency(data.totalIncome)}
            tone="positive"
          />
          <SummaryCard
            label="Total egresos"
            value={formatCurrency(data.totalExpense)}
            tone="destructive"
          />
          <SummaryCard
            label={netN >= 0 ? 'Saldo neto' : 'Saldo neto (negativo)'}
            value={formatCurrency(data.net)}
            highlight
            tone={netN >= 0 ? 'positive' : 'destructive'}
          />
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!report.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-8"
                >
                  No hay movimientos en el período.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const voided = r.isVoided;
              const sign = r.type === 'INCOME' ? '+' : '−';
              const toneClass =
                r.type === 'INCOME'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-destructive';
              return (
                <TableRow
                  key={r.id}
                  className={voided ? 'opacity-60' : undefined}
                >
                  <TableCell>
                    {new Date(r.date).toLocaleDateString('es-CL', {
                      dateStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.type === 'INCOME' ? 'ok' : 'out'}>
                      {r.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                    </Badge>
                  </TableCell>
                  <TableCell>{SOURCE_LABEL[r.source] ?? r.source}</TableCell>
                  <TableCell>{METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}</TableCell>
                  <TableCell
                    className={
                      voided
                        ? 'line-through max-w-[280px] truncate'
                        : 'max-w-[280px] truncate'
                    }
                  >
                    {r.description}
                    {voided && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (anulada)
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${toneClass}${voided ? ' line-through' : ''}`}
                  >
                    {sign}
                    {formatCurrency(r.amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'destructive' | 'positive';
}) {
  const toneClass =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'positive'
        ? 'text-emerald-600 dark:text-emerald-400'
        : '';
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={[
          highlight ? 'mt-1 text-2xl font-semibold' : 'mt-1 text-xl font-semibold',
          'tabular-nums',
          toneClass,
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
