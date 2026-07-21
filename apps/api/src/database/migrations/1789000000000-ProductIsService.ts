import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flag `isService` en productos. Un servicio (ej: envío/flete) es un Product
 * que no toca inventario y con precio libre por venta. Ver product.entity.ts.
 */
export class ProductIsService_1789000000000 implements MigrationInterface {
  name = 'ProductIsService_1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'isService'`,
    );
    if (cols.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\`
           ADD COLUMN \`isService\` tinyint(1) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `CREATE INDEX \`idx_products_is_service\` ON \`products\` (\`isService\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`idx_products_is_service\` ON \`products\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP COLUMN \`isService\``,
    );
  }
}
