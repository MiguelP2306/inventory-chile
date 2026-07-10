/**
 * Bodega preseleccionada en los formularios y vistas del día a día.
 *
 * El cliente opera desde el mostrador, así que "Tienda" es el punto de partida
 * esperado en ventas, guías, inventario y el bolso. Las compras son la
 * excepción y siguen arrancando en "Bodega": la mercadería importada entra a
 * la bodega, no al mostrador.
 *
 * El ancla es el NOMBRE, no un flag en la tabla. Si algún día se renombra la
 * bodega, el default cae silenciosamente a la primera activa (alfabética). Si
 * eso llega a molestar, el reemplazo es una columna `isDefault` en `warehouses`
 * con un switch en la pantalla de Almacenes.
 */

const PREFERRED_NAME = 'Tienda';

/**
 * Devuelve la bodega que debe venir preseleccionada, o `null` si la lista está
 * vacía. `T` solo necesita tener `name` — sirve tanto para `WarehouseDto` como
 * para las filas enriquecidas con stock del modal del bolso.
 */
export function pickDefaultWarehouse<T extends { name: string }>(
  warehouses: readonly T[],
): T | null {
  if (warehouses.length === 0) return null;
  return warehouses.find((w) => w.name === PREFERRED_NAME) ?? warehouses[0]!;
}
