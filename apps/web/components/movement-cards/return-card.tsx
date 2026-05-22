'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ReturnStatusBadge } from '@/components/return-status-badge';
import { formatCurrency } from '@/lib/format';
import { formatRutPretty } from '@/lib/validators/rut';
import type { ReturnMovementCardDto } from '@inventory/shared';
import { DetailLine, ItemRow, MovementCardShell } from './card-shell';

const PAYMENT_LABEL: Record<ReturnMovementCardDto['return']['paymentMethod'], string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Tarjeta débito',
  CARD_CREDIT: 'Tarjeta crédito',
  PAYMENT_LINK: 'Link de pago',
};

const REFUND_LABEL: Record<ReturnMovementCardDto['return']['refundMode'], string> = {
  MONEY: 'Reembolso en dinero',
  CREDIT: 'Crédito a favor',
  EXCHANGE: 'Cambio por producto',
};

export function ReturnMovementCard({ card }: { card: ReturnMovementCardDto }) {
  const r = card.return;
  const isCustomer = r.type === 'CUSTOMER';
  const contact = isCustomer ? r.customer : r.supplier;
  const hasDamaged = r.items.some((it) => it.itemCondition === 'DAMAGED');
  const hasResellable = r.items.some((it) => it.itemCondition === 'RESELLABLE');

  return (
    <MovementCardShell
      kind="RETURN"
      isAuditOnly={card.isAuditOnly}
      title={
        <span>
          {r.number}{' '}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {isCustomer ? 'devolución de cliente' : 'devolución a proveedor'}
          </span>
        </span>
      }
      subtitle={
        contact ? (
          <>
            <span className="font-medium text-foreground">{contact.name}</span>
            {contact.taxId && (
              <span className="ml-1.5 font-mono text-xs">
                · {formatRutPretty(contact.taxId)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Sin contacto registrado</span>
        )
      }
      headerBadges={
        <>
          <ReturnStatusBadge status={r.status} />
          <Badge variant="outline" className="text-xs">
            {REFUND_LABEL[r.refundMode]}
          </Badge>
          {hasDamaged && hasResellable && (
            <Badge variant="outline" className="border-amber-500/50 text-xs">
              Mixta (vendible + dañado)
            </Badge>
          )}
          {hasDamaged && !hasResellable && (
            <Badge variant="outline" className="border-destructive/50 text-xs text-destructive">
              Producto dañado
            </Badge>
          )}
        </>
      }
      dateIso={r.date}
      userLabel={card.user?.email ?? null}
      summary={
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            <span className="font-medium">{r.items.length}</span> ítem
            {r.items.length === 1 ? '' : 's'} · Reembolso{' '}
            <span className="font-medium">{formatCurrency(r.refundAmount)}</span>
          </span>
          {isCustomer && r.saleOrigin && (
            <span className="text-xs">
              Origen:{' '}
              <Link
                href={`/ventas/${r.saleOrigin.id}`}
                className="font-mono text-primary hover:underline"
              >
                {r.saleOrigin.number}
              </Link>
            </span>
          )}
          {!isCustomer && r.purchaseOrigin && (
            <span className="text-xs">
              Compra origen:{' '}
              <Link
                href={`/compras/${r.purchaseOrigin.id}`}
                className="font-mono text-primary hover:underline"
              >
                {r.purchaseOrigin.id.slice(0, 8)}
              </Link>
            </span>
          )}
        </div>
      }
      expanded={
        <>
          <DetailLine label="Bodega" value={r.warehouse.name} />
          <DetailLine label="Método de reembolso" value={PAYMENT_LABEL[r.paymentMethod]} />
          {r.refundMode === 'EXCHANGE' && Number(r.exchangeDifference) !== 0 && (
            <DetailLine
              label="Diferencia en cambio"
              value={
                Number(r.exchangeDifference) > 0 ? (
                  <span className="text-stock-ok">
                    +{formatCurrency(r.exchangeDifference)} (paga cliente)
                  </span>
                ) : (
                  <span className="text-destructive">
                    {formatCurrency(r.exchangeDifference)} (reembolso adicional)
                  </span>
                )
              }
            />
          )}
          <div className="border-t pt-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Motivo
            </div>
            <p className="whitespace-pre-wrap text-sm">{r.reason}</p>
          </div>
          <div className="space-y-0.5 border-t pt-2">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Productos devueltos
            </div>
            {r.items.map((it, idx) => (
              <ItemRow
                key={idx}
                product={it.product}
                qty={it.qty}
                right={
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="font-mono tabular-nums text-xs text-muted-foreground">
                      {formatCurrency(it.unitPrice)} ·{' '}
                      <span className="text-foreground">{formatCurrency(it.subtotal)}</span>
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        it.itemCondition === 'DAMAGED'
                          ? 'border-destructive/50 text-[10px] text-destructive'
                          : 'text-[10px]'
                      }
                    >
                      {it.itemCondition === 'DAMAGED' ? 'Dañado' : 'Vendible'}
                    </Badge>
                  </span>
                }
              />
            ))}
          </div>
          {r.notes && (
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notas
              </div>
              <p className="whitespace-pre-wrap text-sm">{r.notes}</p>
            </div>
          )}
          {r.status === 'CANCELLED' && r.cancelReason && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <div className="font-semibold text-destructive">Devolución cancelada</div>
              <div className="mt-0.5 text-muted-foreground">{r.cancelReason}</div>
            </div>
          )}
        </>
      }
      viewHref={`/devoluciones/${r.id}`}
      viewLabel="Ver devolución"
    />
  );
}
