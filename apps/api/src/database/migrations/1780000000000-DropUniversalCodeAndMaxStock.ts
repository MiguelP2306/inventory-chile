import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop `products.universalCode` y `products.maxStock`.
 *
 * Motivos:
 *  - `universalCode` queda obsoleto. La equivalencia entre productos pasa a
 *    cubrirse 100% con `product_codes(kind=COMPATIBLE)`. Tanto la UI de
 *    catálogo como la búsqueda libre, la plantilla de import y los DTOs
 *    dejan de exponerlo.
 *  - `maxStock` no se usa. Toda alerta de inventario funciona sobre
 *    `minStock`. La columna se mantenía por un "por si acaso" que no llegó.
 *
 * El `down()` recrea ambas columnas como nullables — los valores previos
 * NO se restauran (el cliente confirmó que pueden perderse).
 */
export class DropUniversalCodeAndMaxStock_1780000000000
  implements MigrationInterface
{
  name = 'DropUniversalCodeAndMaxStock_1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop el índice antes de la columna (MySQL no lo dropea solo).
    const idx = await queryRunner.query(
      `SHOW INDEX FROM \`products\` WHERE Key_name = 'idx_products_universal_code'`,
    );
    if (idx.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` DROP INDEX \`idx_products_universal_code\``,
      );
    }
    const hasUniversal = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'universalCode'`,
    );
    if (hasUniversal.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` DROP COLUMN \`universalCode\``,
      );
    }

    const hasMax = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'maxStock'`,
    );
    if (hasMax.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` DROP COLUMN \`maxStock\``,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD COLUMN \`maxStock\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD COLUMN \`universalCode\` varchar(80) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_products_universal_code\` ON \`products\` (\`universalCode\`)`,
    );
  }
}
