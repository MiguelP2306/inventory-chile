import { ProductKind } from '@inventory/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Brand } from './brand.entity';
import { Category } from './category.entity';
import { Supplier } from './supplier.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Ronda 9 — SKU opcional. Si el operador no carga uno, el backend genera
  // `AUTO-AAAA-NNNNN` vía `CountersService` para garantizar unicidad. El
  // índice único de MySQL ignora NULL — múltiples NULLs no chocan, pero ese
  // caso no debería ocurrir porque siempre auto-asignamos al crear.
  @Index('idx_products_sku', { unique: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  sku!: string | null;

  @Index('idx_products_part_number')
  @Column({ type: 'varchar', length: 80, nullable: true })
  partNumber!: string | null;

  @Index('idx_products_barcode')
  @Column({ type: 'varchar', length: 80, nullable: true })
  barcode!: string | null;

  @Index('idx_products_name')
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: Category | null;

  @Index('idx_products_category')
  @Column({ type: 'char', length: 36, nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => Brand, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'brandId' })
  brand?: Brand | null;

  @Index('idx_products_brand')
  @Column({ type: 'char', length: 36, nullable: true })
  brandId!: string | null;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'supplierId' })
  supplier?: Supplier | null;

  @Index('idx_products_supplier')
  @Column({ type: 'char', length: 36, nullable: true })
  supplierId!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  cost!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  price!: string;

  @Column({ type: 'int', default: 0 })
  minStock!: number;

  /**
   * @deprecated Desde Fase 7.5 la ubicación es per-bodega vía `Stock.locationCode`.
   * Este campo queda en la tabla para no perder datos históricos pero NO se
   * edita ni se muestra desde la UI. Una futura migración lo dropea cuando
   * sea seguro.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  location!: string | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // ORIGINAL (OEM) o ALTERNATIVE (equivalente / aftermarket). Default ORIGINAL.
  @Index('idx_products_kind')
  @Column({
    type: 'enum',
    enum: Object.values(ProductKind),
    default: ProductKind.ORIGINAL,
  })
  productKind!: ProductKind;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
