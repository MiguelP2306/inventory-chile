import { Badge } from '@/components/ui/badge';
import type { DispatchStatusDto } from '@inventory/shared';

const LABELS: Record<DispatchStatusDto, string> = {
  ACTIVE: 'Activa',
  VOIDED: 'Anulada',
};

const CLASSES: Record<DispatchStatusDto, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent',
  VOIDED: 'bg-destructive/15 text-destructive border-transparent line-through',
};

export function DispatchStatusBadge({ status }: { status: DispatchStatusDto }) {
  return <Badge className={CLASSES[status]}>{LABELS[status]}</Badge>;
}
