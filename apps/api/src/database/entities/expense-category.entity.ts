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

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
