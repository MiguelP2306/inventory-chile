import { Badge } from '@/components/ui/badge';
import type { LifecycleStatusDto } from '@inventory/shared';

const LABELS: Record<LifecycleStatusDto, string> = {
  NEW: 'Nuevo',
  QUOTED: 'Cotizado',
  FOLLOW_UP: 'Vencido',
  WON: 'Ganado',
  LOST: 'Perdido',
};

const CLASSES: Record<LifecycleStatusDto, string> = {
  NEW: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-transparent',
  QUOTED:
    'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent',
  FOLLOW_UP:
    'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent',
  WON: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent',
  LOST: 'bg-destructive/15 text-destructive border-transparent',
};

export function LifecycleBadge({
  status,
  className,
}: {
  status: LifecycleStatusDto;
  className?: string;
}) {
  return (
    <Badge className={[CLASSES[status], className].filter(Boolean).join(' ')}>
      {LABELS[status]}
    </Badge>
  );
}
