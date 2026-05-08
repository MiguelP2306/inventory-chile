import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Quotation } from './quotation.entity';

@Entity('quotation_items')
export class QuotationItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Quotation, (q) => q.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'quotationId' })
  quotation?: Quotation;

  @Index('idx_quotation_items_quotation')
  @Column({ type: 'char', length: 36 })
  quotationId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_quotation_items_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  qty!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitPrice!: string;

  // Descuento siempre se guarda como monto resuelto (en CLP). Si el operador
  // ingresó como %, se calcula el monto y `discountPercent` recuerda el %
  // original para imprimirlo en el PDF.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal!: string;
}
