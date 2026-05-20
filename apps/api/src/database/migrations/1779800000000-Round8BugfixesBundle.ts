import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ronda 8 — bundle de bugfixes sobre módulos ya entregados.
 *
 * Cambios de schema:
 *
 *  1. **InventoryMovementType** extiende con `DISPATCH_OUT`, `DISPATCH_VOIDED`
 *     y `RETURN_DAMAGED_CANCELLED`. Los tres son audit-only — no modifican
 *     `stocks`. Cierran el gap de trazabilidad que tenía el módulo de guías
 *     de despacho (no dejaba rastro al generar ni al anular) y la cancelación
 *     de devoluciones con condición DAMAGED.
 */
export class Round8BugfixesBundle_1779800000000 implements MigrationInterface {
  name = 'Round8BugfixesBundle_1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`inventory_movements\`
        MODIFY COLUMN \`type\`
        enum('PURCHASE_IN','SALE_OUT','ADJUSTMENT','RETURN_IN','RETURN_OUT','TRANSFER_OUT','TRANSFER_IN','RETURN_IN_DAMAGED','DISPATCH_OUT','DISPATCH_VOIDED','RETURN_DAMAGED_CANCELLED')
        NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Mover los registros nuevos a tipos cercanos para no perder filas en el
    // rollback. DISPATCH_OUT/VOIDED → SALE_OUT (mismo contexto: salida ligada
    // a una venta). RETURN_DAMAGED_CANCELLED → RETURN_IN_DAMAGED.
    await queryRunner.query(`
      UPDATE \`inventory_movements\`
      SET \`type\` = 'SALE_OUT'
      WHERE \`type\` IN ('DISPATCH_OUT','DISPATCH_VOIDED')
    `);
    await queryRunner.query(`
      UPDATE \`inventory_movements\`
      SET \`type\` = 'RETURN_IN_DAMAGED'
      WHERE \`type\` = 'RETURN_DAMAGED_CANCELLED'
    `);
    await queryRunner.query(`
      ALTER TABLE \`inventory_movements\`
        MODIFY COLUMN \`type\`
        enum('PURCHASE_IN','SALE_OUT','ADJUSTMENT','RETURN_IN','RETURN_OUT','TRANSFER_OUT','TRANSFER_IN','RETURN_IN_DAMAGED')
        NOT NULL
    `);
  }
}
