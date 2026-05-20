import { PaymentMethod, RefundMode, ReturnStatus, ReturnType } from '@inventory/shared';
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
import { PurchaseEntry } from './purchase-entry.entity';
import { ReturnItem } from './return-item.entity';
import { Sale } from './sale.entity';
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

/**
 * Devolución de cliente (`type=CUSTOMER`, con `saleId`) o devolución a
 * proveedor (`type=SUPPLIER`, con `purchaseEntryId`). El service valida la
 * integridad: el `saleId` o `purchaseEntryId` correspondiente debe estar
 * presente según el tipo. No usamos CHECK constraint a nivel DB para mantener
 * el schema simple.
 */
@Entity('returns')
export class Return {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_returns_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  number!: string;

  @Index('idx_returns_type')
  @Column({ type: 'enum', enum: ReturnType })
  type!: ReturnType;

  @ManyToOne(() => Sale, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'saleId' })
  sale?: Sale | null;

  @Index('idx_returns_sale')
  @Column({ type: 'char', length: 36, nullable: true })
  saleId!: string | null;

  @ManyToOne(() => PurchaseEntry, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'purchaseEntryId' })
  purchaseEntry?: PurchaseEntry | null;

  @Index('idx_returns_purchase')
  @Column({ type: 'char', length: 36, nullable: true })
  purchaseEntryId!: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse;

  @Index('idx_returns_warehouse')
  @Column({ type: 'char', length: 36 })
  warehouseId!: string;

  @Index('idx_returns_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Monto total que se reembolsa al cliente (o que el proveedor nos reembolsa).
  // Suma de `subtotal` de cada return_item.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  refundAmount!: string;

  // Método del reembolso. Default = método de la venta/compra original, pero
  // el operador puede cambiarlo (ej. venta fue con tarjeta, devuelven efectivo).
  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  // Ronda 9 — modo de reembolso. Default MONEY mantiene comportamiento
  // histórico. CREDIT solo aplica a SUPPLIER (genera SupplierCredit);
  // EXCHANGE solo aplica a CUSTOMER (requiere replacement items).
  @Column({
    type: 'enum',
    enum: RefundMode,
    default: RefundMode.MONEY,
  })
  refundMode!: RefundMode;

  // Si refundMode=CREDIT, apunta al SupplierCredit generado.
  @Column({ type: 'char', length: 36, nullable: true })
  supplierCreditId!: string | null;

  // Si refundMode=EXCHANGE, esta es la diferencia bruta:
  //   = sum(replacement_items.subtotal) - refundAmount.
  // > 0 → cliente paga la diferencia (cash transaction INCOME).
  // < 0 → cliente recibe reembolso (cash transaction EXPENSE).
  // = 0 → sin movimiento de caja.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  exchangeDifference!: string;

  @Index('idx_returns_status')
  @Column({ type: 'enum', enum: ReturnStatus, default: ReturnStatus.COMPLETED })
  status!: ReturnStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelReason!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cancelledById' })
  cancelledBy?: User | null;

  @Column({ type: 'char', length: 36, nullable: true })
  cancelledById!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @OneToMany(() => ReturnItem, (item) => item.return, { cascade: false })
  items?: ReturnItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
