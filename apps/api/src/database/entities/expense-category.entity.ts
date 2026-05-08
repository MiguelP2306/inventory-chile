import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('expense_categories')
export class ExpenseCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_expense_categories_name', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  // Categorías "de sistema" (Comisión Tarjeta, IVA Compra, IVA Venta) — no se
  // pueden eliminar ni renombrar desde la UI porque la lógica automática las
  // referencia por nombre.
  @Column({ type: 'boolean', default: false })
  isSystem!: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
