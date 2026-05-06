import { UserRole } from '@inventory/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index('idx_users_email', { unique: true })
  @Column({ type: 'varchar', length: 180 })
  email!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.ADMIN })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
