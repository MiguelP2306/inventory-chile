import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 7.7 — Guías de despacho.
 *
 * Modelo: 1 venta puede tener N guías pero **solo una activa** a la vez.
 * Cuando el operador detecta un error y regenera, la guía previa queda en
 * estado `VOIDED` con motivo. La activa siempre tiene `status='ACTIVE'`. Esto
 * preserva el correlativo de la anulada (para auditoría) y permite trazar
 * historial completo por venta.
 *
 * - `dispatch_notes`: tabla nueva con correlativo `DESP-AAAA-NNNNN`, FK
 *   restrict a `sales`, snapshot de dirección de entrega (puede diferir del
 *   cliente), datos del transportista, tracking, observaciones y auditoría
 *   de anulación.
 * - Índice parcial para garantizar 1 sola guía ACTIVE por venta: MySQL no
 *   soporta índices parciales nativos, así que validamos en service. El
 *   índice `idx_dispatch_notes_sale_status` ayuda a la query.
 *
 * El down dropea la tabla.
 */
export class DispatchNotesPhase771779100000000 implements MigrationInterface {
  name = 'DispatchNotesPhase771779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`dispatch_notes\` (
        \`id\` varchar(36) NOT NULL,
        \`number\` varchar(40) NOT NULL,
        \`saleId\` varchar(36) NOT NULL,
        \`dispatchedAt\` datetime(6) NOT NULL,
        \`carrier\` varchar(120) NULL,
        \`trackingNumber\` varchar(120) NULL,
        \`addressStreet\` varchar(200) NULL,
        \`addressNumber\` varchar(20) NULL,
        \`communeId\` varchar(36) NULL,
        \`addressNotes\` varchar(255) NULL,
        \`notes\` text NULL,
        \`status\` enum('ACTIVE', 'VOIDED') NOT NULL DEFAULT 'ACTIVE',
        \`voidedAt\` datetime(6) NULL,
        \`voidReason\` text NULL,
        \`voidedById\` varchar(36) NULL,
        \`userId\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`idx_dispatch_notes_number\` (\`number\`),
        INDEX \`idx_dispatch_notes_sale\` (\`saleId\`),
        INDEX \`idx_dispatch_notes_sale_status\` (\`saleId\`, \`status\`),
        INDEX \`idx_dispatch_notes_dispatched_at\` (\`dispatchedAt\`),
        INDEX \`idx_dispatch_notes_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_sale\`
        FOREIGN KEY (\`saleId\`) REFERENCES \`sales\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_commune\`
        FOREIGN KEY (\`communeId\`) REFERENCES \`communes\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_user\`
        FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`)
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` ADD CONSTRAINT \`FK_dispatch_notes_voided_by\`
        FOREIGN KEY (\`voidedById\`) REFERENCES \`users\`(\`id\`)
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_voided_by\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_commune\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\` DROP FOREIGN KEY \`FK_dispatch_notes_sale\``,
    );
    await queryRunner.query(`DROP TABLE \`dispatch_notes\``);
  }
}
