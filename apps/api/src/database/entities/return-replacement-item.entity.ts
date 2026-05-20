import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Return } from './return.entity';

/**
 * Item de reemplazo (Ronda 9). Sólo se usa cuando `Return.refundMode = EXCHANGE`.
 * Representa el producto que el cliente se lleva a cambio del que devuelve.
 *
 * El flujo es: al crear la devolución, por cada replacement_item se emite
 * un `SALE_OUT` (descuenta stock). La diferencia bruta entre la suma de
 * replacements y `refundAmount` se persiste en `Return.exchangeDifference`.
 */
@Entity('return_replacement_items')
export class ReturnReplacementItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Return, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'returnId' })
  return?: Return;

  @Index('idx_rri_return')
  @Column({ type: 'char', length: 36 })
  returnId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_rri_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  qty!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  unitCost!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal!: string;
}
