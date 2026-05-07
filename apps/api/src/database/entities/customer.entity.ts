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
import { Commune } from './commune.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_customers_name')
  @Column({ type: 'varchar', length: 180 })
  name!: string;

  // RUT obligatorio y único. Se persiste normalizado: `12345678-9` sin puntos.
  @Index('idx_customers_taxid', { unique: true })
  @Column({ type: 'varchar', length: 60 })
  taxId!: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  email!: string | null;

  // Persistido en formato E.164 (+56912345678).
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  // Dirección desglosada (formato Chile). Las 3 partes son opcionales.
  @Column({ type: 'varchar', length: 200, nullable: true })
  addressStreet!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  addressNumber!: string | null;

  @ManyToOne(() => Commune, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'communeId' })
  commune?: Commune | null;

  @Index('idx_customers_commune')
  @Column({ type: 'char', length: 36, nullable: true })
  communeId!: string | null;

  @Column({ type: 'text', nullable: true })
  internalNotes!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
