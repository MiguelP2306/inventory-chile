import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guías de despacho VALORIZADAS.
 *
 * Hasta ahora la guía independiente era un documento puramente logístico
 * (producto + cantidad). El cliente la usa para cotizar envíos a empresas, que
 * piden ver cuánto vale la mercadería, así que ahora lleva precios propios y
 * sus totales, en espejo de la venta.
 *
 * Los precios se GUARDAN en la guía en vez de leerse del producto al imprimir:
 * una guía emitida hoy debe seguir mostrando los mismos montos dentro de un año
 * aunque cambie la lista de precios.
 *
 * Las guías con `origin='SALE'` siguen leyendo sus montos de la venta origen —
 * estas columnas quedan en 0 para ellas y no se usan.
 *
 * Backfill: las guías independientes que ya existen se valorizan con el precio
 * ACTUAL de cada producto. Es una reconstrucción, no el precio histórico real
 * (que nunca se guardó), pero deja los documentos legibles en vez de en $0.
 */
export class ValuedDispatchNotes1785000000000 implements MigrationInterface {
  name = 'ValuedDispatchNotes1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Precios por línea.
    await queryRunner.query(
      `ALTER TABLE \`dispatch_note_items\`
        ADD \`unitPrice\` decimal(15,2) NOT NULL DEFAULT 0,
        ADD \`discount\` decimal(15,2) NOT NULL DEFAULT 0,
        ADD \`subtotal\` decimal(15,2) NOT NULL DEFAULT 0`,
    );

    // 2. Totales de cabecera.
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\`
        ADD \`subtotal\` decimal(15,2) NOT NULL DEFAULT 0,
        ADD \`taxAmount\` decimal(15,2) NOT NULL DEFAULT 0,
        ADD \`total\` decimal(15,2) NOT NULL DEFAULT 0,
        ADD \`vatExempt\` tinyint NOT NULL DEFAULT 0`,
    );

    // 3. Backfill de líneas: precio actual del producto, sin descuento.
    //    `subtotal` es bruto (IVA incluido), igual que en sale_items.
    await queryRunner.query(
      `UPDATE \`dispatch_note_items\` i
        INNER JOIN \`dispatch_notes\` n ON n.id = i.dispatchNoteId
        INNER JOIN \`products\` p ON p.id = i.productId
        SET i.unitPrice = p.price,
            i.subtotal = p.price * i.qty
        WHERE n.origin = 'INDEPENDENT'`,
    );

    // 4. Backfill de cabecera: total bruto = suma de líneas; el neto se
    //    descompone con la tasa de IVA configurada, igual que hace la venta.
    await queryRunner.query(
      `UPDATE \`dispatch_notes\` n
        SET n.total = COALESCE(
              (SELECT SUM(i.subtotal) FROM \`dispatch_note_items\` i
                WHERE i.dispatchNoteId = n.id), 0)
        WHERE n.origin = 'INDEPENDENT'`,
    );
    await queryRunner.query(
      `UPDATE \`dispatch_notes\` n
        SET n.subtotal = ROUND(
              n.total / (1 + COALESCE(
                (SELECT s.taxRate FROM \`company_settings\` s LIMIT 1), 0.19)), 2),
            n.taxAmount = n.total - ROUND(
              n.total / (1 + COALESCE(
                (SELECT s.taxRate FROM \`company_settings\` s LIMIT 1), 0.19)), 2)
        WHERE n.origin = 'INDEPENDENT'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`dispatch_notes\`
        DROP COLUMN \`vatExempt\`,
        DROP COLUMN \`total\`,
        DROP COLUMN \`taxAmount\`,
        DROP COLUMN \`subtotal\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`dispatch_note_items\`
        DROP COLUMN \`subtotal\`,
        DROP COLUMN \`discount\`,
        DROP COLUMN \`unitPrice\``,
    );
  }
}
