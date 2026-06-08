import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 12 — "Clientes libres" como borradores. Agrega `customers.isDraft`
 * (boolean, default false): un cliente puede crearse en estado borrador (solo
 * con nombre) y completarse luego. Los borradores se ocultan de listados y
 * selectores normales salvo que se pidan explícitamente.
 *
 * `ADD COLUMN` idempotente + índice para filtrar rápido por estado.
 */
export class CustomerDraftState_1780400000000 implements MigrationInterface {
  name = 'CustomerDraftState_1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.query(
      `SHOW COLUMNS FROM \`customers\` LIKE 'isDraft'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`customers\` ADD COLUMN \`isDraft\` tinyint NOT NULL DEFAULT 0`,
      );
    }
    const hasIdx = await queryRunner.query(
      `SHOW INDEX FROM \`customers\` WHERE Key_name = 'idx_customers_is_draft'`,
    );
    if (hasIdx.length === 0) {
      await queryRunner.query(
        `CREATE INDEX \`idx_customers_is_draft\` ON \`customers\` (\`isDraft\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasIdx = await queryRunner.query(
      `SHOW INDEX FROM \`customers\` WHERE Key_name = 'idx_customers_is_draft'`,
    );
    if (hasIdx.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`customers\` DROP INDEX \`idx_customers_is_draft\``,
      );
    }
    const hasCol = await queryRunner.query(
      `SHOW COLUMNS FROM \`customers\` LIKE 'isDraft'`,
    );
    if (hasCol.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`customers\` DROP COLUMN \`isDraft\``,
      );
    }
  }
}
