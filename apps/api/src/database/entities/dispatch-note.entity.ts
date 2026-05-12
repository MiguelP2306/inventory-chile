import { DispatchStatus } from '@inventory/shared';
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
import { Sale } from './sale.entity';
import { User } from './user.entity';

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

  @ManyToOne(() => Sale, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'saleId' })
  sale?: Sale;

  @Index('idx_dispatch_notes_sale')
  @Column({ type: 'char', length: 36 })
  saleId!: string;

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
