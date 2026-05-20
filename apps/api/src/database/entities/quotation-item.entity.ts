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

  // Ronda 9 — productId puede ser NULL para "productos temporales" que el
  // operador inventa en el momento de cotizar sin registrarlos en el
  // catálogo. Si es null, los campos `tempProduct*` deben estar presentes
  // y la línea muestra un badge "Temporal" en la UI.
  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'productId' })
  product?: Product | null;

  @Index('idx_quotation_items_product')
  @Column({ type: 'char', length: 36, nullable: true })
  productId!: string | null;

  // Snapshot de datos del producto temporal. Sólo se usan si productId es null.
  @Column({ type: 'varchar', length: 200, nullable: true })
  tempProductName!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  tempProductSku!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  tempProductPartNumber!: string | null;

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
