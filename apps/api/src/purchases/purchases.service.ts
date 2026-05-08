import { InventoryMovementType } from '@inventory/shared';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { dayRange } from '../common/date-range';
import { InventoryService } from '../inventory/inventory.service';
import {
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
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventory: InventoryService,
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
      relations: { supplier: true, user: true },
      order: { date: 'DESC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getOne(id: string) {
    const entry = await this.entries.findOne({
      where: { id },
      relations: { supplier: true, user: true, items: { product: true } },
    });
    if (!entry) throw new NotFoundException('Compra no encontrada');
    return entry;
  }

  /**
   * Crea PurchaseEntry + items + movimientos de inventario PURCHASE_IN
   * en una transacción atómica. Si falla cualquier paso, se rollbackea todo.
   */
  async create(dto: CreatePurchaseEntryDto, userId: string) {
    const supplier = await this.suppliers.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const warehouseId =
      dto.warehouseId ?? (await this.firstWarehouseId());

    const entryId = await this.dataSource.transaction(async (manager) => {
      const total = dto.items
        .reduce((acc, it) => acc + Number(it.unitCost) * it.qty, 0)
        .toFixed(2);

      const entry = manager.create(PurchaseEntry, {
        supplierId: dto.supplierId,
        date: dto.date ? new Date(dto.date) : new Date(),
        total,
        notes: dto.notes ?? null,
        userId,
      });
      await manager.save(entry);

      for (const it of dto.items) {
        const subtotal = (Number(it.unitCost) * it.qty).toFixed(2);
        const item = manager.create(PurchaseEntryItem, {
          entryId: entry.id,
          productId: it.productId,
          qty: it.qty,
          unitCost: it.unitCost,
          subtotal,
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

      return entry.id;
    });

    return this.getOne(entryId);
  }

  private async firstWarehouseId(): Promise<string> {
    const w = await this.warehouses.findOne({ where: {}, order: { name: 'ASC' } });
    if (!w) throw new NotFoundException('No hay ningún almacén configurado.');
    return w.id;
  }
}
