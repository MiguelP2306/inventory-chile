'use client';

import type { OrphanMovementCardDto } from '@inventory/shared';
import { DetailLine, ItemRow, MovementCardShell } from './card-shell';

// Card de fallback para movimientos cuyo origen no se pudo joinear (la
// entidad padre fue eliminada o el `reference` no matchea ninguna tabla
// conocida). Mantiene la trazabilidad mostrando lo crudo que hay en la
// tabla `inventory_movements`.
export function OrphanMovementCard({
  card,
}: {
  card: OrphanMovementCardDto;
}) {
  const first = card.movements[0]!;

  return (
    <MovementCardShell
      kind="ORPHAN"
      isAuditOnly={card.isAuditOnly}
      title={<span>Movimiento sin documento padre</span>}
      subtitle={
        <span className="font-mono text-xs">
          {card.rawType} · ref: {card.reference ?? '—'}
        </span>
      }
      dateIso={first.createdAt}
      userLabel={card.user?.email ?? null}
      summary={
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            <span className="font-medium">{card.movements.length}</span> movimiento
            {card.movements.length === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-muted-foreground">
            Bodega: {first.warehouse.name}
          </span>
        </div>
      }
      expanded={
        <>
          <DetailLine label="Tipo" value={<span className="font-mono">{card.rawType}</span>} />
          <DetailLine label="Reference" value={card.reference ?? '—'} />
          <DetailLine label="RefId" value={<span className="font-mono">{card.refId ?? '—'}</span>} />
          <div className="space-y-0.5 border-t pt-2">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Movimientos
            </div>
            {card.movements.map((m) => (
              <ItemRow key={m.movementId} product={m.product} qty={m.qty} />
            ))}
          </div>
        </>
      }
    />
  );
}
