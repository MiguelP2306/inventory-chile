import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PurchaseEntry } from './purchase-entry.entity';

/**
 * Ronda 7 — archivos adjuntos (factura del proveedor) por compra. Una compra
 * puede tener 0..N archivos (PDF, imágenes JPG/PNG/WEBP). Se reemplaza la
 * columna `purchase_entries.invoiceUrl` (que solo soportaba 1) por esta
 * tabla.
 */
@Entity('purchase_invoices')
export class PurchaseInvoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => PurchaseEntry, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'purchaseEntryId' })
  purchaseEntry?: PurchaseEntry;

  @Index('idx_purchase_invoices_entry')
  @Column({ type: 'char', length: 36 })
  purchaseEntryId!: string;

  // URL relativa (`/uploads/purchase-invoices/<file>`).
  @Column({ type: 'varchar', length: 500 })
  url!: string;

  // Nombre interno (UUID + ext) en disco. Útil para borrar el archivo físico.
  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  // Nombre original que subió el operador. Lo mostramos en la UI.
  @Column({ type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType!: string;

  @Column({ type: 'int' })
  size!: number;

  @CreateDateColumn({ type: 'datetime', precision: 6, name: 'uploadedAt' })
  uploadedAt!: Date;
}
