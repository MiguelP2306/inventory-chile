import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 7.5 — Multi-bodega y Mercado Libre Full.
 *
 * 1. Extiende `InventoryMovementType` con `TRANSFER_OUT` y `TRANSFER_IN`.
 *    MySQL no permite alterar un enum agregando valores con ALTER COLUMN
 *    directo en TypeORM; usamos MODIFY COLUMN para reescribir la definición
 *    completa del enum.
 * 2. Agrega `Warehouse.isActive` (boolean, default true) para soft-delete.
 *    Las bodegas con movimientos históricos no se pueden borrar (FK RESTRICT),
 *    así que el "delete" desde la UI marca isActive=false. Backfill: todas
 *    las filas existentes quedan activas.
 * 3. Agrega `Stock.locationCode` (varchar 30, nullable). Reemplaza al campo
 *    global `Product.location`. Migración copia los valores de products.location
 *    a stocks.locationCode para los stocks de la bodega "Principal" (única que
 *    existía pre-Fase 7.5). El campo `products.location` queda como deprecated
 *    pero NO se dropea — una próxima migración lo eliminará cuando se confirme
 *    que ningún consumidor lo lee.
 * 4. Crea tabla `transfers` (correlativo TRF-AAAA-NNNNN, from/to warehouse,
 *    fecha, notas, status COMPLETED/CANCELLED, auditoría de cancelación).
 * 5. Crea tabla `transfer_items` (transferId, productId, qty, unitCost).
 * 6. Seedea "Mercado Libre Full" con isActive=false si no existe (idempotente).
 *
 * El down revierte en orden inverso: drop tablas → restaurar enum → drop
 * isActive/locationCode (los datos copiados a locationCode se conservan para
 * que un rollback no pierda info de location).
 */
export class MultiWarehousePhase751778900000000 implements MigrationInterface {
  name = 'MultiWarehousePhase751778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- 1. Extender enum InventoryMovementType ----
    await queryRunner.query(
      `ALTER TABLE \`inventory_movements\`
       MODIFY COLUMN \`type\` enum(
         'PURCHASE_IN',
         'SALE_OUT',
         'ADJUSTMENT',
         'RETURN_IN',
         'RETURN_OUT',
         'TRANSFER_OUT',
         'TRANSFER_IN'
       ) NOT NULL`,
    );

    // ---- 2. Warehouse.isActive ----
    await queryRunner.query(
      `ALTER TABLE \`warehouses\` ADD \`isActive\` tinyint(1) NOT NULL DEFAULT 1`,
    );

    // ---- 3. Stock.locationCode + backfill desde products.location ----
    await queryRunner.query(
      `ALTER TABLE \`stocks\` ADD \`locationCode\` varchar(30) NULL`,
    );

    // Copiar location de cada producto a locationCode del stock en la bodega
    // "Principal" (o la única bodega si por alguna razón se llama distinto).
    // Usamos UPDATE ... JOIN para hacer el backfill en una sola query.
    const principal = (await queryRunner.query(
      `SELECT id FROM warehouses ORDER BY (name = 'Principal') DESC, name ASC LIMIT 1`,
    )) as Array<{ id: string }>;
    if (principal.length > 0 && principal[0]) {
      const principalId = principal[0].id;
      await queryRunner.query(
        `UPDATE \`stocks\` s
         INNER JOIN \`products\` p ON p.id = s.productId
         SET s.locationCode = p.location
         WHERE s.warehouseId = ? AND p.location IS NOT NULL AND p.location <> ''`,
        [principalId],
      );
    }

