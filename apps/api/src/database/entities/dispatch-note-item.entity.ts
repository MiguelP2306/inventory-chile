import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DispatchNote } from './dispatch-note.entity';
import { Product } from './product.entity';

/**
 * Ítem de una guía de despacho INDEPENDIENTE (origin='INDEPENDENT'). Lleva
 * producto, cantidad y su propio precio: la guía se emite valorizada porque el
 * cliente la usa para cotizar envíos a empresas. Al convertir la guía en venta,
 * la venta hereda estos precios (no vuelve a leer el precio del producto).
 *
 * Las guías con origin='SALE' NO usan esta tabla: leen sus líneas prestadas
 * de la venta origen (sale_items).
 */
@Entity('dispatch_note_items')
export class DispatchNoteItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => DispatchNote, (note) => note.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'dispatchNoteId' })
  dispatchNote?: DispatchNote;

  @Index('idx_dispatch_note_items_note')
  @Column({ type: 'char', length: 36 })
  dispatchNoteId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_dispatch_note_items_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  qty!: number;

  // Precio unitario BRUTO (IVA incluido), en espejo de sale_items.unitPrice.
  // Congelado al emitir la guía: el documento no cambia si luego cambia la
  // lista de precios.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  unitPrice!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discount!: string;

  // (unitPrice * qty) - discount.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal!: string;
}
