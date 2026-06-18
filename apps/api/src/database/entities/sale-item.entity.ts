import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Sale } from './sale.entity';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Sale, (sale) => sale.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'saleId' })
  sale?: Sale;

  @Index('idx_sale_items_sale')
  @Column({ type: 'char', length: 36 })
  saleId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_sale_items_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  qty!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discount!: string;

  // Si el operador ingresó el descuento como %, guardamos el % original para
  // reimprimir la nota con la misma representación. El `discount` siempre
  // tiene el monto resuelto.
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  subtotal!: string;

  // Costo unitario CONGELADO al confirmar la venta. Crítico para reportes
  // de rentabilidad históricos cuando el costo del producto cambia luego.
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitCost!: string;

  // Observación libre POR ÍTEM (opcional). Se copia desde la cotización al
  // convertir y se imprime debajo del producto en la nota de venta.
  @Column({ type: 'text', nullable: true })
  observation!: string | null;
}
