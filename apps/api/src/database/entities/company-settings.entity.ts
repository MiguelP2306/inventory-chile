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

  // Tasa de IVA aplicada a ventas y compras. Default 19% Chile.
  // Almacenamos como decimal(5,4) para soportar tasas con hasta 4 decimales.
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.19 })
  taxRate!: string;

  // Comisión que el agregador de tarjeta cobra al comerciante. Se descuenta
  // automáticamente como egreso de caja al confirmar una venta con CARD.
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.025 })
  cardCommissionRate!: string;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
