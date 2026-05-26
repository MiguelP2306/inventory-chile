import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 5 — Caja, gastos, IVA y comisiones.
 *
 * 1. expense_categories.isSystem (BOOL DEFAULT 0).
 * 2. company_settings.taxRate (DECIMAL(5,4) DEFAULT 0.1900) +
 *    company_settings.cardCommissionRate (DECIMAL(5,4) DEFAULT 0.0250).
 * 3. purchase_entries.subtotal / taxAmount / invoiceUrl.
 * 4. sales.subtotal / taxAmount / commissionAmount.
 * 5. Tabla `expenses` (gastos manuales con correlativo + anulación).
 * 6. Tabla `counters` (contadores correlativos por kind/year).
 * 7. Backfill:
 *    a. Categorías de sistema: IVA Compra, IVA Venta, Comisión Tarjeta
 *       (insertadas con isSystem=1 si no existen).
 *    b. Existentes (Arriendo, Transporte, etc.) quedan con isSystem=0.
 *    c. purchase_entries existentes:
 *       - subtotal = total / 1.19
 *       - taxAmount = total - subtotal
 *       - se inserta una cash_transactions(EXPENSE, source=PURCHASE) por cada
 *         compra que no tenga aún una transacción asociada (idempotente).
 */
export class CashboxAndTaxes1778230000000 implements MigrationInterface {
  name = 'CashboxAndTaxes1778230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. expense_categories.isSystem
    await queryRunner.query(
      `ALTER TABLE \`expense_categories\` ADD \`isSystem\` tinyint NOT NULL DEFAULT 0`,
    );

    // 2. company_settings.taxRate / cardCommissionRate
    await queryRunner.query(
      `ALTER TABLE \`company_settings\` ADD \`taxRate\` decimal(5,4) NOT NULL DEFAULT '0.1900'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_settings\` ADD \`cardCommissionRate\` decimal(5,4) NOT NULL DEFAULT '0.0250'`,
    );

