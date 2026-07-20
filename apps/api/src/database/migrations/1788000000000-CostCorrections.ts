import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría de correcciones manuales del costo unitario de un producto.
 * Ver `cost-correction.entity.ts`.
 */
export class CostCorrections_1788000000000 implements MigrationInterface {
  name = 'CostCorrections_1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.query(`SHOW TABLES LIKE 'cost_corrections'`);
    if (has.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE \`cost_corrections\` (
        \`id\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`previousCost\` decimal(15,2) NOT NULL,
        \`newCost\` decimal(15,2) NOT NULL,
        \`reason\` text NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_cost_corrections_product\` (\`productId\`),
        CONSTRAINT \`fk_cost_corrections_product\` FOREIGN KEY (\`productId\`)
          REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_cost_corrections_user\` FOREIGN KEY (\`userId\`)
          REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`cost_corrections\``);
  }
}
