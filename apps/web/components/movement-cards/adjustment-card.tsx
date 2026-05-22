'use client';

import { formatCurrency } from '@/lib/format';
import type { AdjustmentMovementCardDto } from '@inventory/shared';
import { DetailLine, MovementCardShell } from './card-shell';

export function AdjustmentMovementCard({
  card,
}: {
  card: AdjustmentMovementCardDto;
}) {
  // Ajustes siempre tienen exactamente 1 movimiento (no se agrupan).
  const m = card.movements[0]!;
  const isIncrease = m.qty > 0;

  return (
    <MovementCardShell
      kind="ADJUSTMENT"
      isAuditOnly={card.isAuditOnly}
      title={
        <span>
          Ajuste manual{' '}
          <span
            className={
              isIncrease
                ? 'ml-1 font-mono text-stock-ok'
                : 'ml-1 font-mono text-destructive'
            }
          >
            {isIncrease ? '+' : ''}
            {m.qty} u
          </span>
        </span>
      }
      subtitle={
        <>
          <span className="font-medium text-foreground">{m.product.name}</span>
          {m.product.sku && (
            <span className="ml-1.5 font-mono text-xs">· {m.product.sku}</span>
          )}
        </>
      }
      dateIso={m.createdAt}
      userLabel={card.user?.email ?? null}
      summary={
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            Bodega: <span className="font-medium">{m.warehouse.name}</span>
          </span>
          {m.unitCost && (
            <span className="text-xs text-muted-foreground">
              Costo unitario: {formatCurrency(m.unitCost)}
            </span>
          )}
        </div>
      }
      expanded={
        <>
          <DetailLine
            label="Tipo de ajuste"
            value={isIncrease ? 'Suma de stock' : 'Resta de stock'}
          />
          <DetailLine label="Bodega" value={m.warehouse.name} />
          {m.unitCost && (
            <DetailLine
              label="Costo unitario"
              value={formatCurrency(m.unitCost)}
            />
          )}
          <div className="border-t pt-2 text-xs text-muted-foreground">
            El motivo del ajuste se ingresó en la pantalla "Ajustar stock" pero no
            queda persistido como campo de auditoría individual. Para consultar el
            historial completo, revisar el producto en{' '}
            <span className="font-medium">/inventario</span>.
          </div>
        </>
      }
    />
  );
}
