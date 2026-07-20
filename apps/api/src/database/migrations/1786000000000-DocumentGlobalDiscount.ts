import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega descuento a nivel de documento (sobre el total) en cotizaciones y
 * ventas. Hasta ahora el descuento existía solo por línea.
 *
 * Mismo par de columnas que ya usan `quotation_items` / `sale_items`:
 * - `discount`: monto en pesos efectivamente descontado. Siempre poblado.
 * - `discountPercent`: si el operador lo ingresó como %, se guarda para
 *   reimprimir el documento con la misma representación pactada.
 *
 * El descuento se aplica sobre el BRUTO sumado de las líneas; el neto y el IVA
 * se recalculan sobre el bruto rebajado (ver `common/document-totals.ts`).
 *
 * Las filas existentes quedan en 0 / NULL por el DEFAULT, así que sus totales
 * no cambian.
 */
export class DocumentGlobalDiscount_1786000000000
  implements MigrationInterface
{
  name = 'DocumentGlobalDiscount_1786000000000';

  private static readonly TABLES = ['quotations', 'sales'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of DocumentGlobalDiscount_1786000000000.TABLES) {
      const hasDiscount = await queryRunner.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE 'discount'`,
      );
      if (hasDiscount.length === 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`discount\` decimal(15,2) NOT NULL DEFAULT '0.00'`,
        );
      }

      const hasPercent = await queryRunner.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE 'discountPercent'`,
      );
      if (hasPercent.length === 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN \`discountPercent\` decimal(5,2) NULL`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of DocumentGlobalDiscount_1786000000000.TABLES) {
      const hasPercent = await queryRunner.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE 'discountPercent'`,
      );
      if (hasPercent.length > 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` DROP COLUMN \`discountPercent\``,
        );
      }

      const hasDiscount = await queryRunner.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE 'discount'`,
      );
      if (hasDiscount.length > 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` DROP COLUMN \`discount\``,
        );
      }
    }
  }
}
