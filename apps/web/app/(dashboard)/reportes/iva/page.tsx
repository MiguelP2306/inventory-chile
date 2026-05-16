'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/format';
import { getIvaReport, ivaReportCsvUrl } from '@/lib/reports-api';
import { useUrlFilters } from '@/lib/use-url-filters';

export default function ReporteIvaPage() {
  const { values, setFilter } = useUrlFilters({ dateFrom: '', dateTo: '' });
  const dateFrom = values.dateFrom ?? '';
  const dateTo = values.dateTo ?? '';

  const params = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const report = useQuery({
    queryKey: ['report', 'iva', dateFrom, dateTo],
    queryFn: () => getIvaReport(params),
  });

  const data = report.data;
  // Balance > 0 → a pagar (débito > crédito). < 0 → a favor del contribuyente.
  const balanceN = data ? Number(data.balance) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Reporte de IVA</h1>
        <p className="text-sm text-muted-foreground">
          IVA débito (ventas) vs. IVA crédito (compras). Las ventas
          canceladas no se contabilizan.
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
          href={ivaReportCsvUrl(params)}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard
            label="IVA débito (ventas)"
            value={formatCurrency(data.debit)}
          />
          <SummaryCard
            label="IVA crédito (compras)"
            value={formatCurrency(data.credit)}
          />
          <SummaryCard
            label={balanceN >= 0 ? 'A pagar' : 'A favor'}
            value={formatCurrency(Math.abs(balanceN).toFixed(2))}
            highlight
            tone={balanceN >= 0 ? 'destructive' : 'positive'}
          />
          <SummaryCard
            label="Documentos"
            value={`${data.salesRows.length} v / ${data.purchaseRows.length} c`}
          />
        </div>
      )}

      <Tabs defaultValue="ventas">
        <TabsList>
          <TabsTrigger value="ventas">
            Ventas ({data?.salesRows.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="compras">
            Compras ({data?.purchaseRows.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ventas" className="mt-4">
          <div className="rounded-md border bg-card">
            <Table stickyFirstColumn>
              <TableHeader>
                <TableRow>
                  <TableHead>N° venta</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.isLoading && <SkeletonRows cols={7} />}
                {!report.isLoading &&
                  (data?.salesRows.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-8"
                      >
                        No hay ventas en el período.
                      </TableCell>
                    </TableRow>
                  )}
                {data?.salesRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.number}
                    </TableCell>
                    <TableCell>
                      {new Date(r.date).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {r.customerName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.customerTaxId ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.subtotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.taxAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(r.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="compras" className="mt-4">
          <div className="rounded-md border bg-card">
            <Table stickyFirstColumn>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.isLoading && <SkeletonRows cols={6} />}
                {!report.isLoading &&
                  (data?.purchaseRows.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        No hay compras en el período.
                      </TableCell>
                    </TableRow>
                  )}
                {data?.purchaseRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {new Date(r.date).toLocaleDateString('es-CL', {
                        dateStyle: 'medium',
                      })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {r.supplierName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.supplierTaxId ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.subtotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.taxAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(r.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell colSpan={cols}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
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
