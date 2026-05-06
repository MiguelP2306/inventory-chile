import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vehicle_makes')
export class VehicleMake {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_vehicle_makes_name', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
