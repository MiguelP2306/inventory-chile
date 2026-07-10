import { Badge } from '@/components/ui/badge';
import type { SaleIncidentsDto } from '@inventory/shared';

const CLASSES = {
  return: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-transparent',
  exchange:
    'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-transparent',
  warranty:
    'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-transparent',
};

/**
 * Chips de incidencias posteriores a la venta, para leer el listado sin abrir
 * cada venta. Una venta puede acumular varios: devolución + garantía, por
 * ejemplo. Las devoluciones anuladas no llegan acá (las filtra el backend).
 */
export function SaleIncidentsBadges({
  incidents,
}: {
  incidents: SaleIncidentsDto;
}) {
  const { hasReturn, returnKind, hasExchange, hasWarranty } = incidents;
  if (!hasReturn && !hasExchange && !hasWarranty) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {hasReturn && (
        <Badge className={CLASSES.return}>
          {returnKind === 'FULL' ? 'Devolución total' : 'Devolución parcial'}
        </Badge>
      )}
      {hasExchange && <Badge className={CLASSES.exchange}>Cambio</Badge>}
      {hasWarranty && <Badge className={CLASSES.warranty}>Garantía</Badge>}
    </div>
  );
}
