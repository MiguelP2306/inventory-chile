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
import { PurchaseEntryItem } from './purchase-entry-item.entity';
import { Supplier } from './supplier.entity';
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

@Entity('purchase_entries')
export class PurchaseEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'supplierId' })
  supplier?: Supplier;

  @Index('idx_purchase_entries_supplier')
  @Column({ type: 'char', length: 36 })
  supplierId!: string;

  // Bodega destino de la entrada de mercadería (Ronda 7). Nullable solo para
  // las filas históricas previas a la migración que no se pudieron backfillear.
  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: Warehouse | null;

  @Index('idx_purchase_entries_warehouse')
  @Column({ type: 'char', length: 36, nullable: true })
  warehouseId!: string | null;

  @Index('idx_purchase_entries_date')
  @Column({ type: 'datetime', precision: 6 })
  date!: Date;

  // Total bruto (con IVA). Suma de los subtotales de los items.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total!: string;

  // Subtotal neto (sin IVA). Calculado al confirmar la compra.
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  subtotal!: string;

  // IVA descompuesto. Calculado o sobreescrito por el operador para coincidir
  // con la factura del proveedor (puede haber redondeos).
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxAmount!: string;

  // URL relativa al archivo de factura adjunto (PDF o imagen).
  @Column({ type: 'varchar', length: 500, nullable: true })
  invoiceUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 36 })
  userId!: string;

  @OneToMany(() => PurchaseEntryItem, (item) => item.entry, { cascade: false })
  items?: PurchaseEntryItem[];

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
