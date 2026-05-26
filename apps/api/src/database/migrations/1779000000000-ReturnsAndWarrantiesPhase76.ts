import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 7.6 — Devoluciones y garantías.
 *
 * 1. Tabla `returns` (devoluciones de cliente Y a proveedor con discriminador
 *    `type`). Para devolución de cliente, `saleId` es NOT NULL y `purchaseEntryId`
 *    es NULL. Para devolución a proveedor, al revés. La integridad se valida en
 *    el service (no a nivel CHECK constraint porque MySQL 8 los soporta pero el
 *    schema del proyecto evita CHECK por simplicidad).
 *
 *    Correlativo `DEV-AAAA-NNNNN` único. Estado COMPLETED|CANCELLED + auditoría
 *    de cancelación (timestamp, motivo, usuario).
 *
 * 2. Tabla `return_items` con `condition` enum (RESELLABLE | DAMAGED) que
 *    determina si el RETURN_IN/RETURN_OUT se emite o no. `unitPrice` se
 *    persiste para calcular el reembolso (precio al momento de la venta) y
 *    `unitCost` para reportes de rentabilidad. `saleItemId` y `purchaseEntryItemId`
 *    son nullable según el `type` del return padre.
 *
 * 3. Tabla `warranty_claims` con correlativo `GAR-AAAA-NNNNN` único. Estado
 *    OPEN|IN_REVIEW|APPROVED|REJECTED|RESOLVED. NO afecta stock. Múltiples
 *    reclamos por SaleItem permitidos siempre que solo uno esté abierto a la
 *    vez (validado en service, no constraint DB para flexibilidad histórica).
 *
 * 4. Enum `cash_transactions.source` extendido con `SALE_RETURN` y
 *    `PURCHASE_RETURN` para distinguir reembolsos en el libro de caja.
 *
 * El down revierte en orden inverso.
 */
