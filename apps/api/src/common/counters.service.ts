import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Counter } from '../database/entities';

/**
 * Genera correlativos atómicos para documentos (gastos, cotizaciones, ventas,
 * guías). Toma un row lock con `SELECT ... FOR UPDATE` para evitar saltos en
 * concurrencia.
 *
 * El callsite es responsable de pasar un `EntityManager` cuando ya está dentro
 * de una transacción (caso típico). Si no lo pasa, abrimos una transacción
 * acotada al incremento del contador.
 */
@Injectable()
export class CountersService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async nextNumber(
    kind: string,
    year: number,
    manager?: EntityManager,
  ): Promise<number> {
    if (manager) return this.advance(manager, kind, year);

    return this.ds.transaction(async (m) => this.advance(m, kind, year));
  }

  private async advance(
    manager: EntityManager,
    kind: string,
    year: number,
  ): Promise<number> {
    const repo = manager.getRepository(Counter);
    // Lock pesimista por (kind, year). Si la fila no existe, la creamos en 0.
    const existing = await repo
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.kind = :kind AND c.year = :year', { kind, year })
      .getOne();

    if (!existing) {
      // Insertamos atómicamente. Si dos requests entran a la vez, una gana
      // por la PK y la otra reintenta vía el lock arriba en una vuelta.
      await manager.query(
        `INSERT INTO counters (\`kind\`, \`year\`, \`lastNumber\`, \`updatedAt\`)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP(6))
         ON DUPLICATE KEY UPDATE \`lastNumber\` = \`lastNumber\` + 1, \`updatedAt\` = CURRENT_TIMESTAMP(6)`,
        [kind, year],
      );
      const reread = await repo.findOne({ where: { kind, year } });
      return reread?.lastNumber ?? 1;
    }

    existing.lastNumber += 1;
    await repo.save(existing);
    return existing.lastNumber;
  }

  /**
   * Helper para formatear números correlativos como `<PREFIX>-<YEAR>-<NNNNN>`.
   */
  static format(prefix: string, year: number, n: number, pad = 5): string {
    return `${prefix}-${year}-${String(n).padStart(pad, '0')}`;
  }
}
