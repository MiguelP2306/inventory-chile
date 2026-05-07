import { ProductCodeKind } from '@inventory/shared';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * Códigos adicionales asociados a un producto (Fase 4B). Hoy solo se usa para
 * `COMPATIBLE` — códigos de productos equivalentes/intercambiables que el
 * cliente quiere registrar para que la búsqueda los encuentre.
 *
 * El **código universal** del producto vive en `products.universalCode` como
 * columna directa (un solo universal por producto), no acá.
 *
 * No hay unicidad sobre `code`: dos productos distintos pueden compartir el
 * mismo código compatible (caso típico: dos refacciones equivalentes).
 */
@Entity('product_codes')
export class ProductCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_product_codes_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Index('idx_product_codes_code')
  @Column({ type: 'varchar', length: 80 })
  code!: string;

  @Column({
    type: 'enum',
    enum: Object.values(ProductCodeKind),
    default: ProductCodeKind.COMPATIBLE,
  })
  kind!: ProductCodeKind;
}
