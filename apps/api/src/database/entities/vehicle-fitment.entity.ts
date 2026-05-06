import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { VehicleModel } from './vehicle-model.entity';

@Entity('vehicle_fitments')
@Index('idx_fitments_product_model', ['productId', 'modelId'])
export class VehicleFitment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ type: 'char', length: 36 })
  productId!: string;

  @ManyToOne(() => VehicleModel, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'modelId' })
  model?: VehicleModel;

  @Column({ type: 'char', length: 36 })
  modelId!: string;

  @Column({ type: 'smallint', unsigned: true, nullable: true })
  yearFrom!: number | null;

  @Column({ type: 'smallint', unsigned: true, nullable: true })
  yearTo!: number | null;
}
