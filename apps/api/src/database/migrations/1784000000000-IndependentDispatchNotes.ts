import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guías de despacho INDEPENDIENTES (guía primero → venta después).
 *
 * Hasta ahora toda guía nacía desde una venta (`saleId` NOT NULL). Este cambio
 * agrega el flujo inverso: crear una guía de cero (con su propio cliente e
 * items) y luego convertirla en venta. El stock NO se mueve al crear la guía;
 * baja recién cuando la guía se convierte en venta.
 *
 * Cambios:
 *  - `dispatch_notes.origin`: enum SALE | INDEPENDENT (default SALE → las guías
 *    existentes quedan como SALE, sin cambio de comportamiento).
 *  - `dispatch_notes.saleId`: pasa a NULL-able. En guías INDEPENDENT arranca en
 *    null y se setea al convertir. La FK sigue RESTRICT.
 *  - `dispatch_notes.customerId`: cliente de la guía independiente (null en SALE).
 *  - `dispatch_note_items`: líneas propias de la guía independiente (producto +
 *    cantidad). Las guías SALE no la usan.
 */
export class IndependentDispatchNotes1784000000000
  implements MigrationInterface
{
  name = 'IndependentDispatchNotes1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. origin
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\`
        ADD \`origin\` enum('SALE', 'INDEPENDENT') NOT NULL DEFAULT 'SALE'`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_dispatch_notes_origin\` ON \`dispatch_notes\` (\`origin\`)`,
    );

    // 2. saleId NULL-able (hay que dropear la FK, alterar la columna y
    //    recrear la FK).
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_sale\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` MODIFY \`saleId\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_sale\`
        FOREIGN KEY (\`saleId\`) REFERENCES \`sales\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // 3. customerId
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD \`customerId\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_dispatch_notes_customer\` ON \`dispatch_notes\` (\`customerId\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_customer\`
        FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // 3b. warehouseId (bodega desde la que la guía independiente descuenta
    //     stock al emitirse).
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD \`warehouseId\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_warehouse\`
        FOREIGN KEY (\`warehouseId\`) REFERENCES \`warehouses\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // 4. dispatch_note_items
    await queryRunner.query(
      `CREATE TABLE \`dispatch_note_items\` (
        \`id\` varchar(36) NOT NULL,
        \`dispatchNoteId\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`qty\` int NOT NULL,
        INDEX \`idx_dispatch_note_items_note\` (\`dispatchNoteId\`),
        INDEX \`idx_dispatch_note_items_product\` (\`productId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_note_items\` ADD CONSTRAINT \`FK_dispatch_note_items_note\`
        FOREIGN KEY (\`dispatchNoteId\`) REFERENCES \`dispatch_notes\`(\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_note_items\` ADD CONSTRAINT \`FK_dispatch_note_items_product\`
        FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dispatch_note_items\` DROP FOREIGN KEY \`FK_dispatch_note_items_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_note_items\` DROP FOREIGN KEY \`FK_dispatch_note_items_note\``,
    );
    await queryRunner.query(`DROP TABLE \`dispatch_note_items\``);

    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_warehouse\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP COLUMN \`warehouseId\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_customer\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_dispatch_notes_customer\` ON \`dispatch_notes\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP COLUMN \`customerId\``,
    );

    // Revertir saleId a NOT NULL (asumiendo que no quedan guías independientes
    // sin convertir; si las hubiera, este down fallaría — es intencional).
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_sale\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` MODIFY \`saleId\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_sale\`
        FOREIGN KEY (\`saleId\`) REFERENCES \`sales\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `DROP INDEX \`idx_dispatch_notes_origin\` ON \`dispatch_notes\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP COLUMN \`origin\``,
    );
  }
}
