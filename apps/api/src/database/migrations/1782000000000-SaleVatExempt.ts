import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `sales.vatExempt`: marca si la venta es NO afecta a IVA (sin
 * documento tributario). Default `false` → afecta a IVA 19% (comportamiento
 * histórico). Las ventas no afectas se guardan con `taxAmount = 0` (todo el
 * total es neto) y NO entran al Reporte de IVA ni suman al débito.
 *
 * Las filas existentes quedan en `false` (todas las ventas previas eran
 * afectas), garantizado por el DEFAULT 0.
 */
export class SaleVatExempt_1782000000000 implements MigrationInterface {
  name = 'SaleVatExempt_1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.query(
      `SHOW COLUMNS FROM \`sales\` LIKE 'vatExempt'`,
    );
    if (has.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`sales\` ADD COLUMN \`vatExempt\` tinyint(1) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.query(
      `SHOW COLUMNS FROM \`sales\` LIKE 'vatExempt'`,
    );
    if (has.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`sales\` DROP COLUMN \`vatExempt\``,
      );
    }
  }
}
