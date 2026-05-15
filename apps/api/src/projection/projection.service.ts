import { InventoryMovementType } from '@inventory/shared';
import type {
  ProjectionResponseDto,
  ProjectionRowDto,
} from '@inventory/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompanySettings,
  InventoryMovement,
  Product,
  Stock,
  Warehouse,
} from '../database/entities';

/**
 * Proyección de stock — Fase 8.
 *
 * Calcula para cada producto activo:
 *   - stock total sumando todas las bodegas activas
 *   - consumo diario = unidades vendidas (SALE_OUT) en la ventana / windowDays
 *   - cobertura (días) = stock / consumo, null si consumo = 0
 *   - fecha estimada de quiebre = hoy + cobertura
 *   - sugerencia de pedido = consumo × (leadTime + buffer) − stock, mín 0
 *   - crítico = cobertura ≤ leadTime
 *
 * Decisiones de la fase (ver PLAN.md y discusión de scope):
 *   - Ventana fija 90 días (suposición #13).
 *   - Stock TOTAL agregado (sumando bodegas activas).
 *   - Lead time = override por query > companySettings.defaultLeadTimeDays.
 *   - Buffer post-llegada = 30 días hardcoded.
 *   - Productos inactivos excluidos.
 */
const WINDOW_DAYS = 90;
const ORDER_BUFFER_DAYS = 30;

interface ConsumptionRow {
  productId: string;
  totalOut: string;
}

interface StockRow {
  productId: string;
  totalQty: string;
}

@Injectable()
export class ProjectionService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
    @InjectRepository(Stock)
    private readonly stocks: Repository<Stock>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
  ) {}

  async compute(opts: {
    leadTimeDays?: number;
    onlyCritical?: boolean;
  }): Promise<ProjectionResponseDto> {
    const settings = await this.settingsRepo.find({ take: 1 });
    const defaultLead = settings[0]?.defaultLeadTimeDays ?? 75;
    const leadTimeDays = opts.leadTimeDays ?? defaultLead;
    const onlyCritical = opts.onlyCritical ?? true;

    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

    // 1. Bodegas activas (definen sobre qué se suma el stock).
    const activeWarehouses = await this.warehouses.find({
      where: { isActive: true },
    });
    const activeWarehouseIds = activeWarehouses.map((w) => w.id);

    if (activeWarehouseIds.length === 0) {
      // Sin bodegas activas no hay nada que proyectar.
      return {
        leadTimeDays,
        windowDays: WINDOW_DAYS,
        generatedAt: now.toISOString(),
        rows: [],
      };
    }

    // 2. Stock total por producto (sumando bodegas activas).
    const stockRaw: StockRow[] = await this.stocks
      .createQueryBuilder('s')
      .select('s.productId', 'productId')
      .addSelect('SUM(s.quantity)', 'totalQty')
      .where('s.warehouseId IN (:...wids)', { wids: activeWarehouseIds })
      .groupBy('s.productId')
      .getRawMany();
    const stockByProduct = new Map<string, number>();
    for (const row of stockRaw) {
      stockByProduct.set(row.productId, Number(row.totalQty) || 0);
    }

    // 3. Consumo en la ventana — solo movimientos SALE_OUT en bodegas activas.
    // SALE_OUT viene con qty negativa (salida); tomamos el valor absoluto.
    const consumptionRaw: ConsumptionRow[] = await this.movements
      .createQueryBuilder('m')
      .select('m.productId', 'productId')
      .addSelect('SUM(ABS(m.qty))', 'totalOut')
      .where('m.type = :type', { type: InventoryMovementType.SALE_OUT })
      .andWhere('m.warehouseId IN (:...wids)', { wids: activeWarehouseIds })
      .andWhere('m.createdAt >= :from', { from: windowStart })
      .andWhere('m.createdAt <= :to', { to: now })
      .groupBy('m.productId')
      .getRawMany();
    const consumptionByProduct = new Map<string, number>();
    for (const row of consumptionRaw) {
      consumptionByProduct.set(row.productId, Number(row.totalOut) || 0);
    }

    // 4. Para cada producto activo armamos la fila.
    const products = await this.products.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    const rows: ProjectionRowDto[] = products.map((p) => {
      const totalStock = stockByProduct.get(p.id) ?? 0;
      const totalOut = consumptionByProduct.get(p.id) ?? 0;
      const dailyConsumption = Number((totalOut / WINDOW_DAYS).toFixed(4));

      let coverageDays: number | null = null;
      let stockoutDate: string | null = null;
      let suggestedOrder = 0;
      let isCritical = false;

      if (dailyConsumption > 0) {
        coverageDays = Number((totalStock / dailyConsumption).toFixed(1));
        // Fecha de quiebre: hoy + cobertura (redondeo hacia el día).
        const stockout = new Date(now);
        stockout.setDate(
          stockout.getDate() + Math.floor(coverageDays),
        );
        stockoutDate = stockout.toISOString();
        isCritical = coverageDays <= leadTimeDays;

        if (isCritical) {
          // consumo × (lead + buffer) − stock, mínimo 0.
          const target =
            dailyConsumption * (leadTimeDays + ORDER_BUFFER_DAYS);
          suggestedOrder = Math.max(0, Math.ceil(target - totalStock));
        }
      } else {
        // Sin ventas en la ventana → no crítico, no sugerencia (no se sabe).
        coverageDays = null;
        isCritical = false;
        suggestedOrder = 0;
      }

      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        cost: p.cost,
        totalStock,
        dailyConsumption,
        coverageDays,
        stockoutDate,
        suggestedOrder,
        isCritical,
      };
    });

    const filtered = onlyCritical ? rows.filter((r) => r.isCritical) : rows;

    return {
      leadTimeDays,
      windowDays: WINDOW_DAYS,
      generatedAt: now.toISOString(),
      rows: filtered,
    };
  }
}
