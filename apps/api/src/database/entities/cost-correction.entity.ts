import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';

/**
 * Auditoría de correcciones MANUALES del costo unitario.
 *
 * El costo normalmente es autogestionado (promedio ponderado de los lotes), y
 * un admin solo lo corrige a mano cuando entró mal — típicamente un costo
 * errado cargado por Excel. Como es un dato financiero que afecta rentabilidad
 * y valorización de inventario, cada corrección deja rastro: quién, cuándo, de
 * cuánto a cuánto y por qué.
 */
@Entity('cost_corrections')
export class CostCorrection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Index('idx_cost_corrections_product')
  @Column({ type: 'varchar', length: 36 })
  productId!: string;

  /** Costo del producto ANTES de la corrección (el ponderado errado). */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  previousCost!: string;

  /** Costo que el admin fijó. Se aplica a los lotes activos. */
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  newCost!: string;

  /** Motivo obligatorio (por qué el costo estaba mal). */
  @Column({ type: 'text' })
  reason!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
