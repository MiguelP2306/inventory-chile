import { Badge } from '@/components/ui/badge';
import type { ReturnStatusDto, ReturnTypeDto } from '@inventory/shared';

const STATUS_LABELS: Record<ReturnStatusDto, string> = {
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const STATUS_CLASSES: Record<ReturnStatusDto, string> = {
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent',
  CANCELLED: 'bg-destructive/15 text-destructive border-transparent line-through',
};

export function ReturnStatusBadge({ status }: { status: ReturnStatusDto }) {
  return <Badge className={STATUS_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const TYPE_LABELS: Record<ReturnTypeDto, string> = {
  CUSTOMER: 'De cliente',
  SUPPLIER: 'A proveedor',
};

const TYPE_CLASSES: Record<ReturnTypeDto, string> = {
  CUSTOMER: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent',
  SUPPLIER: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-transparent',
};

export function ReturnTypeBadge({ type }: { type: ReturnTypeDto }) {
  return <Badge className={TYPE_CLASSES[type]}>{TYPE_LABELS[type]}</Badge>;
}
