import { QuotationStatus } from '@inventory/shared';
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
import { QuotationItem } from './quotation-item.entity';
import { User } from './user.entity';

@Entity('quotations')
export class Quotation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_quotations_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  number!: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer;

  @Index('idx_quotations_customer')
  @Column({ type: 'char', length: 36 })
  customerId!: string;

  @Index('idx_quotations_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  validUntil!: Date | null;

  @Index('idx_quotations_status')
  @Column({ type: 'enum', enum: QuotationStatus, default: QuotationStatus.DRAFT })
  status!: QuotationStatus;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @OneToMany(() => QuotationItem, (item) => item.quotation, { cascade: false })
  items?: QuotationItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
