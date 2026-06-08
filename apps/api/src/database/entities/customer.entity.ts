import { CustomerSource, LifecycleStatus } from '@inventory/shared';
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

  // Fase 12 — "Cliente libre" como borrador. Un cliente puede crearse en estado
  // borrador (solo con nombre, sin RUT ni datos completos) y completarse más
  // tarde. Los borradores se ocultan de los listados/selectores normales salvo
  // que se pidan explícitamente.
  @Index('idx_customers_is_draft')
  @Column({ type: 'boolean', default: false })
  isDraft!: boolean;

  // Ronda 9 — RUT opcional para soportar clientes "lite" registrados sólo
  // con WhatsApp. La unicidad sigue vigente (MySQL ignora NULLs en índices
  // únicos). `SalesService.create` valida que el cliente tenga RUT antes
  // de facturar — sin RUT se puede cotizar pero no vender.
  @Index('idx_customers_taxid', { unique: true })
  @Column({ type: 'varchar', length: 60, nullable: true })
  taxId!: string | null;

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

  // ---------- Fase 8.5 — Lead lifecycle ----------

  // Canal por el que llegó el cliente. Indicativo, no afecta lógica.
  @Column({
    type: 'enum',
    enum: CustomerSource,
    default: CustomerSource.OTHER,
  })
  source!: CustomerSource;

  // Teléfono específico para WhatsApp (separado de `phone` para distinguir
  // entre fijo y celular). E.164. Si vacío y se necesita un link wa.me, la
  // capa de presentación puede caer a `phone` como fallback.
  @Index('idx_customers_whatsapp')
  @Column({ type: 'varchar', length: 32, nullable: true })
  whatsappPhone!: string | null;

  @Index('idx_customers_lifecycle')
  @Column({
    type: 'enum',
    enum: LifecycleStatus,
    default: LifecycleStatus.NEW,
  })
  lifecycleStatus!: LifecycleStatus;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastContactAt!: Date | null;

  @Index('idx_customers_next_followup')
  @Column({ type: 'datetime', precision: 6, nullable: true })
  nextFollowUpAt!: Date | null;

  // Solo se llena cuando lifecycleStatus = LOST.
  @Column({ type: 'text', nullable: true })
  lostReason!: string | null;

  // ID del contacto en HubSpot. Se popula tras el primer sync exitoso. Si
  // null + hubspotEnabled=true, el próximo job hace upsert por whatsappPhone
  // o email.
  @Column({ type: 'varchar', length: 64, nullable: true })
  hubspotContactId!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
