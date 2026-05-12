import { WarrantyStatus } from '@inventory/shared';
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
import { Customer } from './customer.entity';
import { Product } from './product.entity';
import { Return } from './return.entity';
import { SaleItem } from './sale-item.entity';
import { User } from './user.entity';

/**
 * Reclamo de garantía sobre un ítem específico de una venta. NO afecta stock.
 * Es una bitácora de seguimiento. Cuando la resolución implica cambio o
 * reembolso, el operador hace una devolución por separado y la linkea via
 * `linkedReturnId`.
 */
@Entity('warranty_claims')
export class WarrantyClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_warranty_claims_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  number!: string;

  @ManyToOne(() => SaleItem, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'saleItemId' })
  saleItem?: SaleItem;

  @Index('idx_warranty_claims_sale_item')
  @Column({ type: 'char', length: 36 })
  saleItemId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ type: 'char', length: 36 })
  productId!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer;

  @Index('idx_warranty_claims_customer')
  @Column({ type: 'char', length: 36 })
  customerId!: string;

  @Index('idx_warranty_claims_status')
  @Column({ type: 'enum', enum: WarrantyStatus, default: WarrantyStatus.OPEN })
  status!: WarrantyStatus;

  @Index('idx_warranty_claims_opened_at')
  @Column({ type: 'datetime', precision: 6 })
  openedAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  resolution!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Link opcional a la Devolución que cerró este reclamo (cuando la resolución
  // implicó cambio/reembolso). El operador la crea manualmente desde el
  // detalle del reclamo y el backend setea este id en la misma transacción.
  @ManyToOne(() => Return, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'linkedReturnId' })
  linkedReturn?: Return | null;

  @Column({ type: 'char', length: 36, nullable: true })
  linkedReturnId!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
