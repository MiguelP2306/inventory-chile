'use client';

import { Badge } from '@/components/ui/badge';
import { SaleStatusBadge } from '@/components/sale-status-badge';
import { formatCurrency } from '@/lib/format';
import { formatRutPretty } from '@/lib/validators/rut';
import type { SaleMovementCardDto } from '@inventory/shared';
import { DetailLine, ItemRow, MovementCardShell } from './card-shell';

const PAYMENT_LABEL: Record<SaleMovementCardDto['sale']['paymentMethod'], string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Tarjeta débito',
  CARD_CREDIT: 'Tarjeta crédito',
  PAYMENT_LINK: 'Link de pago',
};

export function SaleMovementCard({ card }: { card: SaleMovementCardDto }) {
  const s = card.sale;
  const customer = s.customer;
  const totalQty = s.items.reduce((acc, it) => acc + it.qty, 0);

  return (
    <MovementCardShell
      kind="SALE"
      isAuditOnly={card.isAuditOnly}
      title={s.number}
      subtitle={
        customer ? (
          <>
            <span className="font-medium text-foreground">{customer.name}</span>
            {customer.taxId && (
              <span className="ml-1.5 font-mono text-xs">
                · {formatRutPretty(customer.taxId)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Sin cliente</span>
        )
      }
      headerBadges={
        <>
          <Badge variant="outline" className="text-xs">
            {PAYMENT_LABEL[s.paymentMethod]}
          </Badge>
          <SaleStatusBadge status={s.status} />
          {s.quotationNumber && (
            <Badge variant="outline" className="text-xs font-mono">
              ← {s.quotationNumber}
            </Badge>
          )}
        </>
      }
      dateIso={s.date}
      userLabel={card.user?.email ?? null}
      summary={
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            <span className="font-medium">{s.items.length}</span> ítem
            {s.items.length === 1 ? '' : 's'} ·{' '}
            <span className="font-medium">{totalQty}</span> unidad
            {totalQty === 1 ? '' : 'es'}
          </span>
          <span className="text-base font-semibold">{formatCurrency(s.total)}</span>
          <span className="text-xs text-muted-foreground">
            Bodega: {s.warehouse.name}
          </span>
        </div>
      }
      expanded={
        <>
          <DetailLine label="Bodega de salida" value={s.warehouse.name} />
          {customer?.phone && (
            <DetailLine
              label="Teléfono cliente"
              value={<span className="font-mono">{customer.phone}</span>}
            />
          )}
          <div className="space-y-0.5 border-t pt-2">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Ítems vendidos
            </div>
            {s.items.map((it, idx) => (
              <ItemRow
                key={idx}
                product={it.product}
                qty={it.qty}
                right={
                  <span className="font-mono tabular-nums text-xs text-muted-foreground">
                    {formatCurrency(it.unitPrice)} ·{' '}
                    <span className="text-foreground">{formatCurrency(it.subtotal)}</span>
                  </span>
                }
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-xs">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-right font-mono tabular-nums">
              {formatCurrency(s.subtotal)}
            </span>
            <span className="text-muted-foreground">IVA</span>
            <span className="text-right font-mono tabular-nums">
              {formatCurrency(s.taxAmount)}
            </span>
            {Number(s.commissionAmount) > 0 && (
              <>
                <span className="text-muted-foreground">Comisión tarjeta</span>
                <span className="text-right font-mono tabular-nums text-destructive">
                  −{formatCurrency(s.commissionAmount)}
                </span>
              </>
            )}
            <span className="font-semibold">Total</span>
            <span className="text-right font-mono font-semibold tabular-nums">
              {formatCurrency(s.total)}
            </span>
          </div>
          {s.notes && (
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notas
              </div>
              <p className="whitespace-pre-wrap text-sm">{s.notes}</p>
            </div>
          )}
          {s.status === 'CANCELLED' && s.cancelReason && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <div className="font-semibold text-destructive">Venta cancelada</div>
              <div className="mt-0.5 text-muted-foreground">{s.cancelReason}</div>
            </div>
          )}
        </>
      }
      viewHref={`/ventas/${s.id}`}
      viewLabel="Ver venta"
    />
  );
}