    // 3. purchase_entries: subtotal / taxAmount / invoiceUrl
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` ADD \`subtotal\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` ADD \`taxAmount\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` ADD \`invoiceUrl\` varchar(500) NULL`,
    );

    // 4. sales: subtotal / taxAmount / commissionAmount
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`subtotal\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`taxAmount\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`sales\` ADD \`commissionAmount\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
    );

    // 5. Tabla expenses
    await queryRunner.query(
      `CREATE TABLE \`expenses\` (
        \`id\` varchar(36) NOT NULL,
        \`number\` varchar(30) NOT NULL,
        \`date\` datetime(6) NOT NULL,
        \`categoryId\` varchar(36) NOT NULL,
        \`amount\` decimal(15,2) NOT NULL,
        \`paymentMethod\` enum ('CASH', 'TRANSFER', 'CARD') NOT NULL,
        \`description\` varchar(255) NOT NULL,
        \`receiptUrl\` varchar(500) NULL,
        \`cashTxId\` varchar(36) NOT NULL,
        \`voidedAt\` datetime(6) NULL,
        \`voidedById\` varchar(36) NULL,
        \`voidCashTxId\` varchar(36) NULL,
        \`userId\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`idx_expenses_number\` (\`number\`),
        INDEX \`idx_expenses_date\` (\`date\`),
        INDEX \`idx_expenses_category\` (\`categoryId\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_expenses_category\`
        FOREIGN KEY (\`categoryId\`) REFERENCES \`expense_categories\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`expenses\` ADD CONSTRAINT \`FK_expenses_user\`
        FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // 6. Tabla counters
    await queryRunner.query(
      `CREATE TABLE \`counters\` (
        \`kind\` varchar(40) NOT NULL,
        \`year\` int NOT NULL,
        \`lastNumber\` int NOT NULL DEFAULT 0,
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`kind\`, \`year\`)
      ) ENGINE=InnoDB`,
    );

    // 7a. Categorías de gasto base (mantienen isSystem=0).
    const baseCategories = [
      'Arriendo',
      'Transporte',
      'Publicidad',
      'Servicios',
      'Sueldos',
      'Otros',
    ];
    for (const name of baseCategories) {
      await queryRunner.query(
        `INSERT INTO \`expense_categories\` (\`id\`, \`name\`, \`isSystem\`)
         SELECT UUID(), ?, 0
         WHERE NOT EXISTS (SELECT 1 FROM \`expense_categories\` WHERE \`name\` = ?)`,
        [name, name],
      );
    }

    // 7b. Categorías de sistema (no editables/borrables desde la UI).
    const systemCategories = ['IVA Compra', 'IVA Venta', 'Comisión Tarjeta'];
    for (const name of systemCategories) {
      await queryRunner.query(
        `INSERT INTO \`expense_categories\` (\`id\`, \`name\`, \`isSystem\`)
         SELECT UUID(), ?, 1
         WHERE NOT EXISTS (SELECT 1 FROM \`expense_categories\` WHERE \`name\` = ?)`,
        [name, name],
      );
    }
    // Si ya existían, asegurar el flag isSystem=1.
    await queryRunner.query(
      `UPDATE \`expense_categories\` SET \`isSystem\` = 1
       WHERE \`name\` IN ('IVA Compra', 'IVA Venta', 'Comisión Tarjeta')`,
    );

    // 7c. Backfill IVA breakdown en compras existentes (asume tasa 19% Chile).
    await queryRunner.query(
      `UPDATE \`purchase_entries\`
       SET \`subtotal\` = ROUND(\`total\` / 1.19, 2),
           \`taxAmount\` = ROUND(\`total\` - (\`total\` / 1.19), 2)
       WHERE \`subtotal\` = 0 AND \`taxAmount\` = 0`,
    );

    // 7d. Backfill cash_transactions para compras sin transacción asociada.
    // Idempotente: filtra por sourceId para no duplicar.
    await queryRunner.query(
      `INSERT INTO \`cash_transactions\`
        (\`id\`, \`date\`, \`type\`, \`source\`, \`sourceId\`, \`description\`,
         \`amount\`, \`paymentMethod\`, \`expenseCategoryId\`, \`isVoided\`,
         \`userId\`, \`createdAt\`)
       SELECT
         UUID(),
         pe.\`date\`,
         'EXPENSE',
         'PURCHASE',
         pe.\`id\`,
         CONCAT('Compra a proveedor (backfill)'),
         pe.\`total\`,
         'TRANSFER',
         NULL,
         0,
         pe.\`userId\`,
         CURRENT_TIMESTAMP(6)
       FROM \`purchase_entries\` pe
       WHERE NOT EXISTS (
         SELECT 1 FROM \`cash_transactions\` ct
         WHERE ct.\`source\` = 'PURCHASE' AND ct.\`sourceId\` = pe.\`id\`
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Borrar transacciones de caja generadas por el backfill (todas las que
    // tengan source=PURCHASE quedan, no podemos distinguir las del backfill
    // de las "reales" — el down completo de Fase 5 implica borrarlas todas).
    await queryRunner.query(
      `DELETE FROM \`cash_transactions\` WHERE \`source\` = 'PURCHASE'`,
    );

    await queryRunner.query(
      `DROP TABLE \`counters\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_expenses_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`expenses\` DROP FOREIGN KEY \`FK_expenses_category\``,
    );
    await queryRunner.query(`DROP TABLE \`expenses\``);

    await queryRunner.query(`ALTER TABLE \`sales\` DROP COLUMN \`commissionAmount\``);
    await queryRunner.query(`ALTER TABLE \`sales\` DROP COLUMN \`taxAmount\``);
    await queryRunner.query(`ALTER TABLE \`sales\` DROP COLUMN \`subtotal\``);

    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` DROP COLUMN \`invoiceUrl\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` DROP COLUMN \`taxAmount\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`purchase_entries\` DROP COLUMN \`subtotal\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`company_settings\` DROP COLUMN \`cardCommissionRate\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_settings\` DROP COLUMN \`taxRate\``,
    );

    await queryRunner.query(
      `ALTER TABLE \`expense_categories\` DROP COLUMN \`isSystem\``,
    );
  }
}
