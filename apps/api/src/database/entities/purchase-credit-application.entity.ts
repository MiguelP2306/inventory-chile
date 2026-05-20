import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PurchaseEntry } from './purchase-entry.entity';
import { SupplierCredit } from './supplier-credit.entity';

/**
 * Aplicación N→1: consumo de un `SupplierCredit` al momento de crear una
 * `PurchaseEntry`. Una compra puede aplicar varios créditos parcialmente,
 * y un crédito puede aplicarse en varias compras hasta agotar el balance.
 *
 * El consumo se materializa en `cash_transactions` como un descuento sobre
 * el egreso original — el monto neto en caja es `total - sum(applications)`.
 */
@Entity('purchase_credit_applications')
export class PurchaseCreditApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => PurchaseEntry, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'purchaseEntryId' })
  purchaseEntry?: PurchaseEntry;

  @Index('idx_pca_purchase')
  @Column({ type: 'char', length: 36 })
  purchaseEntryId!: string;

  @ManyToOne(() => SupplierCredit, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'supplierCreditId' })
  supplierCredit?: SupplierCredit;

  @Index('idx_pca_credit')
  @Column({ type: 'char', length: 36 })
  supplierCreditId!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
