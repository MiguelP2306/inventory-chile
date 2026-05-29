import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extiende `users.role` para soportar el rol `USER` (vendedor/cliente).
 *
 * Hasta esta migración la columna era `enum('ADMIN')`. El nuevo enum
 * `enum('ADMIN','USER')` mantiene los registros existentes (todos ADMIN)
 * intactos. El `down()` falla si hay usuarios USER en la base — no
 * podemos volver al enum anterior sin perder datos.
 */
export class AddUserRole_1780100000000 implements MigrationInterface {
  name = 'AddUserRole_1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY COLUMN \`role\` enum('ADMIN','USER') NOT NULL DEFAULT 'ADMIN'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ n: string }> = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM \`users\` WHERE \`role\` = 'USER'`,
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) {
      throw new Error(
        `No se puede revertir AddUserRole: ${n} usuario(s) tienen rol USER. Borralos o cambialos a ADMIN antes de hacer down.`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY COLUMN \`role\` enum('ADMIN') NOT NULL DEFAULT 'ADMIN'`,
    );
  }
}
