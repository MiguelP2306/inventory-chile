import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-agrega `products.universalCode` (lo había dropeado
 * `DropUniversalCodeAndMaxStock_1780000000000`).
 *
 * Vuelve como código identificatorio OPCIONAL y ÚNICO del producto, editable
 * desde el alta/edición y usable en la búsqueda libre y el lookup exacto
 * (scanner). El índice es UNIQUE pero la columna es nullable: MySQL ignora los
 * NULL en índices únicos, así que múltiples productos sin código no chocan.
 */
export class AddUniversalCode_1781000000000 implements MigrationInterface {
  name = 'AddUniversalCode_1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'universalCode'`,
    );
    if (hasColumn.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` ADD COLUMN \`universalCode\` varchar(80) NULL`,
      );
    }
    const idx = await queryRunner.query(
      `SHOW INDEX FROM \`products\` WHERE Key_name = 'idx_products_universal_code'`,
    );
    if (idx.length === 0) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX \`idx_products_universal_code\` ON \`products\` (\`universalCode\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const idx = await queryRunner.query(
      `SHOW INDEX FROM \`products\` WHERE Key_name = 'idx_products_universal_code'`,
    );
    if (idx.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` DROP INDEX \`idx_products_universal_code\``,
      );
    }
    const hasColumn = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'universalCode'`,
    );
    if (hasColumn.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` DROP COLUMN \`universalCode\``,
      );
    }
  }
}
