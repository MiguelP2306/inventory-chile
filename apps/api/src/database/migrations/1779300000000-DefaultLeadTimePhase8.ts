import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 8 — agregar `defaultLeadTimeDays` a `company_settings`. Usado por la
 * proyección de stock como umbral default para marcar productos críticos:
 * un producto es crítico si su cobertura ≤ defaultLeadTimeDays.
 *
 * Default 75 días: cubre el rango 2-3 meses de importación del cliente.
 */
export class DefaultLeadTimePhase8_1779300000000 implements MigrationInterface {
  name = 'DefaultLeadTimePhase8_1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_settings\` ADD \`defaultLeadTimeDays\` int NOT NULL DEFAULT 75`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_settings\` DROP COLUMN \`defaultLeadTimeDays\``,
    );
  }
}
