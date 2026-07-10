import { DispatchOrigin, DispatchStatus } from '@inventory/shared';
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
import { Commune } from './commune.entity';
import { Customer } from './customer.entity';
import { DispatchNoteItem } from './dispatch-note-item.entity';
import { Sale } from './sale.entity';
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

/**
 * Guía de despacho — documento operativo para el envío físico de los items
 * de una venta. NO se confunde con la "Nota de venta" (que es el comprobante
 * comercial). La guía lleva información del transporte: transportista,
 * número de tracking, dirección de entrega que puede diferir del cliente.
 *
 * Relación con Sale: una venta puede tener varias filas en `dispatch_notes`
 * a lo largo del tiempo (si la primera tuvo error y se regeneró), pero
 * **solo una activa** simultáneamente. El service valida la regla. Las
 * anuladas preservan correlativo para auditoría.
 */
@Entity('dispatch_notes')
export class DispatchNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_dispatch_notes_number', { unique: true })
  @Column({ type: 'varchar', length: 40 })
  number!: string;

  // Origen de la guía. SALE = generada desde una venta (histórico).
  // INDEPENDENT = creada de cero, sin venta previa.
  @Index('idx_dispatch_notes_origin')
  @Column({
    type: 'enum',
    enum: DispatchOrigin,
    default: DispatchOrigin.SALE,
  })
  origin!: DispatchOrigin;

  // Venta asociada. En guías SALE está desde el inicio. En guías INDEPENDENT
  // arranca en null y se setea cuando la guía se convierte en venta (queda
  // como marca de "convertida").
  @ManyToOne(() => Sale, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'saleId' })
  sale?: Sale | null;

  @Index('idx_dispatch_notes_sale')
  @Column({ type: 'char', length: 36, nullable: true })
  saleId!: string | null;

  // Cliente de la guía INDEPENDENT (en guías SALE se lee de la venta origen y
  // este campo queda null).
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer | null;

  @Index('idx_dispatch_notes_customer')
  @Column({ type: 'char', length: 36, nullable: true })
  customerId!: string | null;

  // Bodega desde la que se descuenta el stock al crear una guía INDEPENDENT
  // (el stock baja al emitir la guía). Null en guías SALE (esas no mueven
  // stock; el SALE_OUT lo hizo la venta). La venta que convierte la guía
  // queda fijada a esta misma bodega.
  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse | null;

  @Column({ type: 'char', length: 36, nullable: true })
  warehouseId!: string | null;

  // Líneas propias de la guía INDEPENDENT (producto + cantidad + precio).
  // Vacío en guías SALE.
  @OneToMany(() => DispatchNoteItem, (item) => item.dispatchNote, {
    cascade: true,
  })
  items?: DispatchNoteItem[];

  // Totales de la guía INDEPENDENT, congelados al emitirla. En guías SALE
  // quedan en 0 y no se usan: esas leen los montos de la venta origen.
  //
  // `total` es bruto (IVA incluido) = suma de los subtotales de las líneas.
  // `subtotal` es el neto y `taxAmount` el IVA descompuesto, igual que la venta.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxAmount!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: string;

  // Guía sin IVA: taxAmount queda en 0 y todo el total es neto.
  @Column({ type: 'boolean', default: false })
  vatExempt!: boolean;

  @Index('idx_dispatch_notes_dispatched_at')
  @Column({ type: 'datetime', precision: 6 })
  dispatchedAt!: Date;

  @Column({ type: 'varchar', length: 120, nullable: true })
  carrier!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  trackingNumber!: string | null;

  // Dirección de entrega: snapshot de los campos del cliente al momento de
  // generar la guía. Editable en el dialog. Si difiere del cliente, queda
  // sólo en esta guía — el cliente no se altera.
  @Column({ type: 'varchar', length: 200, nullable: true })
  addressStreet!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  addressNumber!: string | null;

  @ManyToOne(() => Commune, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'communeId' })
  commune?: Commune | null;

  @Column({ type: 'char', length: 36, nullable: true })
  communeId!: string | null;

  // Notas específicas de la dirección (referencias, indicaciones del repartidor).
  @Column({ type: 'varchar', length: 255, nullable: true })
  addressNotes!: string | null;

  // Observaciones generales del despacho.
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Index('idx_dispatch_notes_status')
  @Column({
    type: 'enum',
    enum: DispatchStatus,
    default: DispatchStatus.ACTIVE,
  })
  status!: DispatchStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  voidedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  voidReason!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'voidedById' })
  voidedBy?: User | null;

  @Column({ type: 'char', length: 36, nullable: true })
  voidedById!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
