import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { PurchaseEntry } from './purchase-entry.entity';

@Entity('purchase_entry_items')
export class PurchaseEntryItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => PurchaseEntry, (entry) => entry.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'entryId' })
  entry?: PurchaseEntry;

  @Index('idx_purchase_items_entry')
  @Column({ type: 'char', length: 36 })
  entryId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_purchase_items_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  qty!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitCost!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal!: string;
}
