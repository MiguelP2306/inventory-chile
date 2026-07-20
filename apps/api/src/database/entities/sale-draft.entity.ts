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
import { PaymentMethod } from '@inventory/shared';
import { Customer } from './customer.entity';
import { SaleDraftItem } from './sale-draft-item.entity';
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

/**
 * Venta "parkeada": el operador la deja a medias y la retoma después.
 *
 * Vive en su PROPIA tabla, deliberadamente separada de `sales`, por tres
 * razones:
 *
 *  1. `sales` tiene 11 consultas que filtran con lista negra
 *     (`status != CANCELLED`) — dashboard, reporte de ventas y sobre todo el
 *     Reporte de IVA. Un estado nuevo ahí adentro se contaría como venta real
 *     y ensuciaría cifras tributarias en silencio.
 *  2. `sales.number` es UNIQUE y sale de un correlativo pensado para NO tener
 *     saltos. Un borrador descartado dejaría un hueco en la numeración.
 *  3. `customerId` y `paymentMethod` son NOT NULL en `sales`, y un borrador
 *     justamente todavía no los tiene.
 *
 * Un borrador NO toca stock, ni caja, ni el lifecycle del cliente, ni marca
 * cotizaciones como convertidas. Todo eso pasa recién al confirmar la venta.
 *
 * Los borradores son del NEGOCIO, no del vendedor: cualquiera puede retomar
 * uno (mostrador con varios turnos). `userId` es solo autoría, no permiso.
 */
@Entity('sale_drafts')
export class SaleDraft {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Etiqueta libre para reconocerlo en la lista ("Señor del Corolla"). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  label!: string | null;

  // Todo lo de abajo es nullable: un borrador puede estar a medio llenar.
  // `onDelete: 'SET NULL'` en vez de RESTRICT porque un borrador nunca debe
  // impedir borrar un cliente o una bodega.
  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer | null;

  @Index('idx_sale_drafts_customer')
  @Column({ type: 'varchar', length: 36, nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId!: string | null;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod!: PaymentMethod | null;

  @Column({ type: 'boolean', default: false })
  vatExempt!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Descuento sobre el total, mismo par que en `sales`.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent!: string | null;

  /**
   * Total bruto estimado al momento de guardar. Es SOLO para poder mostrar el
   * listado de borradores sin recalcular; la venta real se recalcula entera en
   * el backend al confirmar.
   */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: string;

  // Si el borrador nació convirtiendo una cotización o una guía, guardamos el
  // origen para no perderlo al retomar. Sin FK: si el documento origen
  // desaparece, el borrador sigue siendo utilizable y el backend revalida el
  // vínculo al confirmar.
  @Column({ type: 'varchar', length: 36, nullable: true })
  quotationId!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  dispatchNoteId!: string | null;

  /** Quién lo creó. Informativo: no restringe quién puede retomarlo. */
  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  /** Último que lo tocó, para que la lista muestre quién lo dejó así. */
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updatedById' })
  updatedBy?: User | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById!: string | null;

  @OneToMany(() => SaleDraftItem, (item) => item.draft)
  items?: SaleDraftItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @Index('idx_sale_drafts_updated_at')
  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
