import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega a `company_settings` los campos para replicar el ENCABEZADO y el PIE
 * del documento de cotización pedido por el cliente:
 *  - `legalName`        → razón social formal (encabezado).
 *  - `businessActivity` → giro / rubro (subtítulo del encabezado).
 *  - `bankDetails`      → datos de pago del bloque "Formas de pago" (pie).
 *
 * El resto del encabezado (dirección, fono, email, RUT, logo) ya existía.
 */
export class CompanyHeaderFooter_1784000000000 implements MigrationInterface {
  name = 'CompanyHeaderFooter_1784000000000';

  private async add(
    queryRunner: QueryRunner,
    column: string,
    ddl: string,
  ): Promise<void> {
    const has = await queryRunner.query(
      `SHOW COLUMNS FROM \`company_settings\` LIKE '${column}'`,
    );
    if (has.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`company_settings\` ADD COLUMN ${ddl}`,
      );
    }
  }

  private async drop(
    queryRunner: QueryRunner,
    column: string,
  ): Promise<void> {
    const has = await queryRunner.query(
      `SHOW COLUMNS FROM \`company_settings\` LIKE '${column}'`,
    );
    if (has.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`company_settings\` DROP COLUMN \`${column}\``,
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.add(queryRunner, 'legalName', '`legalName` varchar(200) NULL');
    await this.add(
      queryRunner,
      'businessActivity',
      '`businessActivity` varchar(255) NULL',
    );
    await this.add(queryRunner, 'bankDetails', '`bankDetails` text NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.drop(queryRunner, 'legalName');
    await this.drop(queryRunner, 'businessActivity');
    await this.drop(queryRunner, 'bankDetails');
  }
}
