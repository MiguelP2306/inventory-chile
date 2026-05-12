import { Badge } from '@/components/ui/badge';
import type { TransferStatusDto } from '@inventory/shared';

const LABELS: Record<TransferStatusDto, string> = {
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const CLASSES: Record<TransferStatusDto, string> = {
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent',
  CANCELLED: 'bg-destructive/15 text-destructive border-transparent line-through',
};

export function TransferStatusBadge({ status }: { status: TransferStatusDto }) {
  return <Badge className={CLASSES[status]}>{LABELS[status]}</Badge>;
}
