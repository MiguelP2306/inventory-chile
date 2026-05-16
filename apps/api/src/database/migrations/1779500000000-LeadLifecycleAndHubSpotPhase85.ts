import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 8.5 — Lead lifecycle + Seguimiento comercial + HubSpot push.
 *
 * Migración consolidada:
 *
 *  1. Extiende `customers` con columnas de lifecycle.
 *  2. Crea tabla `lead_events` (bitácora).
 *  3. Crea tabla `hubspot_sync_jobs` (outbox para sync async a HubSpot).
 *  4. Extiende `company_settings` con knobs de seguimiento + flags HubSpot.
 *  5. Backfill de `lifecycleStatus`:
 *     - WON si el cliente tiene al menos 1 venta no cancelada.
 *     - QUOTED si tiene al menos 1 cotización en DRAFT/SENT/APPROVED.
 *     - NEW en caso contrario.
 *     `lastContactAt` para QUOTED se setea desde la cot más reciente.
 *
 * HubSpot queda apagado por default (`hubspotEnabled = false`). Las columnas
 * y los jobs existen y siguen el flujo completo — la integración real solo
 * se activa cuando el cliente configura su API key + flip del flag.
 */
export class LeadLifecycleAndHubSpotPhase85_1779500000000
  implements MigrationInterface
{
  name = 'LeadLifecycleAndHubSpotPhase85_1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------- 1. customers --------

    await queryRunner.query(`
      ALTER TABLE \`customers\`
        ADD \`source\` enum('WHATSAPP','EMAIL','PHONE','IN_PERSON','OTHER') NOT NULL DEFAULT 'OTHER',
        ADD \`whatsappPhone\` varchar(32) NULL,
        ADD \`lifecycleStatus\` enum('NEW','QUOTED','FOLLOW_UP','WON','LOST') NOT NULL DEFAULT 'NEW',
        ADD \`lastContactAt\` datetime(6) NULL,
        ADD \`nextFollowUpAt\` datetime(6) NULL,
        ADD \`lostReason\` text NULL,
        ADD \`hubspotContactId\` varchar(64) NULL
    `);

    await queryRunner.query(
      `CREATE INDEX \`idx_customers_lifecycle\` ON \`customers\` (\`lifecycleStatus\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_customers_next_followup\` ON \`customers\` (\`nextFollowUpAt\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`idx_customers_whatsapp\` ON \`customers\` (\`whatsappPhone\`)`,
    );

    // -------- 2. lead_events --------

    await queryRunner.query(`
      CREATE TABLE \`lead_events\` (
        \`id\` char(36) NOT NULL,
        \`customerId\` char(36) NOT NULL,
        \`type\` enum(
          'QUOTATION_CREATED',
          'QUOTATION_SENT',
          'SALE_CONFIRMED',
          'LOST_MARKED',
          'FOLLOW_UP_TRIGGERED',
          'MANUAL_CONTACT'
        ) NOT NULL,
        \`refType\` varchar(40) NULL,
        \`refId\` char(36) NULL,
        \`occurredAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`userId\` char(36) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_lead_events_customer\` (\`customerId\`),
        INDEX \`idx_lead_events_occurred\` (\`occurredAt\`),
        CONSTRAINT \`FK_lead_events_customer\` FOREIGN KEY (\`customerId\`)
          REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_lead_events_user\` FOREIGN KEY (\`userId\`)
          REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // -------- 3. hubspot_sync_jobs (outbox) --------

    await queryRunner.query(`
      CREATE TABLE \`hubspot_sync_jobs\` (
        \`id\` char(36) NOT NULL,
        \`customerId\` char(36) NOT NULL,
        \`status\` enum('PENDING','PROCESSING','DONE','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
        \`attempts\` int NOT NULL DEFAULT 0,
        \`lastError\` text NULL,
        \`scheduledAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`processedAt\` datetime(6) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`idx_hubspot_jobs_status\` (\`status\`, \`scheduledAt\`),
        INDEX \`idx_hubspot_jobs_customer\` (\`customerId\`),
        CONSTRAINT \`FK_hubspot_jobs_customer\` FOREIGN KEY (\`customerId\`)
          REFERENCES \`customers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // -------- 4. company_settings --------

    await queryRunner.query(`
      ALTER TABLE \`company_settings\`
        ADD \`followUpHoursDefault\` int NOT NULL DEFAULT 48,
        ADD \`hubspotEnabled\` boolean NOT NULL DEFAULT FALSE,
        ADD \`hubspotDefaultOwnerId\` varchar(64) NULL,
        ADD \`whatsappFollowUpTemplate\` text NULL
    `);

    // Default text para la plantilla.
    await queryRunner.query(`
      UPDATE \`company_settings\`
      SET \`whatsappFollowUpTemplate\` = 'Hola {cliente}, te paso de nuevo la cotización {cotizacion} por un total de {total}. Cualquier consulta avisame. 🙌'
      WHERE \`whatsappFollowUpTemplate\` IS NULL
    `);

    // -------- 5. Backfill lifecycle --------

    // 5a. WON para clientes con al menos 1 venta no cancelada.
    await queryRunner.query(`
      UPDATE \`customers\` c
      SET c.\`lifecycleStatus\` = 'WON'
      WHERE EXISTS (
        SELECT 1 FROM \`sales\` s
        WHERE s.\`customerId\` = c.\`id\`
          AND s.\`status\` <> 'CANCELLED'
      )
    `);

    // 5b. QUOTED para clientes con cotización DRAFT/SENT/APPROVED y SIN venta.
    // lastContactAt = createdAt de la cotización más reciente.
    await queryRunner.query(`
      UPDATE \`customers\` c
      LEFT JOIN (
        SELECT q.\`customerId\` AS cid, MAX(q.\`createdAt\`) AS lastCreatedAt
        FROM \`quotations\` q
        WHERE q.\`status\` IN ('DRAFT','SENT','APPROVED')
          AND q.\`customerId\` IS NOT NULL
        GROUP BY q.\`customerId\`
      ) qx ON qx.cid = c.\`id\`
      SET c.\`lifecycleStatus\` = 'QUOTED',
          c.\`lastContactAt\` = qx.lastCreatedAt
      WHERE qx.cid IS NOT NULL
        AND c.\`lifecycleStatus\` = 'NEW'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`hubspot_sync_jobs\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`lead_events\``);

    await queryRunner.query(`
      ALTER TABLE \`company_settings\`
        DROP COLUMN \`followUpHoursDefault\`,
        DROP COLUMN \`hubspotEnabled\`,
        DROP COLUMN \`hubspotDefaultOwnerId\`,
        DROP COLUMN \`whatsappFollowUpTemplate\`
    `);

    await queryRunner.query(
      `DROP INDEX \`idx_customers_whatsapp\` ON \`customers\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_customers_next_followup\` ON \`customers\``,
    );
    await queryRunner.query(
      `DROP INDEX \`idx_customers_lifecycle\` ON \`customers\``,
    );

    await queryRunner.query(`
      ALTER TABLE \`customers\`
        DROP COLUMN \`source\`,
        DROP COLUMN \`whatsappPhone\`,
        DROP COLUMN \`lifecycleStatus\`,
        DROP COLUMN \`lastContactAt\`,
        DROP COLUMN \`nextFollowUpAt\`,
        DROP COLUMN \`lostReason\`,
        DROP COLUMN \`hubspotContactId\`
    `);
  }
}
