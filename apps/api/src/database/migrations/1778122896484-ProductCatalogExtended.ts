import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 4B — Catálogo extendido. Agrega:
 *   1. `products.universalCode` (varchar 80, nullable, indexado pero NO único —
 *      productos equivalentes pueden compartir universal).
 *   2. `products.productKind` enum (ORIGINAL | ALTERNATIVE), NOT NULL, default
 *      ORIGINAL.
 *   3. Tabla `product_images` (galería con cover + position, CASCADE con
 *      producto).
 *   4. Tabla `product_codes` (códigos compatibles, CASCADE con producto;
 *      enum `kind` extensible para futuros tipos).
 *
 * No agrega `products.imageUrl`: la portada se calcula on-the-fly desde
 * `product_images` (la fila con `isCover = TRUE`).
 */
export class ProductCatalogExtended1778122896484 implements MigrationInterface {
  name = 'ProductCatalogExtended1778122896484';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1 + 2. Columnas en products
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD \`universalCode\` varchar(80) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_products_universal_code\` ON \`products\` (\`universalCode\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD \`productKind\` enum('ORIGINAL', 'ALTERNATIVE') NOT NULL DEFAULT 'ORIGINAL'`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_products_kind\` ON \`products\` (\`productKind\`)`,
    );

    // 3. Tabla product_images
    await queryRunner.query(`CREATE TABLE \`product_images\` (
      \`id\` varchar(36) NOT NULL,
      \`productId\` varchar(36) NOT NULL,
      \`url\` varchar(500) NOT NULL,
      \`isCover\` tinyint NOT NULL DEFAULT 0,
      \`position\` int NOT NULL DEFAULT 0,
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX \`idx_product_images_product\` (\`productId\`),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB`);
    await queryRunner.query(
      `ALTER TABLE \`product_images\` ADD CONSTRAINT \`FK_product_images_product\`
       FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`)
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // 4. Tabla product_codes
    await queryRunner.query(`CREATE TABLE \`product_codes\` (
      \`id\` varchar(36) NOT NULL,
      \`productId\` varchar(36) NOT NULL,
      \`code\` varchar(80) NOT NULL,
      \`kind\` enum('COMPATIBLE') NOT NULL DEFAULT 'COMPATIBLE',
      INDEX \`idx_product_codes_product\` (\`productId\`),
      INDEX \`idx_product_codes_code\` (\`code\`),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB`);
    await queryRunner.query(
      `ALTER TABLE \`product_codes\` ADD CONSTRAINT \`FK_product_codes_product\`
       FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`)
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 4. product_codes
    await queryRunner.query(
      `ALTER TABLE \`product_codes\` DROP FOREIGN KEY \`FK_product_codes_product\``,
    );
    await queryRunner.query(`DROP TABLE \`product_codes\``);

    // 3. product_images
    await queryRunner.query(
      `ALTER TABLE \`product_images\` DROP FOREIGN KEY \`FK_product_images_product\``,
    );
    await queryRunner.query(`DROP TABLE \`product_images\``);

    // 2. productKind
    await queryRunner.query(`DROP INDEX \`idx_products_kind\` ON \`products\``);
    await queryRunner.query(`ALTER TABLE \`products\` DROP COLUMN \`productKind\``);

    // 1. universalCode
    await queryRunner.query(
      `DROP INDEX \`idx_products_universal_code\` ON \`products\``,
    );
    await queryRunner.query(`ALTER TABLE \`products\` DROP COLUMN \`universalCode\``);
  }
}
