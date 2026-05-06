import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { VehicleMake } from './vehicle-make.entity';

@Entity('vehicle_models')
@Unique('uniq_vehicle_models_make_name', ['makeId', 'name'])
export class VehicleModel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => VehicleMake, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'makeId' })
  make?: VehicleMake;

  @Index('idx_vehicle_models_make')
  @Column({ type: 'char', length: 36 })
  makeId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
