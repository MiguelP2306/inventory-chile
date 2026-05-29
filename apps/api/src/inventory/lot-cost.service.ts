import { InventoryMovementType } from '@inventory/shared';
import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  LotConsumption,
  ProductLot,
  ProductLotSource,
} from '../database/entities';

/**
 * Entrada que `LotCostService` necesita para aplicar el efecto de un
 * movimiento de inventario sobre los lotes. Es un subconjunto de
 * `ApplyMovementInput` (mismas claves) — `InventoryService.applyMovement`
 * delega acá DESPUÉS de mutar `stocks`.
 */
export interface LotMovementInput {
  productId: string;
  warehouseId: string;
  type: InventoryMovementType;
  // Cantidad SIGNADA: positiva entrada, negativa salida.
  qty: number;
  unitCost?: string | null;
  reference?: string | null;
  refId?: string | null;
  // Fecha del documento origen — define el orden FIFO del lote creado. Si no
  // se pasa, se usa el momento actual.
  occurredAt?: Date | null;
}

/**
 * Motor de costo ponderado dinámico (Weighted Average Cost) sobre lotes FIFO.
 *
 * Toda mutación de stock pasa por `InventoryService.applyMovement`, que tras
 * actualizar `stocks` llama a `handleMovement` de este servicio. Acá:
 *
 *  - ENTRADAS (qty > 0): se restituyen consumos previos si el movimiento es la
 *    reversa de un documento ya registrado (misma `refId`, producto y bodega);
 *    el remanente que no corresponde a una reversa crea un LOTE nuevo.
 *  - SALIDAS (qty < 0): se consumen lotes en orden FIFO (más antiguos primero),
 *    registrando un `lot_consumptions` por cada lote tocado.
 *  - Tras cualquiera de las dos, se recalcula `Product.cost` = promedio
 *    ponderado de los lotes ACTIVOS (remainingQty > 0) de TODAS las bodegas.
 *
 * No inyecta repositorios: opera siempre sobre el `EntityManager` de la
 * transacción del caller para componerse atómicamente con compras/ventas/etc.
 */
@Injectable()
export class LotCostService {
  private readonly logger = new Logger(LotCostService.name);

  async handleMovement(
    manager: EntityManager,
    input: LotMovementInput,
  ): Promise<void> {
    if (input.qty > 0) {
      await this.handleInflow(manager, input);
    } else if (input.qty < 0) {
      await this.handleOutflow(manager, input);
    }
    await this.recomputeProductCost(manager, input.productId);
  }

  // ---------------- entradas ----------------

  private async handleInflow(
    manager: EntityManager,
    input: LotMovementInput,
  ): Promise<void> {
    let toLot = input.qty;

    // Si el movimiento trae refId puede ser la reversa de una salida previa
    // (cancelación de venta/transferencia/devolución). En ese caso restituimos
    // los consumos originales en vez de crear un lote nuevo. Los ajustes y
    // aperturas (refId nulo) siempre crean lote.
    if (input.refId) {
      const restored = await this.tryRestore(manager, input, input.qty);
      toLot -= restored;
    }

    if (toLot > 0) {
      const unitCost = await this.resolveInflowCost(manager, input);
      const lot = manager.create(ProductLot, {
        productId: input.productId,
        warehouseId: input.warehouseId,
        originalQty: toLot,
        remainingQty: toLot,
        unitCost,
        source: sourceForType(input.type),
        refId: input.refId ?? null,
        purchasedAt: input.occurredAt ?? new Date(),
      });
      await manager.save(lot);
    }
  }

  /**
   * Restituye consumos no revertidos del documento `refId` para este producto
   * y bodega, devolviendo unidades a `remainingQty` de los lotes originales.
   * Restituye en orden inverso al consumo (el último consumido vuelve primero).
   * Devuelve cuántas unidades se restituyeron (≤ qtyNeeded).
   */
  private async tryRestore(
    manager: EntityManager,
    input: LotMovementInput,
    qtyNeeded: number,
  ): Promise<number> {
    const rows: Array<{ id: string; lotId: string; qty: number }> =
      await manager.query(
        `SELECT lc.id AS id, lc.lotId AS lotId, lc.qty AS qty
         FROM lot_consumptions lc
         INNER JOIN product_lots pl ON pl.id = lc.lotId
         WHERE lc.refId = ? AND lc.restoredAt IS NULL
           AND pl.productId = ? AND pl.warehouseId = ?
         ORDER BY lc.createdAt DESC
         FOR UPDATE`,
        [input.refId, input.productId, input.warehouseId],
      );
    if (rows.length === 0) return 0;

    let remaining = qtyNeeded;
    let restored = 0;
    for (const r of rows) {
      if (remaining <= 0) break;
      const consumedQty = Number(r.qty);
      const take = Math.min(remaining, consumedQty);
      await manager.query(
        `UPDATE product_lots SET remainingQty = remainingQty + ? WHERE id = ?`,
        [take, r.lotId],
      );
      if (take === consumedQty) {
        await manager.query(
          `UPDATE lot_consumptions SET restoredAt = NOW(6) WHERE id = ?`,
          [r.id],
        );
      } else {
        // Reversa parcial (no debería ocurrir: las cancelaciones son totales).
        // Reducimos la cantidad del consumo y lo dejamos vigente.
        await manager.query(
          `UPDATE lot_consumptions SET qty = qty - ? WHERE id = ?`,
          [take, r.id],
        );
      }
      remaining -= take;
      restored += take;
    }
    return restored;
  }

