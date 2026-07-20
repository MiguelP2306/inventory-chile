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

  // customerId nullable: permite cliente libre con datos en columnas snapshot.
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer | null;

  @Index('idx_quotations_customer')
  @Column({ type: 'char', length: 36, nullable: true })
  customerId!: string | null;

  // Snapshots usados cuando customerId es NULL (cliente libre). Si hay
  // customerId, estos quedan NULL y se lee del catálogo.
  @Column({ type: 'varchar', length: 200, nullable: true })
  customerNameSnapshot!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  customerPhoneSnapshot!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  customerEmailSnapshot!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  customerTaxIdSnapshot!: string | null;

  @Index('idx_quotations_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  validUntil!: Date | null;

  @Index('idx_quotations_status')
  @Column({ type: 'enum', enum: QuotationStatus, default: QuotationStatus.DRAFT })
  status!: QuotationStatus;

  // Subtotal neto (sin IVA), IVA descompuesto y total bruto.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxAmount!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: string;

  // Descuento sobre el TOTAL del documento (aparte de los descuentos por
  // línea). Se aplica sobre el bruto sumado; el neto y el IVA de arriba ya
  // vienen recalculados sobre el bruto rebajado.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discount!: string;

  // Si el operador lo ingresó como %, queda persistido para reimprimir la
  // cotización con la misma representación. `discount` siempre tiene el monto.
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Token firmado para el link público `/p/cotizacion/:token` (sin auth).
  // El token expira el mismo día que `validUntil`.
  @Index('idx_quotations_public_token', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  publicToken!: string;

  // Timestamp del primer envío exitoso (email o WhatsApp). NULL hasta que
  // pase a SENT por primera vez.
  @Column({ type: 'datetime', precision: 6, nullable: true })
  sentAt!: Date | null;

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
