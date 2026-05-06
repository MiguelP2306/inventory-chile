import {
  CashTransactionSource,
  CashTransactionType,
  PaymentMethod,
} from '@inventory/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExpenseCategory } from './expense-category.entity';
import { User } from './user.entity';

@Entity('cash_transactions')
export class CashTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_cash_tx_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  @Index('idx_cash_tx_type')
  @Column({ type: 'enum', enum: CashTransactionType })
  type!: CashTransactionType;

  @Index('idx_cash_tx_source')
  @Column({ type: 'enum', enum: CashTransactionSource })
  source!: CashTransactionSource;

  // ID del documento origen (Sale.id, PurchaseEntry.id) cuando source != MANUAL.
  // No es FK porque apunta a tablas distintas según source.
  @Column({ type: 'char', length: 36, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ManyToOne(() => ExpenseCategory, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'expenseCategoryId' })
  expenseCategory?: ExpenseCategory | null;

  @Column({ type: 'char', length: 36, nullable: true })
  expenseCategoryId!: string | null;

  // Si se compensa una venta/compra cancelada, marcamos la transacción original
  // como anulada y creamos una contrapartida con monto negativo.
  @Column({ type: 'boolean', default: false })
  isVoided!: boolean;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
