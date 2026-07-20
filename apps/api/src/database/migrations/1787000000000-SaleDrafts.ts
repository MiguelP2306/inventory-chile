import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ventas "parkeadas" (borradores).
 *
 * Tablas nuevas y separadas de `sales` a propósito: meter un status DRAFT en
 * `sales` habría contaminado las 11 consultas que filtran con lista negra
 * (`status != CANCELLED`), incluido el Reporte de IVA, y habría quemado
 * correlativos de venta. Ver el comentario de `sale-draft.entity.ts`.
 *
 * Todo es nullable salvo `userId` y las líneas: un borrador existe
 * justamente para poder estar incompleto.
 */
export class SaleDrafts_1787000000000 implements MigrationInterface {
  name = 'SaleDrafts_1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasDrafts = await queryRunner.query(`SHOW TABLES LIKE 'sale_drafts'`);
    if (hasDrafts.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`sale_drafts\` (
          \`id\` varchar(36) NOT NULL,
          \`label\` varchar(120) NULL,
          \`customerId\` varchar(36) NULL,
          \`warehouseId\` varchar(36) NULL,
          \`paymentMethod\` enum('CASH','TRANSFER','CARD_DEBIT','CARD_CREDIT','PAYMENT_LINK') NULL,
          \`vatExempt\` tinyint(1) NOT NULL DEFAULT 0,
          \`notes\` text NULL,
          \`discount\` decimal(15,2) NOT NULL DEFAULT '0.00',
          \`discountPercent\` decimal(5,2) NULL,
          \`total\` decimal(15,2) NOT NULL DEFAULT '0.00',
          \`quotationId\` varchar(36) NULL,
          \`dispatchNoteId\` varchar(36) NULL,
          \`userId\` varchar(36) NOT NULL,
          \`updatedById\` varchar(36) NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          KEY \`idx_sale_drafts_customer\` (\`customerId\`),
          KEY \`idx_sale_drafts_updated_at\` (\`updatedAt\`),
          CONSTRAINT \`fk_sale_drafts_customer\` FOREIGN KEY (\`customerId\`)
            REFERENCES \`customers\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_sale_drafts_warehouse\` FOREIGN KEY (\`warehouseId\`)
            REFERENCES \`warehouses\` (\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_sale_drafts_user\` FOREIGN KEY (\`userId\`)
            REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT,
          CONSTRAINT \`fk_sale_drafts_updated_by\` FOREIGN KEY (\`updatedById\`)
            REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    const hasItems = await queryRunner.query(
      `SHOW TABLES LIKE 'sale_draft_items'`,
    );
    if (hasItems.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`sale_draft_items\` (
          \`id\` varchar(36) NOT NULL,
          \`draftId\` varchar(36) NOT NULL,
          \`productId\` varchar(36) NOT NULL,
          \`qty\` int NOT NULL,
          \`unitPrice\` decimal(15,2) NOT NULL,
          \`discount\` decimal(15,2) NOT NULL DEFAULT '0.00',
          \`discountPercent\` decimal(5,2) NULL,
          \`observation\` text NULL,
          \`sortOrder\` int NOT NULL DEFAULT 0,
          PRIMARY KEY (\`id\`),
          KEY \`idx_sale_draft_items_draft\` (\`draftId\`),
          KEY \`idx_sale_draft_items_product\` (\`productId\`),
          CONSTRAINT \`fk_sale_draft_items_draft\` FOREIGN KEY (\`draftId\`)
            REFERENCES \`sale_drafts\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_sale_draft_items_product\` FOREIGN KEY (\`productId\`)
            REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`sale_draft_items\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`sale_drafts\``);
  }
}
