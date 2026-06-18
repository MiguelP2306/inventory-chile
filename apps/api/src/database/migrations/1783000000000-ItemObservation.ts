import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `observation` (texto libre, opcional) a los ítems de cotización y de
 * venta. Permite anotar una observación POR PRODUCTO dentro de una cotización
 * (ej. "incluye instalación", "entrega 5 días"); al convertir la cotización en
 * venta la observación se copia al ítem de la venta. Aplica también a los
 * productos temporales (es un campo por línea, independiente del producto).
 */
export class ItemObservation_1783000000000 implements MigrationInterface {
  name = 'ItemObservation_1783000000000';

  private async addCol(queryRunner: QueryRunner, table: string): Promise<void> {
    const has = await queryRunner.query(
      `SHOW COLUMNS FROM \`${table}\` LIKE 'observation'`,
    );
    if (has.length === 0) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`observation\` text NULL`,
      );
    }
  }

  private async dropCol(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<void> {
    const has = await queryRunner.query(
      `SHOW COLUMNS FROM \`${table}\` LIKE 'observation'`,
    );
    if (has.length > 0) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`observation\``,
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addCol(queryRunner, 'quotation_items');
    await this.addCol(queryRunner, 'sale_items');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropCol(queryRunner, 'quotation_items');
    await this.dropCol(queryRunner, 'sale_items');
  }
}
