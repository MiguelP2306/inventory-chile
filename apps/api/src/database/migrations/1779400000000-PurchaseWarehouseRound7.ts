import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ronda 7 — agregar `warehouseId` a `purchase_entries` para que la bodega
 * destino quede registrada en la compra (antes solo vivía implícita en los
 * movimientos `PURCHASE_IN`).
 *
 * Backfill: cada compra existente toma la bodega de su primer movimiento
 * `PURCHASE_IN`. Si por alguna razón no hay movimientos asociados (datos
 * corruptos), queda NULL — la UI mostrará "—" y se podrá corregir
 * manualmente.
 */
export class PurchaseWarehouseRound7_1779400000000
  implements MigrationInterface
{
  name = 'PurchaseWarehouseRound7_1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` ADD \`warehouseId\` char(36) NULL`,
    );

    // Backfill desde inventory_movements: tomar la bodega del primer
    // PURCHASE_IN ligado a cada entry.
    await queryRunner.query(`
      UPDATE \`purchase_entries\` pe
      SET pe.\`warehouseId\` = (
        SELECT m.\`warehouseId\`
        FROM \`inventory_movements\` m
        WHERE m.\`refId\` = pe.\`id\`
          AND m.\`type\` = 'PURCHASE_IN'
        ORDER BY m.\`createdAt\` ASC
        LIMIT 1
      )
      WHERE pe.\`warehouseId\` IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` ADD CONSTRAINT \`FK_purchase_entries_warehouse\` FOREIGN KEY (\`warehouseId\`) REFERENCES \`warehouses\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX \`idx_purchase_entries_warehouse\` ON \`purchase_entries\` (\`warehouseId\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`idx_purchase_entries_warehouse\` ON \`purchase_entries\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` DROP FOREIGN KEY \`FK_purchase_entries_warehouse\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` DROP COLUMN \`warehouseId\``,
    );
  }
}
