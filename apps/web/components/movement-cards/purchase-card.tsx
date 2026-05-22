'use client';

import { Badge } from '@/components/ui/badge';
import { Paperclip } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { formatRutPretty } from '@/lib/validators/rut';
import type { PurchaseMovementCardDto } from '@inventory/shared';
import { DetailLine, ItemRow, MovementCardShell } from './card-shell';

export function PurchaseMovementCard({
  card,
}: {
  card: PurchaseMovementCardDto;
}) {
  const p = card.purchase;
  const supplier = p.supplier;
  const totalQty = p.items.reduce((acc, it) => acc + it.qty, 0);

  return (
    <MovementCardShell
      kind="PURCHASE"
      isAuditOnly={card.isAuditOnly}
      title={
        <span>
          Compra <span className="font-mono">{p.id.slice(0, 8)}</span>
        </span>
      }
      subtitle={
        supplier ? (
          <>
            <span className="font-medium text-foreground">{supplier.name}</span>
            {supplier.taxId && (
              <span className="ml-1.5 font-mono text-xs">
                · {formatRutPretty(supplier.taxId)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">Sin proveedor</span>
        )
      }
      headerBadges={
        p.invoices.length > 0 ? (
          <Badge variant="outline" className="text-xs">
            <Paperclip className="mr-1 h-3 w-3" />
            {p.invoices.length} factura{p.invoices.length === 1 ? '' : 's'}
          </Badge>
        ) : null
      }
      dateIso={p.date}
      userLabel={card.user?.email ?? null}
      summary={
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span>
            <span className="font-medium">{p.items.length}</span> ítem
            {p.items.length === 1 ? '' : 's'} ·{' '}
            <span className="font-medium">{totalQty}</span> unidad
            {totalQty === 1 ? '' : 'es'}
          </span>
          <span className="text-base font-semibold">{formatCurrency(p.total)}</span>
          {p.warehouse && (
            <span className="text-xs text-muted-foreground">
              Bodega: {p.warehouse.name}
            </span>
          )}
        </div>
      }
      expanded={
        <>
          {p.warehouse && (
            <DetailLine label="Bodega destino" value={p.warehouse.name} />
          )}
          <div className="space-y-0.5 border-t pt-2">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Ítems comprados
            </div>
            {p.items.map((it, idx) => (
              <ItemRow
                key={idx}
                product={it.product}
                qty={it.qty}
                right={
                  <span className="font-mono tabular-nums text-xs text-muted-foreground">
                    {formatCurrency(it.unitCost)} ·{' '}
                    <span className="text-foreground">{formatCurrency(it.subtotal)}</span>
                  </span>
                }
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-xs">
            <span className="text-muted-foreground">Subtotal (neto)</span>
            <span className="text-right font-mono tabular-nums">
              {formatCurrency(p.subtotal)}
            </span>
            <span className="text-muted-foreground">IVA</span>
            <span className="text-right font-mono tabular-nums">
              {formatCurrency(p.taxAmount)}
            </span>
            <span className="font-semibold">Total bruto</span>
            <span className="text-right font-mono font-semibold tabular-nums">
              {formatCurrency(p.total)}
            </span>
          </div>
          {p.invoices.length > 0 && (
            <div className="border-t pt-2">
              <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                Facturas adjuntas
              </div>
              <ul className="space-y-1">
                {p.invoices.map((inv) => (
                  <li key={inv.id}>
                    <a
                      href={inv.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Paperclip className="h-3 w-3" />
                      {inv.originalName}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.notes && (
            <div className="border-t pt-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Notas
              </div>
              <p className="whitespace-pre-wrap text-sm">{p.notes}</p>
            </div>
          )}
        </>
      }
      viewHref={`/compras/${p.id}`}
      viewLabel="Ver compra"
    />
  );
}
