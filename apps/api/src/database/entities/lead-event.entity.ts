import { LeadEventType } from '@inventory/shared';
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
import { User } from './user.entity';

/**
 * Bitácora de eventos comerciales que mueven el lifecycle del cliente. Útil
 * para auditoría ("¿por qué este cliente está en FOLLOW_UP?") y para
 * reportes futuros. NO es la fuente de verdad — el estado está en
 * `Customer.lifecycleStatus`.
 */
@Entity('lead_events')
export class LeadEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'customerId' })
  customer?: Customer;

  @Index('idx_lead_events_customer')
  @Column({ type: 'char', length: 36 })
  customerId!: string;

  @Column({ type: 'enum', enum: LeadEventType })
  type!: LeadEventType;

  // Documento que disparó el evento (quotation / sale). Útil para "drill
  // down" desde la auditoría.
  @Column({ type: 'varchar', length: 40, nullable: true })
  refType!: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  refId!: string | null;

  @Index('idx_lead_events_occurred')
  @CreateDateColumn({ name: 'occurredAt', type: 'datetime', precision: 6 })
  occurredAt!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: User | null;

  @Column({ type: 'char', length: 36, nullable: true })
  userId!: string | null;
}
