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

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_categories_name')
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent?: Category | null;

  @Index('idx_categories_parent')
  @Column({ type: 'char', length: 36, nullable: true })
  parentId!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
