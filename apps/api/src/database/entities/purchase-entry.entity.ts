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
import { PurchaseEntryItem } from './purchase-entry-item.entity';
import { Supplier } from './supplier.entity';
import { User } from './user.entity';

@Entity('purchase_entries')
export class PurchaseEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'supplierId' })
  supplier?: Supplier;

  @Index('idx_purchase_entries_supplier')
  @Column({ type: 'char', length: 36 })
  supplierId!: string;

  @Index('idx_purchase_entries_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @OneToMany(() => PurchaseEntryItem, (item) => item.entry, { cascade: false })
  items?: PurchaseEntryItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
