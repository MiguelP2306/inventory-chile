import { PaymentMethod } from '@inventory/shared';
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
import { ExpenseCategory } from './expense-category.entity';
import { User } from './user.entity';

/**
 * Gasto manual registrado por el operador (arriendo, transporte, sueldos, etc).
 *
 * Se relaciona 1:1 con `cash_transactions` mediante `cashTxId`. Anular un gasto:
 *   1. Marca `voidedAt` y `voidedById`.
 *   2. Inserta una `cash_transactions` compensatoria (INCOME por el mismo monto)
 *      enlazada por `voidCashTxId`.
 *   3. Marca la transacción original como `isVoided=true`.
 *
 * Editar un gasto (solo en mes actual): actualiza el registro y reescribe la
 * `cash_transaction` correspondiente — todo en transacción.
 */
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_expenses_number', { unique: true })
  @Column({ type: 'varchar', length: 30 })
  number!: string;

  @Index('idx_expenses_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  @ManyToOne(() => ExpenseCategory, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'categoryId' })
  category?: ExpenseCategory;

  @Index('idx_expenses_category')
  @Column({ type: 'char', length: 36 })
  categoryId!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: string;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  // URL relativa al comprobante adjunto (PDF o imagen).
  @Column({ type: 'varchar', length: 500, nullable: true })
  receiptUrl!: string | null;

  // Transacción de caja generada al crear el gasto.
  @Column({ type: 'char', length: 36 })
  cashTxId!: string;

  // Si se anuló: fecha + usuario + transacción compensatoria.
  @Column({ type: 'datetime', precision: 6, nullable: true })
  voidedAt!: Date | null;

  @Column({ type: 'char', length: 36, nullable: true })
  voidedById!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  voidCashTxId!: string | null;

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