    // ---- 4. Tabla transfers ----
    await queryRunner.query(
      `CREATE TABLE \`transfers\` (
        \`id\` varchar(36) NOT NULL,
        \`number\` varchar(40) NOT NULL,
        \`fromWarehouseId\` char(36) NOT NULL,
        \`toWarehouseId\` char(36) NOT NULL,
        \`date\` datetime(6) NOT NULL,
        \`notes\` text NULL,
        \`status\` enum('COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'COMPLETED',
        \`cancelledAt\` datetime(6) NULL,
        \`cancelReason\` text NULL,
        \`cancelledById\` char(36) NULL,
        \`userId\` char(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`idx_transfers_number\` (\`number\`),
        INDEX \`idx_transfers_from\` (\`fromWarehouseId\`),
        INDEX \`idx_transfers_to\` (\`toWarehouseId\`),
        INDEX \`idx_transfers_date\` (\`date\`),
        INDEX \`idx_transfers_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfers\` ADD CONSTRAINT \`FK_transfers_from_warehouse\`
        FOREIGN KEY (\`fromWarehouseId\`) REFERENCES \`warehouses\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfers\` ADD CONSTRAINT \`FK_transfers_to_warehouse\`
        FOREIGN KEY (\`toWarehouseId\`) REFERENCES \`warehouses\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfers\` ADD CONSTRAINT \`FK_transfers_user\`
        FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfers\` ADD CONSTRAINT \`FK_transfers_cancelled_by\`
        FOREIGN KEY (\`cancelledById\`) REFERENCES \`users\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // ---- 5. Tabla transfer_items ----
    await queryRunner.query(
      `CREATE TABLE \`transfer_items\` (
        \`id\` varchar(36) NOT NULL,
        \`transferId\` char(36) NOT NULL,
        \`productId\` char(36) NOT NULL,
        \`qty\` int NOT NULL,
        \`unitCost\` decimal(15,2) NULL,
        INDEX \`idx_transfer_items_transfer\` (\`transferId\`),
        INDEX \`idx_transfer_items_product\` (\`productId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfer_items\` ADD CONSTRAINT \`FK_transfer_items_transfer\`
        FOREIGN KEY (\`transferId\`) REFERENCES \`transfers\`(\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfer_items\` ADD CONSTRAINT \`FK_transfer_items_product\`
        FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // ---- 6. Seed: Mercado Libre Full inactiva (idempotente) ----
    await queryRunner.query(
      `INSERT INTO \`warehouses\` (\`id\`, \`name\`, \`address\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
       SELECT UUID(), 'Mercado Libre Full', NULL, 0, NOW(6), NOW(6)
       WHERE NOT EXISTS (SELECT 1 FROM \`warehouses\` WHERE \`name\` = 'Mercado Libre Full')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Quitar Mercado Libre Full solo si fue seedada por esta migración y no
    // tiene movimientos asociados (defensa contra pérdida de datos).
    await queryRunner.query(
      `DELETE FROM \`warehouses\`
       WHERE \`name\` = 'Mercado Libre Full' AND \`isActive\` = 0
         AND NOT EXISTS (SELECT 1 FROM \`inventory_movements\` WHERE \`warehouseId\` = \`warehouses\`.\`id\`)
         AND NOT EXISTS (SELECT 1 FROM \`stocks\` WHERE \`warehouseId\` = \`warehouses\`.\`id\`)
         AND NOT EXISTS (SELECT 1 FROM \`sales\` WHERE \`warehouseId\` = \`warehouses\`.\`id\`)`,
    );

    await queryRunner.query(
      `ALTER TABLE \`transfer_items\` DROP FOREIGN KEY \`FK_transfer_items_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfer_items\` DROP FOREIGN KEY \`FK_transfer_items_transfer\``,
    );
    await queryRunner.query(`DROP TABLE \`transfer_items\``);

    await queryRunner.query(
      `ALTER TABLE \`transfers\` DROP FOREIGN KEY \`FK_transfers_cancelled_by\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfers\` DROP FOREIGN KEY \`FK_transfers_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfers\` DROP FOREIGN KEY \`FK_transfers_to_warehouse\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`transfers\` DROP FOREIGN KEY \`FK_transfers_from_warehouse\``,
    );
    await queryRunner.query(`DROP TABLE \`transfers\``);

    await queryRunner.query(
      `ALTER TABLE \`stocks\` DROP COLUMN \`locationCode\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`warehouses\` DROP COLUMN \`isActive\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`inventory_movements\`
       MODIFY COLUMN \`type\` enum(
         'PURCHASE_IN',
         'SALE_OUT',
         'ADJUSTMENT',
         'RETURN_IN',
         'RETURN_OUT'
       ) NOT NULL`,
    );
  }
}