export class ReturnsAndWarrantiesPhase761779000000000
  implements MigrationInterface
{
  name = 'ReturnsAndWarrantiesPhase761779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- 1. Extender enum cash_transactions.source ----
    await queryRunner.query(
      `ALTER TABLE \`cash_transactions\`
       MODIFY COLUMN \`source\` enum(
         'SALE',
         'PURCHASE',
         'MANUAL',
         'SALE_RETURN',
         'PURCHASE_RETURN'
       ) NOT NULL`,
    );

    // ---- 2. Tabla returns ----
    await queryRunner.query(
      `CREATE TABLE \`returns\` (
        \`id\` varchar(36) NOT NULL,
        \`number\` varchar(40) NOT NULL,
        \`type\` enum('CUSTOMER', 'SUPPLIER') NOT NULL,
        \`saleId\` varchar(36) NULL,
        \`purchaseEntryId\` varchar(36) NULL,
        \`warehouseId\` varchar(36) NOT NULL,
        \`date\` datetime(6) NOT NULL,
        \`reason\` text NOT NULL,
        \`notes\` text NULL,
        \`refundAmount\` decimal(15,2) NOT NULL DEFAULT 0,
        \`paymentMethod\` enum('CASH', 'TRANSFER', 'CARD') NOT NULL,
        \`status\` enum('COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'COMPLETED',
        \`cancelledAt\` datetime(6) NULL,
        \`cancelReason\` text NULL,
        \`cancelledById\` varchar(36) NULL,
        \`userId\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`idx_returns_number\` (\`number\`),
        INDEX \`idx_returns_type\` (\`type\`),
        INDEX \`idx_returns_sale\` (\`saleId\`),
        INDEX \`idx_returns_purchase\` (\`purchaseEntryId\`),
        INDEX \`idx_returns_warehouse\` (\`warehouseId\`),
        INDEX \`idx_returns_date\` (\`date\`),
        INDEX \`idx_returns_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` ADD CONSTRAINT \`FK_returns_sale\`
        FOREIGN KEY (\`saleId\`) REFERENCES \`sales\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` ADD CONSTRAINT \`FK_returns_purchase\`
        FOREIGN KEY (\`purchaseEntryId\`) REFERENCES \`purchase_entries\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` ADD CONSTRAINT \`FK_returns_warehouse\`
        FOREIGN KEY (\`warehouseId\`) REFERENCES \`warehouses\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` ADD CONSTRAINT \`FK_returns_user\`
        FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` ADD CONSTRAINT \`FK_returns_cancelled_by\`
        FOREIGN KEY (\`cancelledById\`) REFERENCES \`users\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // ---- 3. Tabla return_items ----
    await queryRunner.query(
      `CREATE TABLE \`return_items\` (
        \`id\` varchar(36) NOT NULL,
        \`returnId\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`saleItemId\` varchar(36) NULL,
        \`purchaseEntryItemId\` varchar(36) NULL,
        \`qty\` int NOT NULL,
        \`unitPrice\` decimal(15,2) NOT NULL,
        \`unitCost\` decimal(15,2) NOT NULL DEFAULT 0,
        \`subtotal\` decimal(15,2) NOT NULL,
        \`itemCondition\` enum('RESELLABLE', 'DAMAGED') NOT NULL DEFAULT 'RESELLABLE',
        INDEX \`idx_return_items_return\` (\`returnId\`),
        INDEX \`idx_return_items_product\` (\`productId\`),
        INDEX \`idx_return_items_sale_item\` (\`saleItemId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_items\` ADD CONSTRAINT \`FK_return_items_return\`
        FOREIGN KEY (\`returnId\`) REFERENCES \`returns\`(\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_items\` ADD CONSTRAINT \`FK_return_items_product\`
        FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_items\` ADD CONSTRAINT \`FK_return_items_sale_item\`
        FOREIGN KEY (\`saleItemId\`) REFERENCES \`sale_items\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_items\` ADD CONSTRAINT \`FK_return_items_purchase_entry_item\`
        FOREIGN KEY (\`purchaseEntryItemId\`) REFERENCES \`purchase_entry_items\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // ---- 4. Tabla warranty_claims ----
    await queryRunner.query(
      `CREATE TABLE \`warranty_claims\` (
        \`id\` varchar(36) NOT NULL,
        \`number\` varchar(40) NOT NULL,
        \`saleItemId\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`customerId\` varchar(36) NOT NULL,
        \`status\` enum('OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
        \`openedAt\` datetime(6) NOT NULL,
        \`resolvedAt\` datetime(6) NULL,
        \`resolution\` text NULL,
        \`notes\` text NULL,
        \`linkedReturnId\` varchar(36) NULL,
        \`userId\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`idx_warranty_claims_number\` (\`number\`),
        INDEX \`idx_warranty_claims_sale_item\` (\`saleItemId\`),
        INDEX \`idx_warranty_claims_customer\` (\`customerId\`),
        INDEX \`idx_warranty_claims_status\` (\`status\`),
        INDEX \`idx_warranty_claims_opened_at\` (\`openedAt\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` ADD CONSTRAINT \`FK_warranty_claims_sale_item\`
        FOREIGN KEY (\`saleItemId\`) REFERENCES \`sale_items\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` ADD CONSTRAINT \`FK_warranty_claims_product\`
        FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` ADD CONSTRAINT \`FK_warranty_claims_customer\`
        FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` ADD CONSTRAINT \`FK_warranty_claims_user\`
        FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` ADD CONSTRAINT \`FK_warranty_claims_linked_return\`
        FOREIGN KEY (\`linkedReturnId\`) REFERENCES \`returns\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` DROP FOREIGN KEY \`FK_warranty_claims_linked_return\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` DROP FOREIGN KEY \`FK_warranty_claims_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` DROP FOREIGN KEY \`FK_warranty_claims_customer\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` DROP FOREIGN KEY \`FK_warranty_claims_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`warranty_claims\` DROP FOREIGN KEY \`FK_warranty_claims_sale_item\``,
    );
    await queryRunner.query(`DROP TABLE \`warranty_claims\``);

    await queryRunner.query(
      `ALTER TABLE \`return_items\` DROP FOREIGN KEY \`FK_return_items_purchase_entry_item\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_items\` DROP FOREIGN KEY \`FK_return_items_sale_item\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_items\` DROP FOREIGN KEY \`FK_return_items_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`return_items\` DROP FOREIGN KEY \`FK_return_items_return\``,
    );
    await queryRunner.query(`DROP TABLE \`return_items\``);

    await queryRunner.query(
      `ALTER TABLE \`returns\` DROP FOREIGN KEY \`FK_returns_cancelled_by\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` DROP FOREIGN KEY \`FK_returns_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` DROP FOREIGN KEY \`FK_returns_warehouse\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` DROP FOREIGN KEY \`FK_returns_purchase\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`returns\` DROP FOREIGN KEY \`FK_returns_sale\``,
    );
    await queryRunner.query(`DROP TABLE \`returns\``);

    await queryRunner.query(
      `ALTER TABLE \`cash_transactions\`
       MODIFY COLUMN \`source\` enum('SALE', 'PURCHASE', 'MANUAL') NOT NULL`,
    );
  }
}
