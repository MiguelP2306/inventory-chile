import {
  CashTransactionSource,
  CashTransactionType,
  InventoryMovementType,
  PaymentMethod,
} from '@inventory/shared';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { CashboxService } from '../cashbox/cashbox.service';
import { dayRange } from '../common/date-range';
import { InventoryService } from '../inventory/inventory.service';
import {
  CompanySettings,
  PurchaseEntry,
  PurchaseEntryItem,
  Supplier,
  Warehouse,
} from '../database/entities';
import {
  CreatePurchaseEntryDto,
  ListPurchasesQueryDto,
} from './dto';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseEntry)
    private readonly entries: Repository<PurchaseEntry>,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventory: InventoryService,
    private readonly cashbox: CashboxService,
  ) {}

  async list(query: ListPurchasesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = {};
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      where.date = Between(from, to);
    }

    const [items, total] = await this.entries.findAndCount({
      where,
      relations: { supplier: true, user: true, warehouse: true },
      order: { date: 'DESC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getOne(id: string) {
    const entry = await this.entries.findOne({
      where: { id },
      relations: {
        supplier: true,
        user: true,
        warehouse: true,
        items: { product: true },
      },
    });
    if (!entry) throw new NotFoundException('Compra no encontrada');
    return entry;
  }

  /**
   * Crea PurchaseEntry + items + movimientos de inventario PURCHASE_IN +
   * transacción de caja (EXPENSE, source=PURCHASE) en una transacción atómica.
   *
   * IVA: los `unitCost` que llegan son BRUTO (incluyen IVA, igual que `product.cost`).
   * - `total` = suma de los items.
   * - `taxAmount` = `total - total / (1 + taxRate)` (auto), o sobreescrito por
   *   el operador si la factura tiene un redondeo distinto.
   * - `subtotal` = `total - taxAmount`.
   *
   * Si falla cualquier paso, rollbackea todo.
   */
  async create(dto: CreatePurchaseEntryDto, userId: string) {
    const supplier = await this.suppliers.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const warehouseId =
      dto.warehouseId ?? (await this.firstWarehouseId());

    const settings = await this.settingsRepo.find({ take: 1 });
    const taxRate = settings[0]?.taxRate ?? '0.19';

    const entryId = await this.dataSource.transaction(async (manager) => {
      const total = dto.items
        .reduce((acc, it) => acc + Number(it.unitCost) * it.qty, 0)
        .toFixed(2);

      const totalNum = Number(total);
      const rate = Number(taxRate);
      const autoTax = totalNum - totalNum / (1 + rate);
      const taxAmount = (
        dto.taxAmountOverride !== undefined
          ? Number(dto.taxAmountOverride)
          : autoTax
      ).toFixed(2);
      const subtotal = (totalNum - Number(taxAmount)).toFixed(2);

      const entry = manager.create(PurchaseEntry, {
        supplierId: dto.supplierId,
        warehouseId,
        date: dto.date ? new Date(dto.date) : new Date(),
        total,
        subtotal,
        taxAmount,
        invoiceUrl: dto.invoiceUrl ?? null,
        notes: dto.notes ?? null,
        userId,
      });
      await manager.save(entry);

      for (const it of dto.items) {
        const itemSubtotal = (Number(it.unitCost) * it.qty).toFixed(2);
        const item = manager.create(PurchaseEntryItem, {
          entryId: entry.id,
          productId: it.productId,
          qty: it.qty,
          unitCost: it.unitCost,
          subtotal: itemSubtotal,
        });
        await manager.save(item);

        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId,
          type: InventoryMovementType.PURCHASE_IN,
          qty: it.qty,
          unitCost: it.unitCost,
          reference: 'PurchaseEntry',
          refId: entry.id,
          userId,
        });
      }

      // Egreso de caja por el TOTAL bruto. El IVA queda registrado en la
      // compra (no se duplica en caja) — se usa para el reporte de IVA crédito.
      await this.cashbox.recordTransaction(
        {
          date: entry.date,
          type: CashTransactionType.EXPENSE,
          source: CashTransactionSource.PURCHASE,
          sourceId: entry.id,
          description: `Compra a ${supplier.name}`,
          amount: total,
          // Default a TRANSFER (lo más usual con proveedores). Próximamente:
          // hacer el método configurable en el formulario de compra.
          paymentMethod: PaymentMethod.TRANSFER,
          expenseCategoryId: null,
          userId,
        },
        manager,
      );

      return entry.id;
    });

    return this.getOne(entryId);
  }

  /**
   * Bodega por defecto cuando el DTO no especifica una. Filtramos activas y
   * preferimos "Principal" explícitamente — antes el orden alfabético hacía
   * que "Mercado Libre Full" ganara contra "Principal" y las compras
   * quedaban en la bodega equivocada (bug reportado en Ronda 5 + Ronda 7).
   */
  private async firstWarehouseId(): Promise<string> {
    const rows = await this.warehouses
      .createQueryBuilder('w')
      .where('w.isActive = TRUE')
      .orderBy(`(w.name = 'Principal')`, 'DESC')
      .addOrderBy('w.name', 'ASC')
      .limit(1)
      .getMany();
    const w = rows[0];
    if (!w) {
      throw new NotFoundException(
        'No hay ningún almacén activo configurado.',
      );
    }
    return w.id;
  }
}
