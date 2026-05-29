import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Costo ponderado dinámico (Weighted Average Cost + FIFO).
 *
 * Introduce dos tablas:
 *
 *  1. `product_lots` — un lote por cada entrada de stock (compra, apertura,
 *     devolución de cliente, ajuste positivo, transferencia IN). Guarda
 *     cantidad original/restante, costo unitario bruto, origen y fecha (que
 *     define el orden FIFO).
 *  2. `lot_consumptions` — qué lote(s) consumió cada salida y cuánto, para
 *     reversas exactas al cancelar el documento origen.
 *
 * Backfill (apertura): por cada fila de `stocks` con quantity > 0 se crea un
 * lote OPENING con la cantidad actual y el `Product.cost` vigente como costo.
 * Así el stock existente participa del ponderado desde el día uno sin perder
 * el costo de partida. Las ventas históricas NO se tocan (su `unitCost` ya
 * está congelado).
 */
export class WeightedAverageCostLots1780200000000
  implements MigrationInterface
{
  name = 'WeightedAverageCostLots1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- 1. Tabla product_lots ----
    await queryRunner.query(
      `CREATE TABLE \`product_lots\` (
        \`id\` varchar(36) NOT NULL,
        \`productId\` char(36) NOT NULL,
        \`warehouseId\` char(36) NOT NULL,
        \`originalQty\` int NOT NULL,
        \`remainingQty\` int NOT NULL,
        \`unitCost\` decimal(15,2) NOT NULL,
        \`source\` enum('PURCHASE','OPENING','RETURN_IN','TRANSFER_IN','ADJUSTMENT') NOT NULL,
        \`refId\` char(36) NULL,
        \`purchasedAt\` datetime(6) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_lots_product\` (\`productId\`),
        INDEX \`idx_lots_warehouse\` (\`warehouseId\`),
        INDEX \`idx_lots_ref\` (\`refId\`),
        INDEX \`idx_lots_purchased_at\` (\`purchasedAt\`),
        INDEX \`idx_lots_product_warehouse_active\` (\`productId\`, \`warehouseId\`, \`remainingQty\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_lots\` ADD CONSTRAINT \`FK_product_lots_product\`
        FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_lots\` ADD CONSTRAINT \`FK_product_lots_warehouse\`
        FOREIGN KEY (\`warehouseId\`) REFERENCES \`warehouses\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // ---- 2. Tabla lot_consumptions ----
    await queryRunner.query(
      `CREATE TABLE \`lot_consumptions\` (
        \`id\` varchar(36) NOT NULL,
        \`lotId\` char(36) NOT NULL,
        \`qty\` int NOT NULL,
        \`unitCost\` decimal(15,2) NOT NULL,
        \`reference\` varchar(40) NULL,
        \`refId\` char(36) NULL,
        \`restoredAt\` datetime(6) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`idx_lot_consumptions_lot\` (\`lotId\`),
        INDEX \`idx_lot_consumptions_ref\` (\`refId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`lot_consumptions\` ADD CONSTRAINT \`FK_lot_consumptions_lot\`
        FOREIGN KEY (\`lotId\`) REFERENCES \`product_lots\`(\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // ---- 3. Backfill: lote de apertura por cada stock con cantidad > 0 ----
    // UUID() genera un id distinto por fila. El costo es el Product.cost actual
    // (bruto). purchasedAt = ahora; al ser el único lote, el orden FIFO es
    // trivial hasta que entren compras nuevas.
    await queryRunner.query(
      `INSERT INTO \`product_lots\`
        (\`id\`, \`productId\`, \`warehouseId\`, \`originalQty\`, \`remainingQty\`,
         \`unitCost\`, \`source\`, \`refId\`, \`purchasedAt\`, \`createdAt\`)
       SELECT UUID(), s.productId, s.warehouseId, s.quantity, s.quantity,
              p.cost, 'OPENING', NULL, NOW(6), NOW(6)
       FROM \`stocks\` s
       INNER JOIN \`products\` p ON p.id = s.productId
       WHERE s.quantity > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`lot_consumptions\` DROP FOREIGN KEY \`FK_lot_consumptions_lot\``,
    );
    await queryRunner.query(`DROP TABLE \`lot_consumptions\``);
    await queryRunner.query(
      `ALTER TABLE \`product_lots\` DROP FOREIGN KEY \`FK_product_lots_warehouse\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_lots\` DROP FOREIGN KEY \`FK_product_lots_product\``,
    );
    await queryRunner.query(`DROP TABLE \`product_lots\``);
  }
}
