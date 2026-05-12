import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Transfer } from './transfer.entity';

@Entity('transfer_items')
export class TransferItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Transfer, (transfer) => transfer.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'transferId' })
  transfer?: Transfer;

  @Index('idx_transfer_items_transfer')
  @Column({ type: 'char', length: 36 })
  transferId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_transfer_items_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  qty!: number;

  // Costo unitario al momento de la transferencia. Útil para reportes pero
  // NO se usa para cálculos de caja — las transferencias no tocan caja.
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  unitCost!: string | null;
}
