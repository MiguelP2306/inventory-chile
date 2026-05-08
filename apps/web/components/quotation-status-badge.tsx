import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { QuotationStatusDto } from '@inventory/shared';

const STATUS_MAP: Record<
  QuotationStatusDto,
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'Borrador',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
  SENT: {
    label: 'Enviada',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent',
  },
  APPROVED: {
    label: 'Aprobada',
    className: 'bg-green-500/15 text-green-700 dark:text-green-300 border-transparent',
  },
  REJECTED: {
    label: 'Rechazada',
    className: 'bg-red-500/15 text-red-700 dark:text-red-300 border-transparent',
  },
  CONVERTED: {
    label: 'Convertida',
    className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-transparent',
  },
  EXPIRED: {
    label: 'Vencida',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent',
  },
};

export function QuotationStatusBadge({
  status,
  className,
}: {
  status: QuotationStatusDto;
  className?: string;
}) {
  const cfg = STATUS_MAP[status];
  return <Badge className={cn(cfg.className, className)}>{cfg.label}</Badge>;
}

export function quotationStatusLabel(status: QuotationStatusDto) {
  return STATUS_MAP[status].label;
}
