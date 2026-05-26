import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ronda 9 — bundle de mejoras de negocio aprobadas por el cliente.
 *
 * Schema cambios:
 *
 *  1. **Product.sku** pasa a NULLABLE — el operador puede crear productos
 *     sin SKU y el backend autogenera `AUTO-AAAA-NNNNN` vía `CountersService`.
 *     El índice único se mantiene, solo se aplica a filas no-NULL.
 *
 *  2. **Customer.taxId** pasa a NULLABLE — permite clientes "lite" registrados
 *     sólo por WhatsApp. El índice único se vuelve parcial (excluye NULL).
 *     `SalesService.create` valida que el cliente tenga RUT antes de facturar.
 *
 *  3. **Supplier** agrega `legalName` (razón social) y `contactPerson`
 *     (nombre del vendedor/contacto). Ambos opcionales.
 *
 *  4. **PaymentMethod** se desdobla: drop `CARD`, agrega `CARD_DEBIT`,
 *     `CARD_CREDIT`, `PAYMENT_LINK`. Backfill: las filas con `CARD` se
 *     mapean a `CARD_CREDIT` (más conservador para mantener la comisión
 *     histórica). Afecta `sales`, `cash_transactions`, `expenses`, `returns`.
 *
 *  5. **CompanySettings** agrega `cardDebitCommissionRate` (default 0.0150),
 *     `cardCreditCommissionRate` (default 0.0250 — copia el valor de
 *     `cardCommissionRate`) y `paymentLinkCommissionRate` (default 0.0350).
 *     El campo `cardCommissionRate` se conserva como alias legacy hasta
 *     completar la migración del código.
 *
 *  6. **SupplierCredit** entidad nueva: saldos a favor del proveedor
 *     generados por devoluciones que el operador decide no cobrar en
 *     efectivo. Se aplican como descuento en compras futuras.
 *
 *  7. **PurchaseCreditApplication**: tabla N→1 que vincula consumos de
 *     crédito a las compras donde se aplicaron.
 *
 *  8. **Return** agrega `refundMode` (`MONEY|CREDIT|EXCHANGE`). Default
 *     MONEY mantiene compatibilidad con devoluciones existentes.
 *     `supplierCreditId` linkea al SupplierCredit generado cuando aplica.
 *
 *  9. **ReturnReplacementItem**: tabla 1→N para items de reemplazo cuando
 *     `refundMode=EXCHANGE`. Si la diferencia bruta es positiva, el cliente
 *     paga; si es negativa, se reembolsa.
 *
 *  10. **QuotationItem.productId** pasa a NULLABLE + columnas snapshot para
 *      productos temporales: `tempProductName`, `tempProductSku`,
 *      `tempProductPartNumber`. La conversión a venta requiere que TODOS los
 *      items tengan `productId` (los temporales bloquean).
 */
export class Round9BugfixesBundle_1779900000000 implements MigrationInterface {
  name = 'Round9BugfixesBundle_1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- 1. Product.sku NULLABLE ----------
    await queryRunner.query(`
      ALTER TABLE \`products\`
        MODIFY COLUMN \`sku\` varchar(60) NULL
    `);

    // ---------- 2. Customer.taxId NULLABLE ----------
    // MySQL UNIQUE index ya ignora NULLs por default — no hace falta tocarlo.
    await queryRunner.query(`
      ALTER TABLE \`customers\`
        MODIFY COLUMN \`taxId\` varchar(60) NULL
    `);

    // ---------- 3. Supplier: legalName + contactPerson ----------
    await queryRunner.query(`
      ALTER TABLE \`suppliers\`
        ADD COLUMN \`legalName\` varchar(200) NULL,
        ADD COLUMN \`contactPerson\` varchar(180) NULL
    `);

