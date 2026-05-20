import {
  CashTransactionSource,
  CashTransactionType,
  InventoryMovementType,
  PaymentMethod,
  RefundMode,
  ReturnDto,
  ReturnItemCondition,
  ReturnItemDto,
  ReturnReplacementItemDto,
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
  Product,
  PurchaseEntry,
  PurchaseEntryItem,
  Return,
  ReturnItem,
  ReturnReplacementItem,
  Sale,
  SaleItem,
  Warehouse,
} from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { SupplierCreditsService } from '../supplier-credits/supplier-credits.service';
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
    private readonly supplierCredits: SupplierCreditsService,
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
    const returnIds = items.map((r) => r.id);
    const [itemsByReturn, replacementsByReturn] = await Promise.all([
      this.fetchItemsFor(returnIds),
      this.fetchReplacementsFor(returnIds),
    ]);
    return {
      items: items.map((r) =>
        this.toDto(
          r,
          itemsByReturn.get(r.id) ?? [],
          replacementsByReturn.get(r.id) ?? [],
        ),
      ),
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
    const [items, replacements] = await Promise.all([
      this.fetchItemsFor([r.id]).then((m) => m.get(r.id) ?? []),
      this.fetchReplacementsFor([r.id]).then((m) => m.get(r.id) ?? []),
    ]);
    return this.toDto(r, items, replacements);
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

  /**
   * Ronda 11 — análogo a `returnedQtyBySale` para devoluciones a proveedor.
   * Devuelve la qty acumulada ya devuelta por cada `purchaseEntryItemId`.
   * Solo cuenta returns con status COMPLETED. El frontend lo usa para
   * limitar la qty máxima por línea (anti-doble-devolución).
   */
  async returnedQtyByPurchase(
    purchaseEntryId: string,
  ): Promise<Array<{ purchaseEntryItemId: string; qty: number }>> {
    const rows: Array<{ purchaseEntryItemId: string; total: string }> =
      await this.itemRepo
        .createQueryBuilder('ri')
        .innerJoin('returns', 'r', 'r.id = ri.returnId')
        .select('ri.purchaseEntryItemId', 'purchaseEntryItemId')
        .addSelect('SUM(ri.qty)', 'total')
        .where('r.purchaseEntryId = :pid', { pid: purchaseEntryId })
        .andWhere('r.status = :st', { st: ReturnStatus.COMPLETED })
        .andWhere('ri.purchaseEntryItemId IS NOT NULL')
        .groupBy('ri.purchaseEntryItemId')
        .getRawMany();
    return rows.map((r) => ({
      purchaseEntryItemId: r.purchaseEntryItemId,
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
      const purchaseItems = await this.purchaseItemRepo.find({
        where: { id: In(purchaseItemIds), entryId: purchase.id },
      });
      if (purchaseItems.length !== purchaseItemIds.length) {
        throw new BadRequestException(
          'Algún item no pertenece a la compra indicada',
        );
      }

      // Ronda 11 — anti-doble-devolución para SUPPLIER (simétrico al de
      // CUSTOMER). La suma de qty devuelta + nueva qty no puede exceder
      // lo originalmente comprado.
      const alreadyReturned = await this.returnedQtyByPurchase(purchase.id);
      const returnedMap = new Map(
        alreadyReturned.map((r) => [r.purchaseEntryItemId, r.qty]),
      );
      const purchaseItemById = new Map(purchaseItems.map((pi) => [pi.id, pi]));
      for (const it of dto.items) {
        const pi = purchaseItemById.get(it.purchaseEntryItemId!);
        if (!pi) continue;
        const alreadyQty = returnedMap.get(pi.id) ?? 0;
        if (alreadyQty + it.qty > pi.qty) {
          throw new ConflictException(
            `Se intentó devolver ${it.qty} de un item con ${pi.qty} compradas y ${alreadyQty} ya devueltas. Disponible para devolver: ${pi.qty - alreadyQty}.`,
          );
        }
      }

      // Ronda 11 — la bodega del RETURN_OUT es la misma de la compra
      // (donde llegó el stock originalmente). Antes caía al fallback
      // "Principal", lo que descontaba stock de la bodega equivocada
      // cuando la compra había ido a ML Full u otra bodega.
      //
      // `purchase.warehouseId` puede ser null en compras históricas
      // anteriores a Ronda 7 (sin warehouse asignado). En ese caso
      // caemos al fallback "primera bodega activa".
      if (purchase.warehouseId) {
        warehouseId = purchase.warehouseId;
      } else {
        const w = await this.warehouseRepo.findOne({
          where: { isActive: true },
          order: { name: 'ASC' },
        });
        if (!w) {
          throw new NotFoundException(
            'No hay bodegas activas configuradas',
          );
        }
        warehouseId = w.id;
      }
    }

    // Ronda 9 — validación de refundMode + combinatorias.
    const refundMode = dto.refundMode ?? RefundMode.MONEY;
    if (refundMode === RefundMode.CREDIT && dto.type !== ReturnType.SUPPLIER) {
      throw new BadRequestException(
        'El modo CREDIT sólo aplica a devoluciones a proveedor.',
      );
    }
    if (refundMode === RefundMode.EXCHANGE && dto.type !== ReturnType.CUSTOMER) {
      throw new BadRequestException(
        'El modo EXCHANGE sólo aplica a devoluciones de cliente.',
      );
    }
    if (refundMode === RefundMode.EXCHANGE) {
      if (!dto.replacementItems || dto.replacementItems.length === 0) {
        throw new BadRequestException(
          'El modo EXCHANGE requiere al menos un item de reemplazo.',
        );
      }
    } else if (dto.replacementItems && dto.replacementItems.length > 0) {
      throw new BadRequestException(
        'Sólo el modo EXCHANGE puede llevar items de reemplazo.',
      );
    }

    // Validar stock de los productos de reemplazo (existencia, no qty — el
    // applyMovement se encarga del lock pesimista por bodega).
    if (dto.replacementItems && dto.replacementItems.length > 0) {
      const replIds = [...new Set(dto.replacementItems.map((r) => r.productId))];
      const products = await this.ds.getRepository(Product).find({
        where: { id: In(replIds) },
      });
      if (products.length !== replIds.length) {
        throw new NotFoundException(
          'Algún producto de reemplazo no existe.',
        );
      }
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

      // Si EXCHANGE: sum de replacements. Diferencia = replacements − refund.
      // > 0 cliente paga, < 0 cliente recibe, = 0 sin cash transaction.
      const replacementTotal = (dto.replacementItems ?? []).reduce(
        (acc, r) => acc + r.qty * parseFloat(r.unitPrice),
        0,
      );
      const exchangeDifference =
        refundMode === RefundMode.EXCHANGE ? replacementTotal - refundAmount : 0;

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
        refundMode,
        supplierCreditId: null,
        exchangeDifference: exchangeDifference.toFixed(2),
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

        // Movimiento de inventario:
        // - CUSTOMER + RESELLABLE → RETURN_IN suma stock (vuelve al inventario).
        // - CUSTOMER + DAMAGED → RETURN_IN_DAMAGED (Ronda 7): registra el
        //   evento en /inventario/movimientos para auditoría pero NO toca
        //   `stocks` (el producto se descarta).
        // - SUPPLIER + RESELLABLE → RETURN_OUT descuenta stock.
        // - SUPPLIER + DAMAGED → idem CUSTOMER (registra evento sin tocar stock).
        if (dto.type === ReturnType.CUSTOMER) {
          if (it.itemCondition === ReturnItemCondition.RESELLABLE) {
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
            await this.inventory.recordMovementWithoutStockImpact(manager, {
              productId: it.productId,
              warehouseId,
              type: InventoryMovementType.RETURN_IN_DAMAGED,
              qty: +it.qty,
              unitCost,
              reference: number,
              refId: saved.id,
              userId,
            });
          }
        } else {
          if (it.itemCondition === ReturnItemCondition.RESELLABLE) {
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
          } else {
            // Devolución a proveedor con producto dañado: el producto no
            // estaba en nuestro stock (no descontamos), pero el evento
            // queda registrado para auditoría.
            await this.inventory.recordMovementWithoutStockImpact(manager, {
              productId: it.productId,
              warehouseId,
              type: InventoryMovementType.RETURN_IN_DAMAGED,
              qty: +it.qty,
              unitCost,
              reference: number,
              refId: saved.id,
              userId,
            });
          }
        }
      }

      // Ronda 9 — items de reemplazo (sólo EXCHANGE): SALE_OUT por cada uno.
      if (refundMode === RefundMode.EXCHANGE && dto.replacementItems) {
        for (const r of dto.replacementItems) {
          const product = await manager.getRepository(Product).findOne({
            where: { id: r.productId },
          });
          const unitCost = product?.cost ?? '0';
          const subtotal = (r.qty * parseFloat(r.unitPrice)).toFixed(2);
          const repl = manager.getRepository(ReturnReplacementItem).create({
            returnId: saved.id,
            productId: r.productId,
            qty: r.qty,
            unitPrice: r.unitPrice,
            unitCost,
            subtotal,
          });
          await manager.getRepository(ReturnReplacementItem).save(repl);

          // Descontar stock por el producto de reemplazo. Reusamos SALE_OUT
          // (semánticamente es una salida de venta — el cliente se lo lleva).
          // El refId es el del Return para trazabilidad.
          await this.inventory.applyMovement(manager, {
            productId: r.productId,
            warehouseId,
            type: InventoryMovementType.SALE_OUT,
            qty: -r.qty,
            unitCost,
            reference: number,
            refId: saved.id,
            userId,
          });
        }
      }

      // Ronda 9 — manejo de caja según refundMode:
      //
      //  MONEY  · CUSTOMER → EXPENSE (le devolvemos plata).
      //  MONEY  · SUPPLIER → INCOME (el proveedor nos paga).
      //  CREDIT · SUPPLIER → crea SupplierCredit. Sin movimiento de caja.
      //  EXCHANGE · CUSTOMER → según exchangeDifference:
      //    > 0  cliente paga la diferencia (INCOME).
      //    < 0  cliente recibe la diferencia (EXPENSE).
      //    = 0  sin movimiento de caja.
      if (refundMode === RefundMode.MONEY && refundAmount > 0) {
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
      } else if (refundMode === RefundMode.CREDIT && refundAmount > 0) {
        // Generamos el SupplierCredit y lo linkeamos al return.
        const credit = await this.supplierCredits.createFromReturn(manager, {
          supplierId: purchase!.supplierId,
          sourceReturnId: saved.id,
          amount: refundAmount.toFixed(2),
          userId,
        });
        saved.supplierCreditId = credit.id;
        await manager.getRepository(Return).save(saved);
      } else if (refundMode === RefundMode.EXCHANGE && exchangeDifference !== 0) {
        const isIncome = exchangeDifference > 0;
        await this.cashbox.recordTransaction(
          {
            date,
            type: isIncome
              ? CashTransactionType.INCOME
              : CashTransactionType.EXPENSE,
            source: CashTransactionSource.SALE_RETURN,
            sourceId: saved.id,
            description: isIncome
              ? `Diferencia a favor por cambio ${number}`
              : `Diferencia a devolver por cambio ${number}`,
            amount: Math.abs(exchangeDifference).toFixed(2),
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
      // Ronda 9 — para EXCHANGE necesitamos revertir también los SALE_OUT
      // de los replacement items.
      const replacements = await manager
        .getRepository(ReturnReplacementItem)
        .find({ where: { returnId: id } });

      // Si la devolución usó CRÉDITO, validamos que el crédito no se haya
      // gastado todavía. Si ya se aplicó a una compra, no se puede cancelar.
      if (
        existing.refundMode === RefundMode.CREDIT &&
        existing.supplierCreditId
      ) {
        await this.supplierCredits.voidCredit(
          existing.supplierCreditId,
          manager,
        );
      }

      // Revertir SALE_OUT de los replacement items (devuelve stock).
      for (const r of replacements) {
        await this.inventory.applyMovement(manager, {
          productId: r.productId,
          warehouseId: existing.warehouseId,
          type: InventoryMovementType.RETURN_IN,
          qty: +r.qty,
          unitCost: r.unitCost,
          reference: existing.number,
          refId: existing.id,
          userId,
        });
      }

      // Revertir movimientos de stock para los RESELLABLE. Los DAMAGED
      // originalmente emitieron un RETURN_IN_DAMAGED audit-only (no tocaron
      // `stocks`), así que al cancelar registramos un RETURN_DAMAGED_CANCELLED
      // también audit-only — la cancelación queda visible en el historial
      // sin alterar inventario.
      for (const it of items) {
        if (it.itemCondition !== ReturnItemCondition.RESELLABLE) {
          await this.inventory.recordMovementWithoutStockImpact(manager, {
            productId: it.productId,
            warehouseId: existing.warehouseId,
            type: InventoryMovementType.RETURN_DAMAGED_CANCELLED,
            qty: -it.qty,
            unitCost: it.unitCost,
            reference: existing.number,
            refId: existing.id,
            userId,
          });
          continue;
        }
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

  /**
   * Carga los items de reemplazo (Ronda 9, EXCHANGE) en batch para los
   * returnIds dados. Usa el repo del DataSource para no requerir un manager.
   */
  private async fetchReplacementsFor(
    returnIds: string[],
  ): Promise<Map<string, ReturnReplacementItem[]>> {
    const map = new Map<string, ReturnReplacementItem[]>();
    if (returnIds.length === 0) return map;
    const items = await this.ds.getRepository(ReturnReplacementItem).find({
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

  private toDto(
    r: Return,
    items: ReturnItem[],
    replacements: ReturnReplacementItem[] = [],
  ): ReturnDto {
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
      refundMode: r.refundMode,
      supplierCreditId: r.supplierCreditId,
      exchangeDifference: r.exchangeDifference,
      replacementItems: replacements.map(
        (it): ReturnReplacementItemDto => ({
          id: it.id,
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          unitCost: it.unitCost,
          subtotal: it.subtotal,
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
