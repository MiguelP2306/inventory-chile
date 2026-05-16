import { HubspotSyncJobStatus } from '@inventory/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

/**
 * Outbox table para sync async a HubSpot (Fase 8.5). Cada cambio en el
 * lifecycle del cliente inserta una fila acá; un cron interno cada 1 min
 * la procesa.
 *
 * Patrón outbox elegido sobre BullMQ/Redis para no sumar Redis al stack —
 * para el volumen de un comercio chico/mediano alcanza y sobra.
 *
 * Idempotente: el worker decide qué hacer en base al estado actual del
 * cliente, no al payload del job. Reintentos múltiples del mismo cliente
 * convergen al mismo resultado en HubSpot.
 */
@Entity('hubspot_sync_jobs')
export class HubspotSyncJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer;

  @Index('idx_hubspot_jobs_customer')
  @Column({ type: 'char', length: 36 })
  customerId!: string;

  @Index('idx_hubspot_jobs_status')
  @Column({
    type: 'enum',
    enum: HubspotSyncJobStatus,
    default: HubspotSyncJobStatus.PENDING,
  })
  status!: HubspotSyncJobStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ type: 'datetime', precision: 6 })
  scheduledAt!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  processedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
