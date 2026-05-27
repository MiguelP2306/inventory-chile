import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 12 — Capital inicial de la empresa.
 *
 * Extiende el enum `cash_transactions.source` con `OPENING` para registrar
 * el saldo de arranque del negocio como una transacción especial. Es una
 * sola transacción de tipo INCOME que se inserta antes de cualquier otro
 * movimiento; solo puede modificarse o borrarse mientras no haya otros
 * movimientos en el libro de caja.
 */
export class OpeningBalancePhase12_1779950000000
  implements MigrationInterface
{
  name = 'OpeningBalancePhase12_1779950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transactions\`
       MODIFY COLUMN \`source\` enum(
         'SALE',
         'PURCHASE',
         'MANUAL',
         'SALE_RETURN',
         'PURCHASE_RETURN',
         'OPENING'
       ) NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Borrar primero las transacciones OPENING (si hubiera) para que el
    // ALTER no falle por valores no contemplados en el enum reducido.
    await queryRunner.query(
      `DELETE FROM \`cash_transactions\` WHERE \`source\` = 'OPENING'`,
    );
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
  }
}
