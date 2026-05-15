'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { getCompanySettings } from '@/lib/cashbox-api';
import { formatCurrency } from '@/lib/format';
import { getProjection, projectionCsvUrl } from '@/lib/reports-api';

export default function ProyeccionPage() {
  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000,
  });

  // Si el usuario edita el input lo aplicamos solo al hacer click en "Aplicar"
  // — evita re-querys en cada keystroke. El query usa `appliedLeadTime`.
  const [draftLeadTime, setDraftLeadTime] = useState<string>('');
  const [appliedLeadTime, setAppliedLeadTime] = useState<number | undefined>(
    undefined,
  );
  const [showAll, setShowAll] = useState(false);

  // Cuando llegan los settings inicializamos el draft con el valor del backend.
  useEffect(() => {
    if (settings.data && draftLeadTime === '') {
      setDraftLeadTime(String(settings.data.defaultLeadTimeDays));
    }
  }, [settings.data, draftLeadTime]);

  const projection = useQuery({
    queryKey: ['projection', { leadTimeDays: appliedLeadTime, all: showAll }],
    queryFn: () =>
      getProjection({ leadTimeDays: appliedLeadTime, all: showAll }),
  });

  const rows = projection.data?.rows ?? [];
  const effectiveLeadTime =
    projection.data?.leadTimeDays ?? settings.data?.defaultLeadTimeDays ?? 75;
  const windowDays = projection.data?.windowDays ?? 90;

  function applyLeadTime() {
    const parsed = Number(draftLeadTime);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 365) {
      setAppliedLeadTime(parsed);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Proyección de stock</h1>
        <p className="text-sm text-muted-foreground">
          Consumo promedio calculado sobre los últimos {windowDays} días.
          Productos críticos = cobertura ≤ lead time. Stock = suma de todas
          las bodegas activas.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-card p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
          <div className="space-y-1">
            <Label htmlFor="leadTime" className="text-xs">
              Lead time (días)
            </Label>
            <Input
              id="leadTime"
              type="number"
              min={1}
              max={365}
              value={draftLeadTime}
              onChange={(e) => setDraftLeadTime(e.target.value)}
              className="w-32"
            />
          </div>
          <Button type="button" onClick={applyLeadTime}>
            Aplicar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Solo críticos' : 'Mostrar todos'}
          </Button>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <a
            href={projectionCsvUrl({
              leadTimeDays: appliedLeadTime,
              all: showAll,
            })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button type="button" variant="default">
              <Download className="h-4 w-4" />
              Descargar lista de críticos
            </Button>
          </a>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
        <Info className="h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <p>
            Lead time actual:{' '}
            <strong>{effectiveLeadTime} días</strong>. La sugerencia de pedido
            cubre el lead time + 30 días de buffer post-llegada.
          </p>
          {projection.data && (
            <p className="text-muted-foreground">
              Mostrando <strong>{rows.length}</strong>{' '}
              {showAll
                ? rows.length === 1
                  ? 'producto'
                  : 'productos'
                : rows.length === 1
                  ? 'producto crítico'
                  : 'productos críticos'}
              .
            </p>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Consumo/día</TableHead>
              <TableHead className="text-right">Cobertura (días)</TableHead>
              <TableHead>Quiebre estimado</TableHead>
              <TableHead className="text-right">Sugerencia pedido</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projection.isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!projection.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground py-8"
                >
                  {showAll
                    ? 'No hay productos activos.'
                    : 'Sin productos críticos. La cobertura de todos los productos supera el lead time configurado.'}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.productId}
                className={r.isCritical ? 'bg-destructive/5' : undefined}
              >
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell className="max-w-[280px] truncate">
                  {r.name}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.totalStock}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.dailyConsumption.toFixed(2)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.coverageDays != null ? r.coverageDays.toFixed(1) : '∞'}
                </TableCell>
                <TableCell className="text-sm">
                  {r.stockoutDate ? (
                    new Date(r.stockoutDate).toLocaleDateString('es-CL', {
                      dateStyle: 'medium',
                    })
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.suggestedOrder > 0 ? (
                    <span>
                      <strong>{r.suggestedOrder}</strong>{' '}
                      <span className="text-xs text-muted-foreground">
                        (≈ {formatCurrency(
                          (
                            r.suggestedOrder * Number(r.cost ?? 0)
                          ).toFixed(2),
                        )}
                        )
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.isCritical ? (
                    <Badge variant="out" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Crítico
                    </Badge>
                  ) : (
                    <Badge variant="ok">OK</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
