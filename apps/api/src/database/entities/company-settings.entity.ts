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

  /**
   * @deprecated Desde Ronda 9 la comisión se desdobla por método de pago.
   * Se conserva esta columna para no romper migraciones / código legacy,
   * pero los cálculos nuevos usan `cardDebitCommissionRate`,
   * `cardCreditCommissionRate` y `paymentLinkCommissionRate` según el
   * `paymentMethod` de la venta.
   */
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.025 })
  cardCommissionRate!: string;

  // Ronda 9 — comisión específica de débito. Default 1.5% (Chile típico).
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.015 })
  cardDebitCommissionRate!: string;

  // Ronda 9 — comisión específica de crédito. Default 2.5%.
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.025 })
  cardCreditCommissionRate!: string;

  // Ronda 9 — comisión del agregador cuando el cobro vino por link de pago
  // (WebPay/Khipu/Flow). Default 3.5%.
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.035 })
  paymentLinkCommissionRate!: string;

  // Fase 8 — umbral de días de cobertura para marcar un producto como crítico
  // en /proyeccion. Default 75 días (cubre el lead time 2-3 meses del cliente).
  // La pantalla permite overridearlo por consulta sin tocar este valor.
  @Column({ type: 'int', default: 75 })
  defaultLeadTimeDays!: number;

  // ---------- Fase 8.5 — Seguimiento y HubSpot ----------

  // Horas tras el último contacto para agendar `nextFollowUpAt`. Si el
  // cliente no responde en ese plazo el cron lo mueve a FOLLOW_UP.
  @Column({ type: 'int', default: 48 })
  followUpHoursDefault!: number;

  // Toggle global del sync a HubSpot. Off por default — la integración está
  // implementada pero no llama a la API hasta que el operador la prenda.
  @Column({ type: 'boolean', default: false })
  hubspotEnabled!: boolean;

  // Owner ID en HubSpot al que se asignan los contactos creados. Opcional.
  @Column({ type: 'varchar', length: 64, nullable: true })
  hubspotDefaultOwnerId!: string | null;

  // Plantilla de mensaje usada en los botones WhatsApp de `/seguimiento`.
  // Soporta tokens {cliente}, {cotizacion}, {total}, {link}.
  @Column({ type: 'text', nullable: true })
  whatsappFollowUpTemplate!: string | null;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
