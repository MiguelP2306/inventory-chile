import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 4 — Clientes (RUT obligatorio + dirección desglosada con catálogo de
 * comunas) + unicidad de RUT en proveedores a nivel DB.
 *
 * Orden de operaciones (con verificación de datos antes de cada cambio
 * destructivo o de constraint):
 *   1. Crear tabla `communes`.
 *   2. Agregar columnas nuevas a `customers` (addressStreet/Number/communeId).
 *   3. Copiar `customers.address` → `customers.addressStreet`.
 *   4. Drop `customers.address`.
 *   5. Validar y subir `customers.taxId` a NOT NULL + UNIQUE.
 *   6. Validar y agregar UNIQUE en `suppliers.taxId`.
 *   7. Agregar FK `customers.communeId` → `communes.id`.
 *
 * El down() revierte en orden inverso.
 */
export class CustomersAndCommunes1778120737933 implements MigrationInterface {
  name = 'CustomersAndCommunes1778120737933';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tabla communes
    await queryRunner.query(`CREATE TABLE \`communes\` (
      \`id\` varchar(36) NOT NULL,
      \`name\` varchar(120) NOT NULL,
      \`region\` varchar(120) NOT NULL,
      INDEX \`idx_communes_name\` (\`name\`),
      INDEX \`idx_communes_region\` (\`region\`),
      UNIQUE INDEX \`uniq_communes_name_region\` (\`name\`, \`region\`),
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB`);

    // 2. Columnas nuevas en customers
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD \`addressStreet\` varchar(200) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD \`addressNumber\` varchar(20) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD \`communeId\` char(36) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_customers_commune\` ON \`customers\` (\`communeId\`)`,
    );

    // 3. Copiar address viejo a addressStreet (si la columna existe).
    const addressCol: Array<{ COLUMN_NAME: string }> = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'address'`,
    );
    if (addressCol.length > 0) {
      await queryRunner.query(
        `UPDATE \`customers\` SET \`addressStreet\` = \`address\` WHERE \`address\` IS NOT NULL AND \`address\` <> ''`,
      );
      // 4. Drop address viejo
      await queryRunner.query(`ALTER TABLE \`customers\` DROP COLUMN \`address\``);
    }

    // 5. Validar y subir taxId a NOT NULL + UNIQUE en customers.
    const customersWithoutTax: Array<{ count: string }> = await queryRunner.query(
      `SELECT COUNT(*) AS count FROM \`customers\` WHERE \`taxId\` IS NULL OR \`taxId\` = ''`,
    );
    if (Number(customersWithoutTax[0]?.count ?? 0) > 0) {
      throw new Error(
        `[Migration] Hay ${customersWithoutTax[0]?.count} cliente(s) sin RUT. ` +
          `Como el RUT pasa a ser obligatorio, completá los datos antes de correr esta migración. ` +
          `Query útil: SELECT id, name FROM customers WHERE taxId IS NULL OR taxId = '';`,
      );
    }
    const customersDupTax: Array<{ taxId: string; count: string }> = await queryRunner.query(
      `SELECT \`taxId\`, COUNT(*) AS count FROM \`customers\` GROUP BY \`taxId\` HAVING COUNT(*) > 1`,
    );
    if (customersDupTax.length > 0) {
      throw new Error(
        `[Migration] Hay clientes con RUT duplicado (${customersDupTax
          .map((r) => r.taxId)
          .join(', ')}). Resolvé antes de correr esta migración.`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE \`customers\` MODIFY \`taxId\` varchar(60) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`idx_customers_taxid\` ON \`customers\` (\`taxId\`)`,
    );

    // 6. Validar y agregar UNIQUE en suppliers.taxId.
    const suppliersDupTax: Array<{ taxId: string; count: string }> = await queryRunner.query(
      `SELECT \`taxId\`, COUNT(*) AS count FROM \`suppliers\`
       WHERE \`taxId\` IS NOT NULL AND \`taxId\` <> ''
       GROUP BY \`taxId\` HAVING COUNT(*) > 1`,
    );
    if (suppliersDupTax.length > 0) {
      throw new Error(
        `[Migration] Hay proveedores con NIT/RUC duplicado (${suppliersDupTax
          .map((r) => r.taxId)
          .join(', ')}). Resolvé antes de correr esta migración.`,
      );
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`idx_suppliers_taxid\` ON \`suppliers\` (\`taxId\`)`,
    );

    // 7. FK customers.communeId → communes.id
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_customers_commune\`
       FOREIGN KEY (\`communeId\`) REFERENCES \`communes\`(\`id\`)
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 7. FK
    await queryRunner.query(
      `ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_customers_commune\``,
    );

    // 6. Unique en suppliers.taxId
    await queryRunner.query(
      `DROP INDEX \`idx_suppliers_taxid\` ON \`suppliers\``,
    );

    // 5. taxId customers vuelve a nullable
    await queryRunner.query(
      `DROP INDEX \`idx_customers_taxid\` ON \`customers\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` MODIFY \`taxId\` varchar(60) NULL`,
    );

    // 4 + 3. Restaurar columna address y volcar addressStreet en ella (best-effort)
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD \`address\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `UPDATE \`customers\` SET \`address\` = \`addressStreet\` WHERE \`addressStreet\` IS NOT NULL`,
    );

    // 2. Drop columnas nuevas
    await queryRunner.query(`DROP INDEX \`idx_customers_commune\` ON \`customers\``);
    await queryRunner.query(`ALTER TABLE \`customers\` DROP COLUMN \`communeId\``);
    await queryRunner.query(`ALTER TABLE \`customers\` DROP COLUMN \`addressNumber\``);
    await queryRunner.query(`ALTER TABLE \`customers\` DROP COLUMN \`addressStreet\``);

    // 1. Drop tabla communes
    await queryRunner.query(`DROP TABLE \`communes\``);
  }
}
