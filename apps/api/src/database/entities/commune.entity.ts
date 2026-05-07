import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Catálogo de comunas chilenas. Seedeadas (346) y prácticamente inmutables —
 * los CRUD del módulo `communes` son solo lectura.
 */
@Entity('communes')
@Index('uniq_communes_name_region', ['name', 'region'], { unique: true })
export class Commune {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_communes_name')
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index('idx_communes_region')
  @Column({ type: 'varchar', length: 120 })
  region!: string;
}
