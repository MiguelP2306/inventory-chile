'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DispatchStatusBadge } from '@/components/dispatch-status-badge';
import { formatRutPretty } from '@/lib/validators/rut';
import type { DispatchMovementCardDto } from '@inventory/shared';
import { DetailLine, MovementCardShell } from './card-shell';

export function DispatchMovementCard({
  card,
}: {
  card: DispatchMovementCardDto;
}) {
  const d = card.dispatch;
  const isVoidedEvent = d.eventType === 'DISPATCH_VOIDED';
  const addr = [
    d.addressStreet,
    d.addressNumber ? `Nº ${d.addressNumber}` : null,
    d.commune ? `${d.commune.name}, ${d.commune.region}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <MovementCardShell
      kind="DISPATCH"
      isAuditOnly={card.isAuditOnly}
      title={
        <span>
          {d.number}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {isVoidedEvent ? '(anulación)' : '(generación)'}
          </span>
        </span>
      }
      subtitle={
        d.customer ? (
          <>
            <span className="font-medium text-foreground">{d.customer.name}</span>
            {d.customer.taxId && (
              <span className="ml-1.5 font-mono text-xs">
                · {formatRutPretty(d.customer.taxId)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Sin cliente</span>
        )
      }
      headerBadges={
        <>
          <DispatchStatusBadge status={d.status} />
          <Badge variant="outline" className="text-xs">
            Venta:{' '}
            <Link
              href={`/ventas/${d.sale.id}`}
              className="ml-1 font-mono text-primary hover:underline"
            >
              {d.sale.number}
            </Link>
          </Badge>
        </>
      }
      dateIso={d.dispatchedAt}
      userLabel={card.user?.email ?? null}
      summary={
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {d.carrier && (
            <span>
              Transportista: <span className="font-medium">{d.carrier}</span>
            </span>
          )}
          {d.trackingNumber && (
            <span className="font-mono text-xs">Tracking: {d.trackingNumber}</span>
          )}
          {addr && (
            <span className="text-xs text-muted-foreground">{addr}</span>
          )}
        </div>
      }
      expanded={
        <>
          {addr && <DetailLine label="Dirección de entrega" value={addr} />}
          {d.carrier && <DetailLine label="Transportista" value={d.carrier} />}
          {d.trackingNumber && (
            <DetailLine
              label="Nº de seguimiento"
              value={<span className="font-mono">{d.trackingNumber}</span>}
            />
          )}
          {d.addressNotes && (
            <DetailLine label="Indicaciones de entrega" value={d.addressNotes} />
          )}
          {d.notes && (
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notas del despacho
              </div>
              <p className="whitespace-pre-wrap text-sm">{d.notes}</p>
            </div>
          )}
          {isVoidedEvent && d.voidReason && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <div className="font-semibold text-destructive">Guía anulada</div>
              <div className="mt-0.5 text-muted-foreground">{d.voidReason}</div>
            </div>
          )}
          <div className="border-t pt-2 text-xs text-muted-foreground">
            Este evento es solo de auditoría — el movimiento real de stock se hizo
            con la venta {d.sale.number}.
          </div>
        </>
      }
      viewHref={`/guias/${d.id}`}
      viewLabel="Ver guía"
    />
  );
}
