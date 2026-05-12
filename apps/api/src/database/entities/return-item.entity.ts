import { ReturnItemCondition } from '@inventory/shared';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { PurchaseEntryItem } from './purchase-entry-item.entity';
import { Return } from './return.entity';
import { SaleItem } from './sale-item.entity';

@Entity('return_items')
export class ReturnItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Return, (ret) => ret.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'returnId' })
  return?: Return;

  @Index('idx_return_items_return')
  @Column({ type: 'char', length: 36 })
  returnId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_return_items_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  // Solo presente si return.type === CUSTOMER.
  @ManyToOne(() => SaleItem, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'saleItemId' })
  saleItem?: SaleItem | null;

  @Index('idx_return_items_sale_item')
  @Column({ type: 'char', length: 36, nullable: true })
  saleItemId!: string | null;

  // Solo presente si return.type === SUPPLIER.
  @ManyToOne(() => PurchaseEntryItem, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'purchaseEntryItemId' })
  purchaseEntryItem?: PurchaseEntryItem | null;

  @Column({ type: 'char', length: 36, nullable: true })
  purchaseEntryItemId!: string | null;

  @Column({ type: 'int' })
  qty!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitPrice!: string;

  // Costo unitario del producto al momento del movimiento original. Útil para
  // reportes de margen sobre productos devueltos.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  unitCost!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal!: string;

  // Si el producto vino RESELLABLE el sistema emite RETURN_IN/RETURN_OUT.
  // Si vino DAMAGED, NO emite movimiento de stock (pérdida del negocio).
  @Column({
    name: 'itemCondition',
    type: 'enum',
    enum: ReturnItemCondition,
    default: ReturnItemCondition.RESELLABLE,
  })
  itemCondition!: ReturnItemCondition;
}