  /**
   * Costo de una entrada que crea lote. Usa el `unitCost` provisto (compra,
   * devolución con costo congelado, transferencia). Si no viene, cae al
   * ponderado vigente del producto, y como último recurso 0.
   */
  private async resolveInflowCost(
    manager: EntityManager,
    input: LotMovementInput,
  ): Promise<string> {
    if (input.unitCost != null && input.unitCost !== '') {
      return Number(input.unitCost).toFixed(2);
    }
    const current = await this.currentWeightedCost(manager, input.productId);
    return current ?? '0.00';
  }

  // ---------------- salidas ----------------

  private async handleOutflow(
    manager: EntityManager,
    input: LotMovementInput,
  ): Promise<void> {
    let needed = -input.qty; // positivo

    const lots: Array<{ id: string; remainingQty: number; unitCost: string }> =
      await manager.query(
        `SELECT id, remainingQty, unitCost
         FROM product_lots
         WHERE productId = ? AND warehouseId = ? AND remainingQty > 0
         ORDER BY purchasedAt ASC, createdAt ASC
         FOR UPDATE`,
        [input.productId, input.warehouseId],
      );

    for (const lot of lots) {
      if (needed <= 0) break;
      const avail = Number(lot.remainingQty);
      const take = Math.min(avail, needed);
      await manager.query(
        `UPDATE product_lots SET remainingQty = remainingQty - ? WHERE id = ?`,
        [take, lot.id],
      );
      const consumption = manager.create(LotConsumption, {
        lotId: lot.id,
        qty: take,
        unitCost: lot.unitCost,
        reference: input.reference ?? null,
        refId: input.refId ?? null,
        restoredAt: null,
      });
      await manager.save(consumption);
      needed -= take;
    }

    if (needed > 0) {
      // El stock (ya validado >= 0 por applyMovement) supera a los lotes
      // disponibles: indica un desfase histórico lote/stock. No bloqueamos la
      // operación; el ponderado sigue con los lotes existentes.
      this.logger.warn(
        `Lotes insuficientes para producto ${input.productId} en bodega ${input.warehouseId}: faltaron ${needed} unidades de cobertura FIFO.`,
      );
    }
  }

  // ---------------- ponderado ----------------

  /**
   * Promedio ponderado de los lotes ACTIVOS (todas las bodegas), o null si no
   * hay ninguno.
   *
   * REGLA CLAVE: cada lote pesa por su cantidad ORIGINAL de compra mientras
   * tenga stock (`remainingQty > 0`), NO por lo que le queda. Es decir, un lote
   * comprado de 5 unidades sigue pesando 5 en el ponderado aunque ya se hayan
   * vendido 3 de él; recién cuando se vende la última unidad (remainingQty = 0)
   * el lote se agota y SALE por completo del cálculo.
   *
   * Consecuencia: vender unidades NO cambia el costo unitario hasta que un lote
   * se agota entero; el costo solo se mueve al agotarse un lote o al entrar una
   * compra nueva. El consumo FIFO (lot_consumptions) solo determina CUÁNDO cada
   * lote llega a remainingQty = 0.
   */
  private async currentWeightedCost(
    manager: EntityManager,
    productId: string,
  ): Promise<string | null> {
    const rows: Array<{ num: string | null; den: string | null }> =
      await manager.query(
        `SELECT COALESCE(SUM(originalQty * unitCost), 0) AS num,
                COALESCE(SUM(originalQty), 0) AS den
         FROM product_lots
         WHERE productId = ? AND remainingQty > 0`,
        [productId],
      );
    const num = Number(rows[0]?.num ?? 0);
    const den = Number(rows[0]?.den ?? 0);
    if (den <= 0) return null;
    return (num / den).toFixed(2);
  }

  /**
   * Recalcula `Product.cost` = ponderado de lotes activos. Si no quedan lotes
   * activos (stock 0), deja el costo anterior intacto para no perder la última
   * referencia de costo conocida.
   */
  async recomputeProductCost(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    const weighted = await this.currentWeightedCost(manager, productId);
    if (weighted === null) return;
    await manager.query(`UPDATE products SET cost = ? WHERE id = ?`, [
      weighted,
      productId,
    ]);
  }
}

/** Mapea el tipo de movimiento de entrada al origen del lote. */
function sourceForType(type: InventoryMovementType): ProductLotSource {
  switch (type) {
    case InventoryMovementType.PURCHASE_IN:
      return ProductLotSource.PURCHASE;
    case InventoryMovementType.RETURN_IN:
      return ProductLotSource.RETURN_IN;
    case InventoryMovementType.TRANSFER_IN:
      return ProductLotSource.TRANSFER_IN;
    case InventoryMovementType.ADJUSTMENT:
      return ProductLotSource.ADJUSTMENT;
    default:
      // RETURN_OUT/SALE_OUT/TRANSFER_OUT son salidas; no crean lote. Cualquier
      // otro tipo de entrada inesperado se cataloga como ajuste.
      return ProductLotSource.ADJUSTMENT;
  }
}
