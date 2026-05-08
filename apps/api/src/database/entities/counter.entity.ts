import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Contadores correlativos por (kind, year). Se usan para generar números
 * presentables como `GAS-2026-00012`, `COT-2026-00045`, etc.
 *
 * Acceso atómico: la generación pasa siempre por una transacción que hace
 * `SELECT ... FOR UPDATE` sobre la fila (kind, year), incrementa, y devuelve
 * el nuevo número. Si la fila no existe se crea con `lastNumber = 1`.
 */
@Entity('counters')
export class Counter {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  kind!: string;

  @PrimaryColumn({ type: 'int' })
  year!: number;

  @Column({ type: 'int', default: 0 })
  lastNumber!: number;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;
}
