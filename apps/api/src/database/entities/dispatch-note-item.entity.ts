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
 * Ítem de una guía de despacho INDEPENDIENTE (origin='INDEPENDENT'). Solo
 * lleva producto + cantidad — la guía independiente es un documento logístico
 * sin precios. Al convertir la guía en venta, el precio se toma del producto
 * en ese momento.
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
}
