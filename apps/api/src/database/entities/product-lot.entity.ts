import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Warehouse } from './warehouse.entity';

/**
 * Costo ponderado dinámico (WAC + FIFO) — un LOTE por cada entrada de stock.
 *
 * Cada compra (y toda otra entrada: apertura, devolución de cliente, ajuste
 * positivo, transferencia IN) crea un lote independiente con su propio costo
 * unitario. Las salidas consumen lotes en orden FIFO (los más antiguos
 * primero) decrementando `remainingQty`; cuando llega a 0 el lote queda
 * agotado y deja de participar en el cálculo del costo ponderado.
 *
 * El costo unitario del producto (`Product.cost`) se recalcula como el
 * promedio ponderado de los lotes ACTIVOS (remainingQty > 0) cada vez que
 * cambia el inventario. Ver `LotCostService`.
 *
 * Los lotes son POR BODEGA (alineado con `Stock`, que es por producto+bodega):
 * FIFO y el ponderado por bodega se calculan sobre los lotes de esa bodega;
 * el `Product.cost` global agrega los lotes activos de todas las bodegas.
 *
 * El historial NUNCA se borra: un lote agotado se conserva con remainingQty=0
 * para trazabilidad, simplemente no participa en el ponderado activo.
 */
export enum ProductLotSource {
  PURCHASE = 'PURCHASE',
  OPENING = 'OPENING',
  RETURN_IN = 'RETURN_IN',
  TRANSFER_IN = 'TRANSFER_IN',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('product_lots')
// Índice compuesto que cubre la query caliente de FIFO: lotes activos de un
// producto en una bodega, ordenados por antigüedad.
@Index('idx_lots_product_warehouse_active', ['productId', 'warehouseId', 'remainingQty'])
export class ProductLot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_lots_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse;

  @Index('idx_lots_warehouse')
  @Column({ type: 'char', length: 36 })
  warehouseId!: string;

  // Cantidad original que ingresó con este lote (inmutable).
  @Column({ type: 'int' })
  originalQty!: number;

  // Cantidad que todavía queda disponible de este lote. Se decrementa con
  // cada salida FIFO; cuando llega a 0 el lote sale del ponderado activo.
  @Column({ type: 'int' })
  remainingQty!: number;

  // Costo unitario BRUTO (incluye IVA, igual que Product.cost) de este lote.
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitCost!: string;

  // Cómo entró el stock de este lote.
  @Column({ type: 'enum', enum: ProductLotSource })
  source!: ProductLotSource;

  // Documento origen (PurchaseEntry.id, Return.id, Transfer.id, etc.). Null
  // para apertura/ajuste sin documento.
  @Index('idx_lots_ref')
  @Column({ type: 'char', length: 36, nullable: true })
  refId!: string | null;

  // Fecha de la compra/entrada — define el orden FIFO. Para apertura es la
  // fecha de la migración; para compras, la fecha del documento.
  @Index('idx_lots_purchased_at')
  @Column({ type: 'datetime', precision: 6 })
  purchasedAt!: Date;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
