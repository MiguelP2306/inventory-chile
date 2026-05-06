import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_suppliers_name')
  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
