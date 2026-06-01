import { redirect } from 'next/navigation';

/**
 * /vehiculos/modelos (legacy) — sin UI.
 *
 * El listado global de modelos se consolidó dentro del detalle de cada marca
 * (`/vehiculos/marcas/[id]`). Esta ruta antigua sólo redirige al listado de
 * marcas para preservar deep-links existentes. NO tiene UI que rediseñar — se
 * incluye sin cambios para que el set quede completo.
 */
export default function VehiculosModelosLegacyPage() {
  redirect('/vehiculos');
}
