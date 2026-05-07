import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * Galería de fotos del producto (Fase 4B). Cada producto puede tener N fotos,
 * una marcada como `isCover` (portada). El listado se ordena por `position`.
 *
 * `url` guarda el path relativo `/uploads/products/<uuid>.<ext>` que sirve
 * `ServeStaticModule`. La URL absoluta se compone con `PUBLIC_API_URL` cuando
 * hace falta exponerla a links externos.
 */
@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_product_images_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ type: 'boolean', default: false })
  isCover!: boolean;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
