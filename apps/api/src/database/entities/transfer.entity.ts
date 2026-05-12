import { TransferStatus } from '@inventory/shared';
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
import { TransferItem } from './transfer-item.entity';
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_transfers_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  number!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'fromWarehouseId' })
  fromWarehouse?: Warehouse;

  @Index('idx_transfers_from')
  @Column({ type: 'char', length: 36 })
  fromWarehouseId!: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'toWarehouseId' })
  toWarehouse?: Warehouse;

  @Index('idx_transfers_to')
  @Column({ type: 'char', length: 36 })
  toWarehouseId!: string;

  @Index('idx_transfers_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Index('idx_transfers_status')
  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.COMPLETED })
  status!: TransferStatus;

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

  @OneToMany(() => TransferItem, (item) => item.transfer, { cascade: false })
  items?: TransferItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
