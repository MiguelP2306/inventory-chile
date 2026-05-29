import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductLot } from './product-lot.entity';

/**
 * Registro de CONSUMO de un lote por una salida de stock (venta, devolución
 * a proveedor, transferencia OUT, ajuste negativo, replacement de cambio).
 *
 * Cada salida FIFO puede consumir uno o varios lotes; se inserta una fila por
 * (lote, salida). Guarda la cantidad tomada y el costo unitario del lote
 * congelado al momento del consumo, lo que permite:
 *
 *  - Reversas EXACTAS: al cancelar la venta/transferencia/devolución que
 *    generó el consumo, se restituye `qty` a `remainingQty` del lote original
 *    (marcando `restoredAt`).
 *  - Trazabilidad: de qué lote(s) salió cada unidad y a qué costo.
 *
 * La restitución se resuelve por (refId del documento que revierte + bodega +
 * producto del lote): ver `LotCostService.restore`.
 */
@Entity('lot_consumptions')
export class LotConsumption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProductLot, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'lotId' })
  lot?: ProductLot;

  @Index('idx_lot_consumptions_lot')
  @Column({ type: 'char', length: 36 })
  lotId!: string;

  // Cantidad tomada de este lote por la salida.
  @Column({ type: 'int' })
  qty!: number;

  // Costo unitario del lote al momento del consumo (snapshot).
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitCost!: string;

  // Origen de la salida: 'Sale', 'Return', 'Transfer', 'Adjustment'. Espeja
  // `InventoryMovement.reference`/`refId`.
  @Column({ type: 'varchar', length: 40, nullable: true })
  reference!: string | null;

  @Index('idx_lot_consumptions_ref')
  @Column({ type: 'char', length: 36, nullable: true })
  refId!: string | null;

  // Cuándo se restituyó este consumo (cancelación del documento origen). Null
  // mientras el consumo siga vigente. Un consumo restituido no vuelve a
  // restituirse ni cuenta para el stock.
  @Column({ type: 'datetime', precision: 6, nullable: true })
  restoredAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