    // ---------- 4. PaymentMethod split ----------
    // Backfill: cualquier CARD existente pasa a CARD_CREDIT en cada tabla
    // que use el enum. Hacemos UPDATE primero, después ALTER del enum.
    await queryRunner.query(`
      ALTER TABLE \`sales\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`cash_transactions\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`expenses\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`returns\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(
      `UPDATE \`sales\` SET \`paymentMethod\` = 'CARD_CREDIT' WHERE \`paymentMethod\` = 'CARD'`,
    );
    await queryRunner.query(
      `UPDATE \`cash_transactions\` SET \`paymentMethod\` = 'CARD_CREDIT' WHERE \`paymentMethod\` = 'CARD'`,
    );
    await queryRunner.query(
      `UPDATE \`expenses\` SET \`paymentMethod\` = 'CARD_CREDIT' WHERE \`paymentMethod\` = 'CARD'`,
    );
    await queryRunner.query(
      `UPDATE \`returns\` SET \`paymentMethod\` = 'CARD_CREDIT' WHERE \`paymentMethod\` = 'CARD'`,
    );
    // Después de backfillear, quitamos 'CARD' del enum.
    await queryRunner.query(`
      ALTER TABLE \`sales\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`cash_transactions\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`expenses\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`returns\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);

    // ---------- 5. CompanySettings: comisiones por método ----------
    await queryRunner.query(`
      ALTER TABLE \`company_settings\`
        ADD COLUMN \`cardDebitCommissionRate\` decimal(5,4) NOT NULL DEFAULT 0.0150,
        ADD COLUMN \`cardCreditCommissionRate\` decimal(5,4) NOT NULL DEFAULT 0.0250,
        ADD COLUMN \`paymentLinkCommissionRate\` decimal(5,4) NOT NULL DEFAULT 0.0350
    `);
    // Copiar el valor histórico de cardCommissionRate al de crédito (más
    // conservador) para no cambiar la comisión efectiva.
    await queryRunner.query(`
      UPDATE \`company_settings\`
      SET \`cardCreditCommissionRate\` = \`cardCommissionRate\`
    `);

    // ---------- 6. SupplierCredit ----------
    await queryRunner.query(`
      CREATE TABLE \`supplier_credits\` (
        \`id\` varchar(36) NOT NULL,
        \`supplierId\` varchar(36) NOT NULL,
        \`sourceReturnId\` varchar(36) NULL,
        \`amount\` decimal(15,2) NOT NULL,
        \`balance\` decimal(15,2) NOT NULL,
        \`status\` enum('ACTIVE','SPENT','VOIDED') NOT NULL DEFAULT 'ACTIVE',
        \`notes\` text NULL,
        \`userId\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_supplier_credits_supplier\` (\`supplierId\`),
        KEY \`idx_supplier_credits_status\` (\`status\`),
        KEY \`idx_supplier_credits_return\` (\`sourceReturnId\`),
        CONSTRAINT \`fk_supplier_credits_supplier\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_supplier_credits_return\` FOREIGN KEY (\`sourceReturnId\`) REFERENCES \`returns\`(\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_supplier_credits_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ---------- 7. PurchaseCreditApplication ----------
    await queryRunner.query(`
      CREATE TABLE \`purchase_credit_applications\` (
        \`id\` varchar(36) NOT NULL,
        \`purchaseEntryId\` varchar(36) NOT NULL,
        \`supplierCreditId\` varchar(36) NOT NULL,
        \`amount\` decimal(15,2) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_pca_purchase\` (\`purchaseEntryId\`),
        KEY \`idx_pca_credit\` (\`supplierCreditId\`),
        CONSTRAINT \`fk_pca_purchase\` FOREIGN KEY (\`purchaseEntryId\`) REFERENCES \`purchase_entries\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_pca_credit\` FOREIGN KEY (\`supplierCreditId\`) REFERENCES \`supplier_credits\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ---------- 8. Return.refundMode + supplierCreditId ----------
    await queryRunner.query(`
      ALTER TABLE \`returns\`
        ADD COLUMN \`refundMode\` enum('MONEY','CREDIT','EXCHANGE') NOT NULL DEFAULT 'MONEY' AFTER \`paymentMethod\`,
        ADD COLUMN \`supplierCreditId\` varchar(36) NULL,
        ADD COLUMN \`exchangeDifference\` decimal(15,2) NOT NULL DEFAULT 0,
        ADD CONSTRAINT \`fk_returns_supplier_credit\` FOREIGN KEY (\`supplierCreditId\`) REFERENCES \`supplier_credits\`(\`id\`) ON DELETE SET NULL
    `);

    // ---------- 9. ReturnReplacementItem ----------
    await queryRunner.query(`
      CREATE TABLE \`return_replacement_items\` (
        \`id\` varchar(36) NOT NULL,
        \`returnId\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`qty\` int NOT NULL,
        \`unitPrice\` decimal(15,2) NOT NULL,
        \`unitCost\` decimal(15,2) NOT NULL DEFAULT 0,
        \`subtotal\` decimal(15,2) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_rri_return\` (\`returnId\`),
        KEY \`idx_rri_product\` (\`productId\`),
        CONSTRAINT \`fk_rri_return\` FOREIGN KEY (\`returnId\`) REFERENCES \`returns\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_rri_product\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ---------- 10. QuotationItem productos temporales ----------
    // Drop FK temporalmente para poder hacer productId NULL-able.
    await queryRunner.query(`
      ALTER TABLE \`quotation_items\` DROP FOREIGN KEY \`FK_quotation_items_product\`
    `).catch(async () => {
      // El nombre real de la FK puede variar — buscar dinámicamente.
      const fks: Array<{ CONSTRAINT_NAME: string }> = await queryRunner.query(`
        SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'quotation_items'
          AND COLUMN_NAME = 'productId'
          AND REFERENCED_TABLE_NAME = 'products'
      `);
      for (const fk of fks) {
        await queryRunner.query(
          `ALTER TABLE \`quotation_items\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
        );
      }
    });
    await queryRunner.query(`
      ALTER TABLE \`quotation_items\`
        MODIFY COLUMN \`productId\` varchar(36) NULL,
        ADD COLUMN \`tempProductName\` varchar(200) NULL,
        ADD COLUMN \`tempProductSku\` varchar(60) NULL,
        ADD COLUMN \`tempProductPartNumber\` varchar(80) NULL,
        ADD CONSTRAINT \`fk_quotation_items_product\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop en orden inverso.

    // 10. QuotationItem rollback
    await queryRunner.query(`
      ALTER TABLE \`quotation_items\` DROP FOREIGN KEY \`fk_quotation_items_product\`
    `).catch(() => undefined);
    // Cualquier item temporal queda perdido si se hace down — se intenta dropearlos primero.
    await queryRunner.query(
      `DELETE FROM \`quotation_items\` WHERE \`productId\` IS NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE \`quotation_items\`
        DROP COLUMN \`tempProductName\`,
        DROP COLUMN \`tempProductSku\`,
        DROP COLUMN \`tempProductPartNumber\`,
        MODIFY COLUMN \`productId\` varchar(36) NOT NULL,
        ADD CONSTRAINT \`fk_quotation_items_product\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE RESTRICT
    `);

    // 9. ReturnReplacementItem
    await queryRunner.query(`DROP TABLE \`return_replacement_items\``);

    // 8. Return rollback
    await queryRunner.query(`
      ALTER TABLE \`returns\`
        DROP FOREIGN KEY \`fk_returns_supplier_credit\`,
        DROP COLUMN \`exchangeDifference\`,
        DROP COLUMN \`supplierCreditId\`,
        DROP COLUMN \`refundMode\`
    `);

    // 7. PurchaseCreditApplication
    await queryRunner.query(`DROP TABLE \`purchase_credit_applications\``);

    // 6. SupplierCredit
    await queryRunner.query(`DROP TABLE \`supplier_credits\``);

    // 5. CompanySettings rollback
    await queryRunner.query(`
      ALTER TABLE \`company_settings\`
        DROP COLUMN \`cardDebitCommissionRate\`,
        DROP COLUMN \`cardCreditCommissionRate\`,
        DROP COLUMN \`paymentLinkCommissionRate\`
    `);

    // 4. PaymentMethod rollback — re-incluir CARD y devolver los CARD_CREDIT.
    await queryRunner.query(`
      ALTER TABLE \`sales\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`cash_transactions\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`expenses\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`returns\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NOT NULL
    `);
    await queryRunner.query(
      `UPDATE \`sales\` SET \`paymentMethod\` = 'CARD' WHERE \`paymentMethod\` IN ('CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK')`,
    );
    await queryRunner.query(
      `UPDATE \`cash_transactions\` SET \`paymentMethod\` = 'CARD' WHERE \`paymentMethod\` IN ('CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK')`,
    );
    await queryRunner.query(
      `UPDATE \`expenses\` SET \`paymentMethod\` = 'CARD' WHERE \`paymentMethod\` IN ('CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK')`,
    );
    await queryRunner.query(
      `UPDATE \`returns\` SET \`paymentMethod\` = 'CARD' WHERE \`paymentMethod\` IN ('CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK')`,
    );
    await queryRunner.query(`
      ALTER TABLE \`sales\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`cash_transactions\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`expenses\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD') NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`returns\`
        MODIFY COLUMN \`paymentMethod\` enum('CASH','TRANSFER','CARD') NOT NULL
    `);

    // 3. Supplier rollback
    await queryRunner.query(`
      ALTER TABLE \`suppliers\`
        DROP COLUMN \`legalName\`,
        DROP COLUMN \`contactPerson\`
    `);

    // 2. Customer rollback
    await queryRunner.query(`
      ALTER TABLE \`customers\`
        MODIFY COLUMN \`taxId\` varchar(60) NOT NULL
    `);

    // 1. Product rollback
    await queryRunner.query(`
      ALTER TABLE \`products\`
        MODIFY COLUMN \`sku\` varchar(60) NOT NULL
    `);
  }
}
