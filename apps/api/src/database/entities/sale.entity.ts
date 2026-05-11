import { PaymentMethod, SaleStatus } from '@inventory/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { Quotation } from './quotation.entity';
import { SaleItem } from './sale-item.entity';
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_sales_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  number!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer;

  @Index('idx_sales_customer')
  @Column({ type: 'char', length: 36 })
  customerId!: string;

  // Bodega de la que sale el stock. Por ahora siempre "Principal" (única
  // bodega activa hasta Fase 7.5). Schema queda preparado para multi-bodega.
  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse;

  @Index('idx_sales_warehouse')
  @Column({ type: 'char', length: 36 })
  warehouseId!: string;

  @Index('idx_sales_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  // Total bruto (con IVA). Coincide con la suma de items y es lo que paga el cliente.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: string;

  // Subtotal neto (sin IVA). Calculado al confirmar la venta.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal!: string;

  // IVA descompuesto. total - subtotal.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxAmount!: string;

  // Comisión de tarjeta (solo se calcula cuando paymentMethod=CARD).
  // Egreso automático en la misma transacción de la venta.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  commissionAmount!: string;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @Index('idx_sales_status')
  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.PENDING })
  status!: SaleStatus;

  @ManyToOne(() => Quotation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'quotationId' })
  quotation?: Quotation | null;

  @Column({ type: 'char', length: 36, nullable: true })
  quotationId!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: false })
  items?: SaleItem[];

  // Observaciones / notas. Se imprimen al final del PDF de la nota de venta.
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Datos de cancelación (status === 'CANCELLED').
  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelReason!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cancelledById' })
  cancelledBy?: User | null;

  @Column({ type: 'char', length: 36, nullable: true })
  cancelledById!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
