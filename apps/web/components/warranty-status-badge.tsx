import { Badge } from '@/components/ui/badge';
import type { WarrantyStatusDto } from '@inventory/shared';

const LABELS: Record<WarrantyStatusDto, string> = {
  OPEN: 'Abierto',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  RESOLVED: 'Resuelto',
};

const CLASSES: Record<WarrantyStatusDto, string> = {
  OPEN: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent',
  IN_REVIEW: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent',
  APPROVED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent',
  REJECTED: 'bg-destructive/15 text-destructive border-transparent',
  RESOLVED: 'bg-muted text-muted-foreground border-transparent',
};

export function WarrantyStatusBadge({ status }: { status: WarrantyStatusDto }) {
  return <Badge className={CLASSES[status]}>{LABELS[status]}</Badge>;
}
