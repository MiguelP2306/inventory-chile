import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Singleton por convención (siempre 1 fila). El ID es UUID para uniformidad.
@Entity('company_settings')
export class CompanySettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  taxId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  quotationFooter!: string | null;

  @Column({ type: 'int', default: 15 })
  defaultValidityDays!: number;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
