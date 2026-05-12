import {
  CashTransactionSource,
  CashTransactionType,
  InventoryMovementType,
  PaymentMethod,
  ReturnDto,
  ReturnItemCondition,
  ReturnItemDto,
  ReturnStatus,
  ReturnType,
  ReturnedQtyDto,
  SaleStatus,
} from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { CashboxService } from '../cashbox/cashbox.service';
import { CountersService } from '../common/counters.service';
import { dayRange } from '../common/date-range';
import {
  CashTransaction,
  PurchaseEntry,
  PurchaseEntryItem,
  Return,
  ReturnItem,
  Sale,
  SaleItem,
  Warehouse,
} from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import {
  CancelReturnDto,
  CreateReturnDto,
  ListReturnsQueryDto,
} from './dto';

const COUNTER_KIND = 'RETURN';
const NUMBER_PREFIX = 'DEV';
const PAGE_SIZE_DEFAULT = 20;

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    @InjectRepository(Return) private readonly repo: Repository<Return>,
    @InjectRepository(ReturnItem)
    private readonly itemRepo: Repository<ReturnItem>,
    @InjectRepository(Sale) private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepo: Repository<SaleItem>,
    @InjectRepository(PurchaseEntry)
    private readonly purchaseRepo: Repository<PurchaseEntry>,
    @InjectRepository(PurchaseEntryItem)
    private readonly purchaseItemRepo: Repository<PurchaseEntryItem>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly counters: CountersService,
    private readonly inventory: InventoryService,
    private readonly cashbox: CashboxService,
  ) {}

  // ---------------- reads ----------------

  async list(query: ListReturnsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;

    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.sale', 'sale')
      .leftJoinAndSelect('r.purchaseEntry', 'purchase')
      .leftJoinAndSelect('r.warehouse', 'warehouse')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.cancelledBy', 'cancelledBy');

    if (query.type) qb.andWhere('r.type = :tp', { tp: query.type });
    if (query.status) qb.andWhere('r.status = :st', { st: query.status });
    if (query.saleId) qb.andWhere('r.saleId = :sid', { sid: query.saleId });
    if (query.purchaseEntryId)
      qb.andWhere('r.purchaseEntryId = :pid', { pid: query.purchaseEntryId });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('r.date BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('r.number LIKE :q', { q: `%${query.q}%` })
            .orWhere('sale.number LIKE :q')
            .orWhere('r.reason LIKE :q');
        }),
      );
    }

    qb.orderBy('r.date', 'DESC').addOrderBy('r.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);

    const [items, total] = await qb.getManyAndCount();
    const itemsByReturn = await this.fetchItemsFor(items.map((r) => r.id));
    return {
      items: items.map((r) => this.toDto(r, itemsByReturn.get(r.id) ?? [])),
      total,
      page,
      pageSize,
    };
  }

  async getOne(id: string): Promise<ReturnDto> {
    const r = await this.repo.findOne({
      where: { id },
      relations: {
        sale: true,
        purchaseEntry: true,
        warehouse: true,
        user: true,
        cancelledBy: true,
      },
    });
    if (!r) throw new NotFoundException('Devolución no encontrada');
    const items = (await this.fetchItemsFor([r.id])).get(r.id) ?? [];
    return this.toDto(r, items);
  }

  /**
   * Devuelve la cantidad acumulada YA DEVUELTA por cada saleItemId de una venta.
   * Solo cuenta returns con status COMPLETED (las CANCELLED no consumen el
   * cupo). El frontend usa esto para limitar la qty del form de devolución.
   */
  async returnedQtyBySale(saleId: string): Promise<ReturnedQtyDto[]> {
    const rows: Array<{ saleItemId: string; total: string }> = await this.itemRepo
      .createQueryBuilder('ri')
      .innerJoin('returns', 'r', 'r.id = ri.returnId')
      .select('ri.saleItemId', 'saleItemId')
      .addSelect('SUM(ri.qty)', 'total')
      .where('r.saleId = :saleId', { saleId })
      .andWhere('r.status = :st', { st: ReturnStatus.COMPLETED })
      .andWhere('ri.saleItemId IS NOT NULL')
      .groupBy('ri.saleItemId')
      .getRawMany();
    return rows.map((r) => ({
      saleItemId: r.saleItemId,
      qty: Number(r.total ?? 0),
    }));
  }

  // ---------------- create ----------------

  async create(dto: CreateReturnDto, userId: string): Promise<ReturnDto> {
    // Validación de coherencia entre type y saleId/purchaseEntryId.
    if (dto.type === ReturnType.CUSTOMER) {
      if (!dto.saleId) {
        throw new BadRequestException(
          'Devolución de cliente requiere `saleId`',
        );
      }
      if (dto.purchaseEntryId) {
        throw new BadRequestException(
          'Devolución de cliente no debe llevar `purchaseEntryId`',
        );
      }
    } else {
      if (!dto.purchaseEntryId) {
        throw new BadRequestException(
          'Devolución a proveedor requiere `purchaseEntryId`',
        );
      }
      if (dto.saleId) {
        throw new BadRequestException(
          'Devolución a proveedor no debe llevar `saleId`',
        );
      }
    }

    // Validación según tipo.
    let warehouseId: string;
    let sale: Sale | null = null;
    let purchase: PurchaseEntry | null = null;

    if (dto.type === ReturnType.CUSTOMER) {
      sale = await this.saleRepo.findOne({ where: { id: dto.saleId! } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === SaleStatus.CANCELLED) {
        throw new ConflictException(
          'La venta está cancelada — no se pueden registrar devoluciones sobre ella.',
        );
      }
      warehouseId = sale.warehouseId;

      // Anti-doble-devolución: para cada saleItem, qty acumulada + nueva qty
      // no puede exceder la cantidad vendida en ese item.
      const alreadyReturned = await this.returnedQtyBySale(sale.id);
      const returnedMap = new Map(
        alreadyReturned.map((r) => [r.saleItemId, r.qty]),
      );

      const saleItemIds = dto.items.map((i) => i.saleItemId).filter(Boolean) as string[];
      if (saleItemIds.length !== dto.items.length) {
        throw new BadRequestException(
          'Cada item debe traer `saleItemId` en devolución de cliente',
        );
      }
      const saleItems = await this.saleItemRepo.find({
        where: { id: In(saleItemIds), saleId: sale.id },
      });
      if (saleItems.length !== saleItemIds.length) {
        throw new BadRequestException(
          'Algún item no pertenece a la venta indicada',
        );
      }
      const saleItemById = new Map(saleItems.map((si) => [si.id, si]));
      for (const it of dto.items) {
        const si = saleItemById.get(it.saleItemId!);
        if (!si) continue;
        const alreadyQty = returnedMap.get(si.id) ?? 0;
        if (alreadyQty + it.qty > si.qty) {
          throw new ConflictException(
            `Se intentó devolver ${it.qty} de un item con ${si.qty} vendidas y ${alreadyQty} ya devueltas. Disponible para devolver: ${si.qty - alreadyQty}.`,
          );
        }
      }
    } else {
      // SUPPLIER
      purchase = await this.purchaseRepo.findOne({
        where: { id: dto.purchaseEntryId! },
      });
      if (!purchase) throw new NotFoundException('Compra no encontrada');

      const purchaseItemIds = dto.items
        .map((i) => i.purchaseEntryItemId)
        .filter(Boolean) as string[];
      if (purchaseItemIds.length !== dto.items.length) {
        throw new BadRequestException(
          'Cada item debe traer `purchaseEntryItemId` en devolución a proveedor',
        );
      }
      // Validamos que pertenezcan a la compra (anti-doble-devolución no se
      // implementa para SUPPLIER en este MVP — caso menos frecuente).
      const purchaseItems = await this.purchaseItemRepo.find({
        where: { id: In(purchaseItemIds), entryId: purchase.id },
      });
      if (purchaseItems.length !== purchaseItemIds.length) {
        throw new BadRequestException(
          'Algún item no pertenece a la compra indicada',
        );
      }

      // Para SUPPLIER, default warehouseId = bodega Principal.
      const w = await this.warehouseRepo.findOne({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
      if (!w) throw new NotFoundException('No hay bodegas activas configuradas');
      warehouseId = w.id;
    }

    const date = dto.date ? new Date(dto.date) : new Date();
    const year = date.getFullYear();

    const id = await this.ds.transaction(async (manager) => {
      const seq = await this.counters.nextNumber(COUNTER_KIND, year, manager);
      const number = CountersService.format(NUMBER_PREFIX, year, seq);

      const refundAmount = dto.items.reduce(
        (acc, it) => acc + it.qty * parseFloat(it.unitPrice),
        0,
      );

      const ret = manager.getRepository(Return).create({
        number,
        type: dto.type,
        saleId: sale?.id ?? null,
        purchaseEntryId: purchase?.id ?? null,
        warehouseId,
        date,
        reason: dto.reason.trim(),
        notes: dto.notes?.trim() || null,
        refundAmount: refundAmount.toFixed(2),
        paymentMethod: dto.paymentMethod,
        status: ReturnStatus.COMPLETED,
        userId,
      });
      const saved = await manager.getRepository(Return).save(ret);

      // Crear return_items + movimientos de stock (solo si RESELLABLE).
      for (const it of dto.items) {
        // Buscar el unitCost: del saleItem (CUSTOMER) o del purchaseItem (SUPPLIER).
        let unitCost = '0';
        if (dto.type === ReturnType.CUSTOMER && it.saleItemId) {
          const si = await manager.getRepository(SaleItem).findOne({
            where: { id: it.saleItemId },
          });
          unitCost = si?.unitCost ?? '0';
        } else if (
          dto.type === ReturnType.SUPPLIER &&
          it.purchaseEntryItemId
        ) {
          const pi = await manager
            .getRepository(PurchaseEntryItem)
            .findOne({ where: { id: it.purchaseEntryItemId } });
          unitCost = pi?.unitCost ?? '0';
        }

        const subtotal = (it.qty * parseFloat(it.unitPrice)).toFixed(2);
        const returnItem = manager.getRepository(ReturnItem).create({
          returnId: saved.id,
          productId: it.productId,
          saleItemId: it.saleItemId ?? null,
          purchaseEntryItemId: it.purchaseEntryItemId ?? null,
          qty: it.qty,
          unitPrice: it.unitPrice,
          unitCost,
          subtotal,
          itemCondition: it.itemCondition,
        });
        await manager.getRepository(ReturnItem).save(returnItem);

        // Movimiento de stock solo si el producto es RESELLABLE.
        // - CUSTOMER → RETURN_IN suma stock en bodega de la venta.
        // - SUPPLIER → RETURN_OUT saca stock de la bodega seleccionada.
        if (it.itemCondition === ReturnItemCondition.RESELLABLE) {
          if (dto.type === ReturnType.CUSTOMER) {
            await this.inventory.applyMovement(manager, {
              productId: it.productId,
              warehouseId,
              type: InventoryMovementType.RETURN_IN,
              qty: +it.qty,
              unitCost,
              reference: number,
              refId: saved.id,
              userId,
            });
          } else {
            await this.inventory.applyMovement(manager, {
              productId: it.productId,
              warehouseId,
              type: InventoryMovementType.RETURN_OUT,
              qty: -it.qty,
              unitCost,
              reference: number,
              refId: saved.id,
              userId,
            });
          }
        }
      }

      // Cash transaction:
      // - CUSTOMER → EXPENSE (le devolvemos plata al cliente).
      // - SUPPLIER → INCOME (el proveedor nos devuelve plata).
      if (refundAmount > 0) {
        await this.cashbox.recordTransaction(
          {
            date,
            type:
              dto.type === ReturnType.CUSTOMER
                ? CashTransactionType.EXPENSE
                : CashTransactionType.INCOME,
            source:
              dto.type === ReturnType.CUSTOMER
                ? CashTransactionSource.SALE_RETURN
                : CashTransactionSource.PURCHASE_RETURN,
            sourceId: saved.id,
            description:
              dto.type === ReturnType.CUSTOMER
                ? `Reembolso devolución ${number}`
                : `Cobro devolución a proveedor ${number}`,
            amount: refundAmount.toFixed(2),
            paymentMethod: dto.paymentMethod,
            expenseCategoryId: null,
            userId,
          },
          manager,
        );
      }

      return saved.id;
    });

    return this.getOne(id);
  }

  // ---------------- cancel ----------------

  async cancel(
    id: string,
    dto: CancelReturnDto,
    userId: string,
  ): Promise<ReturnDto> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Devolución no encontrada');
    if (existing.status === ReturnStatus.CANCELLED) {
      throw new ConflictException('La devolución ya está cancelada');
    }

    await this.ds.transaction(async (manager) => {
      const items = await manager
        .getRepository(ReturnItem)
        .find({ where: { returnId: id } });

      // Revertir movimientos de stock (solo los que SÍ emitimos, o sea
      // los RESELLABLE). Los DAMAGED no movieron stock al crear, así que
      // tampoco hay nada que revertir al cancelar.
      for (const it of items) {
        if (it.itemCondition !== ReturnItemCondition.RESELLABLE) continue;
        if (existing.type === ReturnType.CUSTOMER) {
          // Habíamos sumado stock (RETURN_IN) — al cancelar lo sacamos (RETURN_OUT).
          await this.inventory.applyMovement(manager, {
            productId: it.productId,
            warehouseId: existing.warehouseId,
            type: InventoryMovementType.RETURN_OUT,
            qty: -it.qty,
            unitCost: it.unitCost,
            reference: existing.number,
            refId: existing.id,
            userId,
          });
        } else {
          // Habíamos sacado stock (RETURN_OUT) — al cancelar lo devolvemos (RETURN_IN).
          await this.inventory.applyMovement(manager, {
            productId: it.productId,
            warehouseId: existing.warehouseId,
            type: InventoryMovementType.RETURN_IN,
            qty: +it.qty,
            unitCost: it.unitCost,
            reference: existing.number,
            refId: existing.id,
            userId,
          });
        }
      }

      // Anular la cash transaction (si la hubo).
      const cashTxs = await manager.getRepository(CashTransaction).find({
        where: {
          source:
            existing.type === ReturnType.CUSTOMER
              ? CashTransactionSource.SALE_RETURN
              : CashTransactionSource.PURCHASE_RETURN,
          sourceId: existing.id,
          isVoided: false,
        },
      });
      for (const tx of cashTxs) {
        await this.cashbox.voidTransaction(tx.id, userId, manager);
      }

      existing.status = ReturnStatus.CANCELLED;
      existing.cancelledAt = new Date();
      existing.cancelReason = dto.reason.trim();
      existing.cancelledById = userId;
      await manager.getRepository(Return).save(existing);
    });

    return this.getOne(id);
  }

  // ---------------- helpers ----------------

  private async fetchItemsFor(
    returnIds: string[],
  ): Promise<Map<string, ReturnItem[]>> {
    const map = new Map<string, ReturnItem[]>();
    if (returnIds.length === 0) return map;
    const items = await this.itemRepo.find({
      where: { returnId: In(returnIds) },
      relations: { product: true },
      order: { id: 'ASC' },
    });
    for (const it of items) {
      const arr = map.get(it.returnId) ?? [];
      arr.push(it);
      map.set(it.returnId, arr);
    }
    return map;
  }

  private toDto(r: Return, items: ReturnItem[]): ReturnDto {
    return {
      id: r.id,
      number: r.number,
      type: r.type,
      saleId: r.saleId,
      sale: r.sale
        ? { id: r.sale.id, number: r.sale.number, customerId: r.sale.customerId }
        : null,
      purchaseEntryId: r.purchaseEntryId,
      purchaseEntry: r.purchaseEntry
        ? { id: r.purchaseEntry.id, supplierId: r.purchaseEntry.supplierId }
        : null,
      warehouseId: r.warehouseId,
      warehouse: r.warehouse
        ? { id: r.warehouse.id, name: r.warehouse.name }
        : undefined,
      date: r.date.toISOString(),
      reason: r.reason,
      notes: r.notes,
      refundAmount: r.refundAmount,
      paymentMethod: r.paymentMethod as PaymentMethod,
      status: r.status,
      cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
      cancelReason: r.cancelReason,
      cancelledBy: r.cancelledBy
        ? {
            id: r.cancelledBy.id,
            name: r.cancelledBy.name,
            email: r.cancelledBy.email,
          }
        : null,
      user: r.user
        ? { id: r.user.id, name: r.user.name, email: r.user.email }
        : undefined,
      items: items.map(
        (it): ReturnItemDto => ({
          id: it.id,
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          unitCost: it.unitCost,
          subtotal: it.subtotal,
          itemCondition: it.itemCondition,
          saleItemId: it.saleItemId,
          purchaseEntryItemId: it.purchaseEntryItemId,
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
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
