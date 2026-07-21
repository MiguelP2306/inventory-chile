import { ProductKind } from '@inventory/shared';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
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

  // Código identificatorio opcional y único del producto (re-incorporado).
  // El índice es UNIQUE pero la columna es nullable — MySQL ignora los NULL en
  // índices únicos, así que múltiples productos sin código no chocan. Usable en
  // búsqueda libre y lookup exacto (scanner).
  @Index('idx_products_universal_code', { unique: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  universalCode!: string | null;

  @Index('idx_products_name')
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Observación libre del producto. Distinta de `description` (que es comercial
  // y se muestra en catálogo/cotizaciones): la observación es una nota interna
  // del operador. Editable en alta/edición, exportable e importable vía Excel.
  @Column({ type: 'text', nullable: true })
  observation!: string | null;

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

  /**
   * Un "servicio" (ej: envío / flete) es un Product que NO es inventario: no
   * descuenta stock, no tiene lotes ni costo, y su precio se fija libremente en
   * cada venta/cotización. Se modela como Product porque `sale_items.productId`
   * es NOT NULL, así que una línea de venta necesita referenciar un producto
   * real. El comportamiento especial (saltear inventario) se ramifica sobre
   * este flag, NO sobre `productKind` (que es solo clasificación descriptiva).
   *
   * Los servicios se excluyen de stock, inventario, alertas de reposición y del
   * selector normal de productos.
   */
  @Index('idx_products_is_service')
  @Column({ type: 'boolean', default: false })
  isService!: boolean;

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

  // Soft delete (Fase 12). Todo producto puede "eliminarse" sin importar sus
  // relaciones (movimientos, ventas, compras, cotizaciones, garantías, etc.):
  // marcamos `deletedAt` y TypeORM lo excluye automáticamente de TODAS las
  // queries (find/QueryBuilder) sin necesidad de filtrar a mano. Las filas
  // hijas (sale_items, movimientos, ...) conservan su FK intacta, así el
  // histórico no se rompe.
  @DeleteDateColumn({ type: 'datetime', precision: 6, nullable: true })
  deletedAt!: Date | null;
}
