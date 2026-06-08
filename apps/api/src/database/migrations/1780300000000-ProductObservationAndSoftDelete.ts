import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 12 — pedido del cliente:
 *
 *  1. `products.observation` (text, null): nota interna por producto. Editable
 *     en alta/edición, exportable e importable vía Excel.
 *
 *  2. `products.deletedAt` (datetime(6), null): habilita el SOFT DELETE de
 *     productos. A partir de acá "eliminar" un producto nunca falla aunque
 *     tenga movimientos/ventas/compras/cotizaciones/garantías — TypeORM marca
 *     la fecha y excluye la fila de todas las queries, preservando el histórico.
 *
 * Ambos `ADD COLUMN` son idempotentes (chequean existencia) para tolerar bases
 * que ya tengan las columnas.
 */
export class ProductObservationAndSoftDelete_1780300000000
  implements MigrationInterface
{
  name = 'ProductObservationAndSoftDelete_1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasObservation = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'observation'`,
    );
    if (hasObservation.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` ADD COLUMN \`observation\` text NULL`,
      );
    }

    const hasDeletedAt = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'deletedAt'`,
    );
    if (hasDeletedAt.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` ADD COLUMN \`deletedAt\` datetime(6) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasDeletedAt = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'deletedAt'`,
    );
    if (hasDeletedAt.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` DROP COLUMN \`deletedAt\``,
      );
    }
    const hasObservation = await queryRunner.query(
      `SHOW COLUMNS FROM \`products\` LIKE 'observation'`,
    );
    if (hasObservation.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`products\` DROP COLUMN \`observation\``,
      );
    }
  }
}
