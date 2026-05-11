import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ronda 2 — Limpieza del texto fijo "15 días" en CompanySettings.quotationFooter.
 *
 * El footer original sembrado por el seed contenía:
 *   "Esta cotización tiene una validez de 15 días desde su emisión."
 *
 * Eso causaba inconsistencias visibles en PDF y link público cuando el
 * usuario configuraba `defaultValidityDays != 15` o cambiaba `validUntil`
 * manualmente al editar la cotización. La fecha real ya se muestra como
 * "Válida hasta: <fecha>" en todas las salidas, así que el texto fijo era
 * redundante y confuso.
 *
 * Esta migración reemplaza el footer SOLO si todavía contiene el texto viejo
 * exacto. Si el operador ya lo personalizó desde /configuracion, lo respetamos.
 *
 * Idempotente: corre 0 o N veces sin efecto. El down restituye el texto viejo
 * únicamente si el footer actual coincide con el nuevo (no pisa otra
 * personalización).
 */
const OLD_FOOTER =
  'Esta cotización tiene una validez de 15 días desde su emisión.';
const NEW_FOOTER =
  'Sujeta a confirmación de stock al momento de la venta. Precios en pesos chilenos (CLP), IVA incluido.';

export class QuotationFooterCleanup1778760000000 implements MigrationInterface {
  name = 'QuotationFooterCleanup1778760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`company_settings\` SET \`quotationFooter\` = ? WHERE \`quotationFooter\` = ?`,
      [NEW_FOOTER, OLD_FOOTER],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`company_settings\` SET \`quotationFooter\` = ? WHERE \`quotationFooter\` = ?`,
      [OLD_FOOTER, NEW_FOOTER],
    );
  }
}
