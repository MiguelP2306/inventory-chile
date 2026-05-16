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
import { getSalesReport, salesReportCsvUrl } from '@/lib/reports-api';
import { useUrlFilters } from '@/lib/use-url-filters';

const METHOD_LABEL: Record<'CASH' | 'TRANSFER' | 'CARD', string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
};

const STATUS_LABEL: Record<'PENDING' | 'PAID' | 'CANCELLED', string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

export default function ReporteVentasPage() {
  const { values, setFilter } = useUrlFilters({ dateFrom: '', dateTo: '' });
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';

  const params = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const report = useQuery({
    queryKey: ['report', 'sales', dateFrom, dateTo],
    queryFn: () => getSalesReport(params),
  });

  const rows = report.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Reporte de ventas</h1>
        <p className="text-sm text-muted-foreground">
          Detalle de cada venta del período. Las canceladas se muestran
          tachadas y no suman al total.
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
          href={salesReportCsvUrl(params)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button type="button">
            <Download className="h-4 w-4" />
            Descargar CSV
          </Button>
        </a>
      </div>

      {report.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="Ventas activas" value={report.data.countActive} />
          <SummaryCard
            label="Canceladas"
            value={report.data.countCancelled}
          />
          <SummaryCard
            label="IVA débito"
            value={formatCurrency(report.data.totalTax)}
          />
          <SummaryCard
            label="Total facturado"
            value={formatCurrency(report.data.totalAmount)}
            highlight
          />
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>N° venta</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!report.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  No hay ventas en el período.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const cancelled = r.status === 'CANCELLED';
              return (
                <TableRow
                  key={r.id}
                  className={cancelled ? 'opacity-60' : undefined}
                >
                  <TableCell
                    className={
                      cancelled
                        ? 'font-mono text-xs line-through'
                        : 'font-mono text-xs'
                    }
                  >
                    {r.number}
                  </TableCell>
                  <TableCell>
                    {new Date(r.date).toLocaleDateString('es-CL', {
                      dateStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell
                    className={
                      cancelled
                        ? 'line-through max-w-[200px] truncate'
                        : 'max-w-[200px] truncate'
                    }
                  >
                    {r.customerName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.customerTaxId ?? '—'}
                  </TableCell>
                  <TableCell>{METHOD_LABEL[r.paymentMethod]}</TableCell>
                  <TableCell>
                    <Badge variant={cancelled ? 'out' : 'ok'}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.subtotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.taxAmount)}
                  </TableCell>
                  <TableCell
                    className={
                      cancelled
                        ? 'text-right tabular-nums font-medium line-through'
                        : 'text-right tabular-nums font-medium'
                    }
                  >
                    {formatCurrency(r.total)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          {report.data && rows.length > 0 && (
            <TableBody>
              <TableRow className="bg-muted/50 font-medium">
                <TableCell colSpan={6} className="text-right">
                  Totales (solo activas)
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(report.data.totalSubtotal)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(report.data.totalTax)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-bold">
                  {formatCurrency(report.data.totalAmount)}
                </TableCell>
              </TableRow>
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={
          highlight
            ? 'mt-1 text-2xl font-semibold tabular-nums'
            : 'mt-1 text-xl font-semibold tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  );
}
