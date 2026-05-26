import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 7 — Ventas con caja integrada.
 *
 * Cambios en `sales`:
 * 1. `warehouseId` (char 36, NOT NULL, FK a warehouses ON DELETE RESTRICT).
 *    Backfill con la bodega "Principal" (la única que existe pre-7.5).
 * 2. `cancelledAt` (datetime nullable) — timestamp de la cancelación.
 * 3. `cancelReason` (text nullable) — motivo obligatorio en la UI, pero
 *    permitimos NULL para ventas que ya estaban CANCELLED antes (legacy).
 * 4. `cancelledById` (char 36 nullable, FK a users ON DELETE SET NULL).
 * 5. `notes` (text nullable) — observaciones visibles en el PDF.
 *
 * Cambios en `sale_items`:
 * 6. `discountPercent` (decimal 5,2 nullable) — espejo del campo en
 *    `quotation_items`: si el operador ingresó el descuento como %, lo
 *    guardamos para reimprimir el documento con la misma representación.
 *    El campo `discount` siempre guarda el monto resuelto.
 *
 * El down revierte en orden inverso.
 */
export class SalesPhase71778800000000 implements MigrationInterface {
  name = 'SalesPhase71778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- sales: warehouseId con backfill ----
    // 1a. Agregar columna nullable temporalmente para poder backfillear.
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`warehouseId\` varchar(36) NULL`,
    );

    // 1b. Backfill: tomar el id de la bodega "Principal" o, si no existe, la
    //     primera por orden alfabético. Si la tabla `sales` está vacía (caso
    //     típico del setup fresco antes de correr seeds), el UPDATE es noop
    //     y no necesitamos bodega; saltamos sin fallar. Si hay ventas pero
    //     no hay bodegas, sí es un estado inválido — fallamos con mensaje
    //     claro para que el operador corra `./run.sh db:seed` primero.
    const salesCount = (await queryRunner.query(
      `SELECT COUNT(*) AS count FROM \`sales\``,
    )) as Array<{ count: number | string }>;
    const hasSales = Number(salesCount[0]?.count ?? 0) > 0;

    if (hasSales) {
      const warehouses = (await queryRunner.query(
        `SELECT id FROM warehouses ORDER BY (name = 'Principal') DESC, name ASC LIMIT 1`,
      )) as Array<{ id: string }>;
      if (warehouses.length === 0) {
        throw new Error(
          '[SalesPhase7] Hay ventas existentes pero no hay bodegas configuradas. ' +
            'Corré `./run.sh db:seed` antes de aplicar esta migración.',
        );
      }
      const defaultWarehouseId = warehouses[0]!.id;
      await queryRunner.query(
        `UPDATE \`sales\` SET \`warehouseId\` = ? WHERE \`warehouseId\` IS NULL`,
        [defaultWarehouseId],
      );
    }

    // 1c. Pasar a NOT NULL ahora que está backfilleado.
    await queryRunner.query(
      `ALTER TABLE \`sales\` MODIFY COLUMN \`warehouseId\` varchar(36) NOT NULL`,
    );

    // 1d. FK + índice.
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD CONSTRAINT \`FK_sales_warehouse\`
        FOREIGN KEY (\`warehouseId\`) REFERENCES \`warehouses\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_sales_warehouse\` ON \`sales\` (\`warehouseId\`)`,
    );

    // ---- sales: cancelación ----
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`cancelledAt\` datetime(6) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`cancelReason\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`cancelledById\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD CONSTRAINT \`FK_sales_cancelled_by\`
        FOREIGN KEY (\`cancelledById\`) REFERENCES \`users\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // ---- sales: notas visibles en PDF ----
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`notes\` text NULL`,
    );

    // ---- sale_items: discountPercent ----
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` ADD \`discountPercent\` decimal(5,2) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`sale_items\` DROP COLUMN \`discountPercent\``,
    );
    await queryRunner.query(`ALTER TABLE \`sales\` DROP COLUMN \`notes\``);
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP FOREIGN KEY \`FK_sales_cancelled_by\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP COLUMN \`cancelledById\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP COLUMN \`cancelReason\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP COLUMN \`cancelledAt\``,
    );

    await queryRunner.query(`DROP INDEX \`idx_sales_warehouse\` ON \`sales\``);
    await queryRunner.query(
      `ALTER TABLE \`sales\` DROP FOREIGN KEY \`FK_sales_warehouse\``,
    );
    await queryRunner.query(`ALTER TABLE \`sales\` DROP COLUMN \`warehouseId\``);
  }
}
