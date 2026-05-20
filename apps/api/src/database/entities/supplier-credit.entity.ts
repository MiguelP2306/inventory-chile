import { SupplierCreditStatus } from '@inventory/shared';
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
import { Return } from './return.entity';
import { Supplier } from './supplier.entity';
import { User } from './user.entity';

/**
 * Saldo a favor con un proveedor (Ronda 9). Se genera cuando una devolución
 * a proveedor (`type=SUPPLIER`) se cierra con `refundMode=CREDIT` en lugar
 * de recibir dinero. El crédito se aplica como descuento al crear futuras
 * compras al mismo proveedor.
 *
 * Reglas de integridad (enforced en service, no DB):
 *   - `balance` <= `amount` siempre.
 *   - `balance` decrece monotónicamente vía PurchaseCreditApplication.
 *   - Cuando `balance` llega a 0, se marca status=SPENT.
 *   - Si la devolución origen se cancela y el crédito no se usó (balance == amount),
 *     se marca status=VOIDED. Si ya se gastó parcialmente, se rechaza la
 *     cancelación de la devolución con 409.
 */
@Entity('supplier_credits')
export class SupplierCredit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'supplierId' })
  supplier?: Supplier;

  @Index('idx_supplier_credits_supplier')
  @Column({ type: 'char', length: 36 })
  supplierId!: string;

  @ManyToOne(() => Return, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sourceReturnId' })
  sourceReturn?: Return | null;

  @Index('idx_supplier_credits_return')
  @Column({ type: 'char', length: 36, nullable: true })
  sourceReturnId!: string | null;

  // Monto original del crédito al crearlo (== refundAmount de la devolución).
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: string;

  // Balance disponible actual. Se decrementa con cada aplicación.
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  balance!: string;

  @Index('idx_supplier_credits_status')
  @Column({
    type: 'enum',
    enum: SupplierCreditStatus,
    default: SupplierCreditStatus.ACTIVE,
  })
  status!: SupplierCreditStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

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
