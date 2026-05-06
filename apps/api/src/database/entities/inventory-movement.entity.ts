import { InventoryMovementType } from '@inventory/shared';
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
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_movements_product')
  @Column({ type: 'char', length: 36 })
  productId!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse;

  @Index('idx_movements_warehouse')
  @Column({ type: 'char', length: 36 })
  warehouseId!: string;

  @Index('idx_movements_type')
  @Column({ type: 'enum', enum: InventoryMovementType })
  type!: InventoryMovementType;

  // Cantidad signada: positiva para entradas, negativa para salidas.
  @Column({ type: 'int' })
  qty!: number;

  // Costo unitario al momento del movimiento (solo PURCHASE_IN/RETURN_OUT lo usan).
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  unitCost!: string | null;

  // Origen genérico: 'PurchaseEntry', 'Sale', 'Adjustment', etc.
  @Column({ type: 'varchar', length: 40, nullable: true })
  reference!: string | null;

  @Index('idx_movements_ref')
  @Column({ type: 'char', length: 36, nullable: true })
  refId!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @Index('idx_movements_created_at')
  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
