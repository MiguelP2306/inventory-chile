import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  InventoryMovementType,
  TransferDto,
  TransferItemDto,
  TransferStatus,
} from '@inventory/shared';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { CountersService } from '../common/counters.service';
import { dayRange } from '../common/date-range';
import {
  Product,
  Transfer,
  TransferItem,
  Warehouse,
} from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import {
  CancelTransferDto,
  CreateTransferDto,
  ListTransfersQueryDto,
} from './dto';

const COUNTER_KIND = 'TRANSFER';
const NUMBER_PREFIX = 'TRF';
const PAGE_SIZE_DEFAULT = 20;

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    @InjectRepository(Transfer)
    private readonly repo: Repository<Transfer>,
    @InjectRepository(TransferItem)
    private readonly itemRepo: Repository<TransferItem>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly counters: CountersService,
    private readonly inventory: InventoryService,
  ) {}

  // ---------------- reads ----------------

  async list(query: ListTransfersQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;

    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.fromWarehouse', 'fromWh')
      .leftJoinAndSelect('t.toWarehouse', 'toWh')
      .leftJoinAndSelect('t.user', 'user');

    if (query.status) qb.andWhere('t.status = :st', { st: query.status });
    if (query.fromWarehouseId)
      qb.andWhere('t.fromWarehouseId = :fw', { fw: query.fromWarehouseId });
    if (query.toWarehouseId)
      qb.andWhere('t.toWarehouseId = :tw', { tw: query.toWarehouseId });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('t.date BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('t.number LIKE :q', { q: `%${query.q}%` })
            .orWhere('fromWh.name LIKE :q')
            .orWhere('toWh.name LIKE :q');
        }),
      );
    }

    qb.orderBy('t.date', 'DESC').addOrderBy('t.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);

    const [items, total] = await qb.getManyAndCount();
    const itemsBySale = await this.fetchItemsFor(items.map((t) => t.id));
    return {
      items: items.map((t) => this.toDto(t, itemsBySale.get(t.id) ?? [])),
      total,
      page,
      pageSize,
    };
  }

  async getOne(id: string): Promise<TransferDto> {
    const t = await this.repo.findOne({
      where: { id },
      relations: {
        fromWarehouse: true,
        toWarehouse: true,
        user: true,
        cancelledBy: true,
      },
    });
    if (!t) throw new NotFoundException('Transferencia no encontrada');
    const items = (await this.fetchItemsFor([t.id])).get(t.id) ?? [];
    return this.toDto(t, items);
  }

  // ---------------- create ----------------

  async create(dto: CreateTransferDto, userId: string): Promise<TransferDto> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'La bodega origen y destino no pueden ser la misma',
      );
    }
    if (dto.items.length === 0) {
      throw new BadRequestException(
        'La transferencia debe tener al menos un item',
      );
    }

    const [fromWh, toWh] = await Promise.all([
      this.warehouseRepo.findOne({ where: { id: dto.fromWarehouseId } }),
      this.warehouseRepo.findOne({ where: { id: dto.toWarehouseId } }),
    ]);
    if (!fromWh) throw new NotFoundException('Bodega origen no encontrada');
    if (!toWh) throw new NotFoundException('Bodega destino no encontrada');
    if (!fromWh.isActive) {
      throw new BadRequestException(
        'La bodega origen está inactiva. Reactivála desde /almacenes antes de transferir.',
      );
    }
    if (!toWh.isActive) {
      throw new BadRequestException(
        'La bodega destino está inactiva. Reactivála desde /almacenes antes de transferir.',
      );
    }

    const productIds = dto.items.map((i) => i.productId);
    if (productIds.length !== new Set(productIds).size) {
      throw new BadRequestException(
        'Hay items duplicados. Sumá las cantidades en una sola línea.',
      );
    }

    const products = await this.productRepo.find({
      where: { id: In(productIds) },
    });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException('Algún producto no existe');
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    const date = dto.date ? new Date(dto.date) : new Date();
    const year = date.getFullYear();

    const id = await this.ds.transaction(async (manager) => {
      const seq = await this.counters.nextNumber(COUNTER_KIND, year, manager);
      const number = CountersService.format(NUMBER_PREFIX, year, seq);

      const transfer = manager.getRepository(Transfer).create({
        number,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        date,
        notes: dto.notes?.trim() || null,
        status: TransferStatus.COMPLETED,
        userId,
      });
      const saved = await manager.getRepository(Transfer).save(transfer);

      for (const it of dto.items) {
        const product = productById.get(it.productId)!;
        const transferItem = manager.getRepository(TransferItem).create({
          transferId: saved.id,
          productId: it.productId,
          qty: it.qty,
          unitCost: product.cost,
        });
        await manager.getRepository(TransferItem).save(transferItem);

        // OUT en bodega origen — applyMovement valida que no quede negativo.
        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId: dto.fromWarehouseId,
          type: InventoryMovementType.TRANSFER_OUT,
          qty: -it.qty,
          unitCost: product.cost,
          reference: number,
          refId: saved.id,
          userId,
        });

        // IN en bodega destino — siempre suma stock, nunca falla por negativo.
        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId: dto.toWarehouseId,
          type: InventoryMovementType.TRANSFER_IN,
          qty: +it.qty,
          unitCost: product.cost,
          reference: number,
          refId: saved.id,
          userId,
        });
      }

      return saved.id;
    });

    return this.getOne(id);
  }

  // ---------------- cancel ----------------

  async cancel(
    id: string,
    dto: CancelTransferDto,
    userId: string,
  ): Promise<TransferDto> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Transferencia no encontrada');
    if (existing.status === TransferStatus.CANCELLED) {
      throw new ConflictException('La transferencia ya está cancelada');
    }

    await this.ds.transaction(async (manager) => {
      const items = await manager.getRepository(TransferItem).find({
        where: { transferId: id },
      });

      // Revertir: lo que salió de origen vuelve (TRANSFER_IN en origen), y lo
      // que entró en destino sale (TRANSFER_OUT en destino). El stock final
      // queda exactamente como antes de la transferencia.
      for (const it of items) {
        // Devolver a origen.
        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId: existing.fromWarehouseId,
          type: InventoryMovementType.TRANSFER_IN,
          qty: +it.qty,
          unitCost: it.unitCost,
          reference: existing.number,
          refId: existing.id,
          userId,
        });
        // Quitar de destino. Si el operador YA usó parte de ese stock en una
        // venta desde la bodega destino, esto deja el stock negativo y
        // applyMovement falla con 409 — comportamiento deseado: la cancelación
        // no es una operación "limpia" si ya hubo movimientos derivados.
        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId: existing.toWarehouseId,
          type: InventoryMovementType.TRANSFER_OUT,
          qty: -it.qty,
          unitCost: it.unitCost,
          reference: existing.number,
          refId: existing.id,
          userId,
        });
      }

      existing.status = TransferStatus.CANCELLED;
      existing.cancelledAt = new Date();
      existing.cancelReason = dto.reason.trim();
      existing.cancelledById = userId;
      await manager.getRepository(Transfer).save(existing);
    });

    return this.getOne(id);
  }

  // ---------------- helpers ----------------

  private async fetchItemsFor(
    transferIds: string[],
  ): Promise<Map<string, TransferItem[]>> {
    const map = new Map<string, TransferItem[]>();
    if (transferIds.length === 0) return map;
    const items = await this.itemRepo.find({
      where: { transferId: In(transferIds) },
      relations: { product: true },
      order: { id: 'ASC' },
    });
    for (const it of items) {
      const arr = map.get(it.transferId) ?? [];
      arr.push(it);
      map.set(it.transferId, arr);
    }
    return map;
  }

  private toDto(t: Transfer, items: TransferItem[]): TransferDto {
    return {
      id: t.id,
      number: t.number,
      fromWarehouseId: t.fromWarehouseId,
      fromWarehouse: t.fromWarehouse
        ? { id: t.fromWarehouse.id, name: t.fromWarehouse.name }
        : undefined,
      toWarehouseId: t.toWarehouseId,
      toWarehouse: t.toWarehouse
        ? { id: t.toWarehouse.id, name: t.toWarehouse.name }
        : undefined,
      date: t.date.toISOString(),
      notes: t.notes,
      status: t.status,
      cancelledAt: t.cancelledAt ? t.cancelledAt.toISOString() : null,
      cancelReason: t.cancelReason,
      cancelledBy: t.cancelledBy
        ? {
            id: t.cancelledBy.id,
            name: t.cancelledBy.name,
            email: t.cancelledBy.email,
          }
        : null,
      user: t.user
        ? { id: t.user.id, name: t.user.name, email: t.user.email }
        : undefined,
      items: items.map(
        (it): TransferItemDto => ({
          id: it.id,
          productId: it.productId,
          qty: it.qty,
          unitCost: it.unitCost,
          product: it.product
            ? {
                id: it.product.id,
                sku: it.product.sku,
                name: it.product.name,
                partNumber: it.product.partNumber,
              }
            : undefined,
        }),
      ),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
