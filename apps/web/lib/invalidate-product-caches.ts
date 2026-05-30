import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalida todas las cachés de React Query que muestran el COSTO de un producto.
 *
 * El costo unitario es autogestionado por el motor de costo ponderado (lotes
 * FIFO) y se recalcula en el backend con cada movimiento de stock
 * (compra/venta/devolución/transferencia/ajuste). Las vistas que muestran ese
 * costo (listado de productos, detalle, buscador/picker y el stock del bolso)
 * leen de cachés que hay que invalidar para que el nuevo costo se vea al
 * instante; si no, queda el valor viejo en pantalla.
 *
 * Llamar en el `onSuccess` de cualquier mutación que mueva stock.
 */
export function invalidateProductCaches(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['product'] });
  qc.invalidateQueries({ queryKey: ['product-picker'] });
  qc.invalidateQueries({ queryKey: ['product-stock'] });
  qc.invalidateQueries({ queryKey: ['products-by-vehicle'] });
}
