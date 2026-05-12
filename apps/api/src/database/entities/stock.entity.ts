import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Warehouse } from './warehouse.entity';

@Entity('stocks')
@Unique('uniq_stocks_product_warehouse', ['productId', 'warehouseId'])
export class Stock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_stocks_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse;

  @Index('idx_stocks_warehouse')
  @Column({ type: 'char', length: 36 })
  warehouseId!: string;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  // Código de ubicación física DENTRO de esta bodega (pasillo/estante/posición).
  // Reemplaza al campo deprecado `Product.location` (que era global) — cada
  // producto puede tener una ubicación distinta en cada bodega.
  @Column({ type: 'varchar', length: 30, nullable: true })
  locationCode!: string | null;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
