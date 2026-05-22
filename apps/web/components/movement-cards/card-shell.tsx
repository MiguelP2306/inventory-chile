'use client';

import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  PackageMinus,
  PackagePlus,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MovementCardDto } from '@inventory/shared';

// Ronda 13 — color/icono por tipo de card. Se usa en el header del shell.
const KIND_ACCENT: Record<
  MovementCardDto['kind'],
  { label: string; cls: string; icon: typeof ShoppingCart }
> = {
  SALE: {
    label: 'Venta',
    cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    icon: ShoppingCart,
  },
  PURCHASE: {
    label: 'Compra',
    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    icon: PackagePlus,
  },
  RETURN: {
    label: 'Devolución',
    cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    icon: RotateCcw,
  },
  TRANSFER: {
    label: 'Transferencia',
    cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    icon: ArrowRightLeft,
  },
  DISPATCH: {
    label: 'Guía despacho',
    cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    icon: Truck,
  },
  ADJUSTMENT: {
    label: 'Ajuste',
    cls: 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300',
    icon: Settings2,
  },
  ORPHAN: {
    label: 'Movimiento',
    cls: 'bg-muted text-muted-foreground',
    icon: PackageMinus,
  },
};

export function getKindAccent(kind: MovementCardDto['kind']) {
  return KIND_ACCENT[kind];
}

interface CardShellProps {
  kind: MovementCardDto['kind'];
  // Texto principal en el header (ej. número de venta, "Transferencia: A → B").
  title: ReactNode;
  // Línea secundaria abajo del título (cliente/proveedor/origen/etc.).
  subtitle?: ReactNode;
  // Badges adicionales que se renderizan a la derecha del título.
  headerBadges?: ReactNode;
  // Fecha (string ISO) — se formatea en formato es-CL.
  dateIso: string;
  // Email/nombre del usuario que registró.
  userLabel?: string | null;
  // True si la card representa un evento de auditoría sin impacto en stock.
  isAuditOnly?: boolean;
  // Resumen compacto que va arriba del fold (ej. "4 ítems · 12 unidades · $185.420").
  summary: ReactNode;
  // Detalle que se muestra al expandir la card.
  expanded: ReactNode;
  // Footer opcional: monto / método / link al documento. Se renderiza siempre.
  footer?: ReactNode;
  // URL del documento origen (si aplica) — abre en otra pestaña.
  viewHref?: string;
  viewLabel?: string;
}

export function MovementCardShell({
  kind,
  title,
  subtitle,
  headerBadges,
  dateIso,
  userLabel,
  isAuditOnly,
  summary,
  expanded,
  footer,
  viewHref,
  viewLabel = 'Ver documento',
}: CardShellProps) {
  const [open, setOpen] = useState(false);
  const accent = KIND_ACCENT[kind];
  const Icon = accent.icon;

  return (
    <Card
      className={cn(
        'overflow-hidden transition-shadow hover:shadow-md',
        isAuditOnly && 'border-dashed bg-muted/20',
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3 border-b bg-muted/30 p-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            accent.cls,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium', accent.cls)}>
              {accent.label}
            </span>
            {isAuditOnly && (
              <Badge
                variant="outline"
                className="border-dashed text-xs text-muted-foreground"
              >
                Auditoría · no afecta stock
              </Badge>
            )}
            {headerBadges}
          </div>
          <div className="mt-1 text-base font-semibold leading-tight">{title}</div>
          {subtitle && (
            <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div className="font-mono">
            {new Date(dateIso).toLocaleString('es-CL', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </div>
          {userLabel && <div className="mt-0.5">por {userLabel}</div>}
        </div>
      </div>

      {/* Body — summary + expansion */}
      <CardContent className="space-y-3 p-4 pt-3">
        <div className="text-sm">{summary}</div>

        {open && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
            {expanded}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="-ml-2 text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <>
                <ChevronUp className="mr-1 h-3.5 w-3.5" /> Ocultar detalle
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3.5 w-3.5" /> Ver detalle
              </>
            )}
          </Button>
          {viewHref && (
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={viewHref}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                {viewLabel}
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>

        {footer && <div className="border-t pt-3 text-sm">{footer}</div>}
      </CardContent>
    </Card>
  );
}

// ---------- Helpers compartidos por las cards ----------

export function ItemRow({
  product,
  qty,
  qtyLabel = 'u',
  right,
}: {
  product: { sku: string | null; name: string };
  qty: number;
  qtyLabel?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      <span
        className={cn(
          'inline-flex w-12 shrink-0 justify-end font-mono tabular-nums',
          qty < 0 ? 'text-destructive' : 'text-stock-ok',
        )}
      >
        {qty > 0 ? '+' : ''}
        {qty} {qtyLabel}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{product.name}</span>
        {product.sku && (
          <span className="ml-1.5 text-xs text-muted-foreground">{product.sku}</span>
        )}
      </span>
      {right && <span className="shrink-0 text-right">{right}</span>}
    </div>
  );
}

export function DetailLine({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
