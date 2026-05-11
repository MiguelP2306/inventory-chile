import { Badge } from '@/components/ui/badge';
import type { SaleStatusDto } from '@inventory/shared';

const LABELS: Record<SaleStatusDto, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

const CLASSES: Record<SaleStatusDto, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent',
  PAID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent',
  CANCELLED: 'bg-destructive/15 text-destructive border-transparent line-through',
};

export function SaleStatusBadge({ status }: { status: SaleStatusDto }) {
  return <Badge className={CLASSES[status]}>{LABELS[status]}</Badge>;
}
