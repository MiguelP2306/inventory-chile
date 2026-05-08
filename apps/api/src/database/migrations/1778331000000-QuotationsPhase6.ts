import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 6 — Cotizaciones y envío.
 *
 * 1. quotations.customerId pasa a NULLABLE (permite cliente libre con
 *    columnas snapshot). Drop FK existente, modify column, re-add FK.
 * 2. quotations agrega: customerNameSnapshot, customerPhoneSnapshot,
 *    customerEmailSnapshot, customerTaxIdSnapshot.
 * 3. quotations agrega: subtotal (decimal 15,2), taxAmount (decimal 15,2).
 * 4. quotations agrega: publicToken (varchar 64) UNIQUE — usado en el link
 *    público firmado (`/public/quotations/:token`). Backfill con un UUID
 *    aleatorio para filas existentes (deberían ser cero al subir esta fase,
 *    pero la idempotencia lo soporta).
 * 5. quotations agrega: sentAt (datetime nullable) — timestamp del primer
 *    envío (email o WhatsApp). Útil para reportes y auditoría.
 * 6. quotation_items agrega: discountPercent (decimal 5,2 nullable) — el
 *    operador puede ingresar el descuento en monto o en %. La columna
 *    `discount` siempre guarda el monto resuelto; `discountPercent` recuerda
 *    el % original si fue ingresado así (para imprimirlo en el PDF).
 *
 * El down revierte en orden inverso.
 */
export class QuotationsPhase61778331000000 implements MigrationInterface {
  name = 'QuotationsPhase61778331000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1a. Drop FK existente sobre customerId.
    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP FOREIGN KEY \`FK_116e4084cf9a95beea7e502ac0d\``,
    );

    // 1b. Modify customerId a NULLABLE.
    await queryRunner.query(
      `ALTER TABLE \`quotations\` MODIFY COLUMN \`customerId\` varchar(36) NULL`,
    );

    // 1c. Re-add FK con ON DELETE RESTRICT (igual que antes).
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD CONSTRAINT \`FK_quotations_customer\`
        FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // 2. Snapshots de cliente libre (todas opcionales, todas nullable).
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`customerNameSnapshot\` varchar(200) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`customerPhoneSnapshot\` varchar(40) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`customerEmailSnapshot\` varchar(200) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`customerTaxIdSnapshot\` varchar(40) NULL`,
    );

    // 3. Subtotal neto + IVA descompuesto. Se llenan al guardar.
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`subtotal\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`taxAmount\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );

    // 4. publicToken — token firmado para link público. Único, indexado.
    // Se agrega como NULL primero, se backfillea, luego se vuelve NOT NULL.
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`publicToken\` varchar(64) NULL`,
    );
    await queryRunner.query(
      `UPDATE \`quotations\` SET \`publicToken\` = REPLACE(UUID(), '-', '') WHERE \`publicToken\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` MODIFY COLUMN \`publicToken\` varchar(64) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`idx_quotations_public_token\` ON \`quotations\` (\`publicToken\`)`,
    );

    // 5. sentAt para auditoría del primer envío.
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD \`sentAt\` datetime(6) NULL`,
    );

    // 6. discountPercent en items (opcional, recuerda si el descuento fue
    // ingresado como % para imprimirlo así en el PDF).
    await queryRunner.query(
      `ALTER TABLE \`quotation_items\` ADD \`discountPercent\` decimal(5,2) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`quotation_items\` DROP COLUMN \`discountPercent\``,
    );

    await queryRunner.query(`ALTER TABLE \`quotations\` DROP COLUMN \`sentAt\``);

    await queryRunner.query(
      `DROP INDEX \`idx_quotations_public_token\` ON \`quotations\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP COLUMN \`publicToken\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP COLUMN \`taxAmount\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP COLUMN \`subtotal\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP COLUMN \`customerTaxIdSnapshot\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP COLUMN \`customerEmailSnapshot\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP COLUMN \`customerPhoneSnapshot\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP COLUMN \`customerNameSnapshot\``,
    );

    // Revertir customerId a NOT NULL — solo posible si todos tienen valor.
    await queryRunner.query(
      `ALTER TABLE \`quotations\` DROP FOREIGN KEY \`FK_quotations_customer\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` MODIFY COLUMN \`customerId\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`quotations\` ADD CONSTRAINT \`FK_116e4084cf9a95beea7e502ac0d\`
        FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
