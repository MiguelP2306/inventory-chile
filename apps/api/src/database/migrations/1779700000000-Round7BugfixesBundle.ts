import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ronda 7 — bundle de bugfixes sobre módulos ya entregados.
 *
 * Cambios de schema:
 *
 *  1. **InventoryMovementType** extiende con `RETURN_IN_DAMAGED`. Se usa
 *     cuando una devolución del cliente trae producto dañado: el evento
 *     queda registrado en el historial pero NO modifica `stocks`. Antes la
 *     condición DAMAGED se descartaba silenciosamente y desaparecía de
 *     /inventario/movimientos.
 *
 *  2. **`purchase_invoices`** nueva tabla 1→N para soportar múltiples
 *     archivos por compra (PDF + imágenes). El `invoiceUrl` original en
 *     `purchase_entries` se backfillea como primera fila y luego se quita
 *     la columna — la fuente de verdad pasa a ser la nueva tabla.
 */
export class Round7BugfixesBundle_1779700000000 implements MigrationInterface {
  name = 'Round7BugfixesBundle_1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------- 1. Extender InventoryMovementType --------
    await queryRunner.query(`
      ALTER TABLE \`inventory_movements\`
        MODIFY COLUMN \`type\`
        enum('PURCHASE_IN','SALE_OUT','ADJUSTMENT','RETURN_IN','RETURN_OUT','TRANSFER_OUT','TRANSFER_IN','RETURN_IN_DAMAGED')
        NOT NULL
    `);

    // -------- 2. Crear tabla purchase_invoices --------
    await queryRunner.query(`
      CREATE TABLE \`purchase_invoices\` (
        \`id\` char(36) NOT NULL,
        \`purchaseEntryId\` char(36) NOT NULL,
        \`url\` varchar(500) NOT NULL,
        \`filename\` varchar(255) NOT NULL,
        \`originalName\` varchar(255) NOT NULL,
        \`mimeType\` varchar(120) NOT NULL,
        \`size\` int NOT NULL,
        \`uploadedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_purchase_invoices_entry\` (\`purchaseEntryId\`),
        CONSTRAINT \`fk_purchase_invoices_entry\` FOREIGN KEY (\`purchaseEntryId\`)
          REFERENCES \`purchase_entries\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Backfill: cada `purchase_entries.invoiceUrl` no null pasa a ser un
    // row en la nueva tabla. Como no tenemos los metadatos originales,
    // los rellenamos con valores razonables.
    await queryRunner.query(`
      INSERT INTO \`purchase_invoices\`
        (\`id\`, \`purchaseEntryId\`, \`url\`, \`filename\`, \`originalName\`, \`mimeType\`, \`size\`, \`uploadedAt\`)
      SELECT
        UUID(),
        pe.\`id\`,
        pe.\`invoiceUrl\`,
        SUBSTRING_INDEX(pe.\`invoiceUrl\`, '/', -1),
        SUBSTRING_INDEX(pe.\`invoiceUrl\`, '/', -1),
        CASE
          WHEN pe.\`invoiceUrl\` LIKE '%.pdf' THEN 'application/pdf'
          WHEN pe.\`invoiceUrl\` LIKE '%.png' THEN 'image/png'
          WHEN pe.\`invoiceUrl\` LIKE '%.jpg' OR pe.\`invoiceUrl\` LIKE '%.jpeg' THEN 'image/jpeg'
          WHEN pe.\`invoiceUrl\` LIKE '%.webp' THEN 'image/webp'
          ELSE 'application/octet-stream'
        END,
        0,
        pe.\`createdAt\`
      FROM \`purchase_entries\` pe
      WHERE pe.\`invoiceUrl\` IS NOT NULL AND pe.\`invoiceUrl\` <> ''
    `);

    // Dropear la columna `invoiceUrl` original. La fuente de verdad pasa
    // a ser la nueva tabla 1→N.
    await queryRunner.query(`
      ALTER TABLE \`purchase_entries\` DROP COLUMN \`invoiceUrl\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar `invoiceUrl` (con el primer archivo de cada compra como
    // valor, para no perder la referencia).
    await queryRunner.query(`
      ALTER TABLE \`purchase_entries\`
        ADD COLUMN \`invoiceUrl\` varchar(500) NULL
    `);
    await queryRunner.query(`
      UPDATE \`purchase_entries\` pe
      SET pe.\`invoiceUrl\` = (
        SELECT pi.\`url\` FROM \`purchase_invoices\` pi
        WHERE pi.\`purchaseEntryId\` = pe.\`id\`
        ORDER BY pi.\`uploadedAt\` ASC
        LIMIT 1
      )
    `);
    await queryRunner.query(`DROP TABLE \`purchase_invoices\``);

    // Quitar el valor del enum (mover los registros existentes a RETURN_IN
    // para no perder filas).
    await queryRunner.query(`
      UPDATE \`inventory_movements\`
      SET \`type\` = 'RETURN_IN'
      WHERE \`type\` = 'RETURN_IN_DAMAGED'
    `);
    await queryRunner.query(`
      ALTER TABLE \`inventory_movements\`
        MODIFY COLUMN \`type\`
        enum('PURCHASE_IN','SALE_OUT','ADJUSTMENT','RETURN_IN','RETURN_OUT','TRANSFER_OUT','TRANSFER_IN')
        NOT NULL
    `);
  }
}
