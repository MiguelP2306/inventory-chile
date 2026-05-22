'use client';

import { ArrowRight } from 'lucide-react';
import { TransferStatusBadge } from '@/components/transfer-status-badge';
import type { TransferMovementCardDto } from '@inventory/shared';
import { DetailLine, ItemRow, MovementCardShell } from './card-shell';

export function TransferMovementCard({
  card,
}: {
  card: TransferMovementCardDto;
}) {
  const t = card.transfer;
  const totalQty = t.items.reduce((acc, it) => acc + it.qty, 0);

  return (
    <MovementCardShell
      kind="TRANSFER"
      isAuditOnly={card.isAuditOnly}
      title={t.number}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-1.5 text-foreground">
          <span className="font-medium">{t.fromWarehouse.name}</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{t.toWarehouse.name}</span>
        </span>
      }
      headerBadges={<TransferStatusBadge status={t.status} />}
      dateIso={t.date}
      userLabel={card.user?.email ?? null}
      summary={
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            <span className="font-medium">{t.items.length}</span> ítem
            {t.items.length === 1 ? '' : 's'} ·{' '}
            <span className="font-medium">{totalQty}</span> unidad
            {totalQty === 1 ? '' : 'es'} transferida{totalQty === 1 ? '' : 's'}
          </span>
        </div>
      }
      expanded={
        <>
          <DetailLine label="Bodega origen" value={t.fromWarehouse.name} />
          <DetailLine label="Bodega destino" value={t.toWarehouse.name} />
          <div className="space-y-0.5 border-t pt-2">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Productos transferidos
            </div>
            {t.items.map((it, idx) => (
              <ItemRow
                key={idx}
                product={it.product}
                qty={it.qty}
                right={null}
              />
            ))}
          </div>
          {t.notes && (
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notas
              </div>
              <p className="whitespace-pre-wrap text-sm">{t.notes}</p>
            </div>
          )}
          {t.status === 'CANCELLED' && t.cancelReason && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <div className="font-semibold text-destructive">
                Transferencia cancelada
              </div>
              <div className="mt-0.5 text-muted-foreground">{t.cancelReason}</div>
            </div>
          )}
        </>
      }
      viewHref={`/transferencias/${t.id}`}
      viewLabel="Ver transferencia"
    />
  );
}
