import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { SaleDraft } from './sale-draft.entity';

/**
 * Línea de una venta parkeada. Espeja `sale_items` salvo por dos cosas:
 *
 *  · NO lleva `unitCost`. El costo se congela al CONFIRMAR la venta, no al
 *    borronearla: si se congelara acá, un borrador viejo reportaría una
 *    rentabilidad calculada con el costo de hace semanas.
 *  · `sortOrder` mantiene el orden en que el operador cargó los productos, así
 *    al retomar el borrador la tabla se ve igual que como la dejó.
 */
@Entity('sale_draft_items')
export class SaleDraftItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SaleDraft, (draft) => draft.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'draftId' })
  draft?: SaleDraft;

  @Index('idx_sale_draft_items_draft')
  @Column({ type: 'varchar', length: 36 })
  draftId!: string;

  // CASCADE y no RESTRICT: un borrador no es un documento contable, así que no
  // debe bloquear el borrado de un producto. Si el producto se elimina, la
  // línea se va con él.
  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_sale_draft_items_product')
  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  @Column({ type: 'int' })
  qty!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent!: string | null;

  @Column({ type: 'text', nullable: true })
  observation!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;
}
