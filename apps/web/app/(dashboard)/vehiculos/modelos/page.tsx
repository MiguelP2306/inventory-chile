import { redirect } from 'next/navigation';

/**
 * Ronda 9 — el listado global de modelos se consolidó dentro del detalle
 * de cada marca (`/vehiculos/marcas/[id]`). Esta ruta antigua redirige al
 * listado de marcas para preservar deep-links existentes.
 */
export default function VehiculosModelosLegacyPage() {
  redirect('/vehiculos');
}
