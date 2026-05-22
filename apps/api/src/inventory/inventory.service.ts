import {
  InventoryMovementType,
  type MovementCardDto,
  type MovementCardEntryDto,
} from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';
import { dayRange } from '../common/date-range';
import {
  DispatchNote,
  InventoryMovement,
  Product,
  PurchaseEntry,
  Return,
  Sale,
  Stock,
  Transfer,
  Warehouse,
} from '../database/entities';
import {
  AdjustStockDto,
  ListMovementCardsQueryDto,
  ListMovementsQueryDto,
  ListStockQueryDto,
} from './dto';

const MOVEMENTS_PAGE_SIZE = 50;

// Ronda 13 — tipos de movimiento que NO afectan stock (eventos audit-only).
// El frontend los pinta con un badge gris "Auditoría · no afecta stock".
const AUDIT_ONLY_TYPES: Set<InventoryMovementType> = new Set([
  InventoryMovementType.DISPATCH_OUT,
  InventoryMovementType.DISPATCH_VOIDED,
  InventoryMovementType.RETURN_IN_DAMAGED,
  InventoryMovementType.RETURN_DAMAGED_CANCELLED,
]);

// Ronda 13 — mapea cada tipo de movimiento a la entidad padre que se debe
// joinear para armar la card. Una venta sale como SALE_OUT y eventualmente
// se "promueve" a Return si el SALE_OUT en realidad vino de un replacement
// EXCHANGE (la lógica vive en `listMovementCards`).
type MovementCardKind =
  | 'PURCHASE'
  | 'SALE'
  | 'RETURN'
  | 'TRANSFER'
  | 'DISPATCH'
  | 'ADJUSTMENT'
  | 'ORPHAN';

// Forma común de la base de cualquier card. La usan `buildReturnCard` y
// `buildOrphanCard` para pasarse la base ya armada por `buildCard`.
interface CardBaseShape {
  groupKey: string;
  latestAt: string;
  user: { id: string; name: string; email: string } | null;
  movements: MovementCardEntryDto[];
  totalQty: number;
  itemCount: number;
  isAuditOnly: boolean;
}

function movementKindOf(type: InventoryMovementType): MovementCardKind {
  switch (type) {
    case InventoryMovementType.PURCHASE_IN:
      return 'PURCHASE';
    case InventoryMovementType.SALE_OUT:
      return 'SALE';
    case InventoryMovementType.RETURN_IN:
    case InventoryMovementType.RETURN_OUT:
    case InventoryMovementType.RETURN_IN_DAMAGED:
    case InventoryMovementType.RETURN_DAMAGED_CANCELLED:
      return 'RETURN';
    case InventoryMovementType.TRANSFER_OUT:
    case InventoryMovementType.TRANSFER_IN:
      return 'TRANSFER';
    case InventoryMovementType.DISPATCH_OUT:
    case InventoryMovementType.DISPATCH_VOIDED:
      return 'DISPATCH';
    case InventoryMovementType.ADJUSTMENT:
      return 'ADJUSTMENT';
    default:
      return 'ORPHAN';
  }
}

export interface ApplyMovementInput {
  productId: string;
  warehouseId: string;
  type: InventoryMovementType;
  // Cantidad SIGNADA: positiva para entradas, negativa para salidas.
  qty: number;
  unitCost?: string | null;
  reference?: string | null;
  refId?: string | null;
  userId: string;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Warehouse) private readonly warehouses: Repository<Warehouse>,
    @InjectRepository(Stock) private readonly stocks: Repository<Stock>,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
    // Ronda 13 — repositorios usados por `listMovementCards` para joinear
    // los grupos de movimientos con su entidad padre (sale, purchase, etc.).
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(PurchaseEntry)
    private readonly purchases: Repository<PurchaseEntry>,
    @InjectRepository(Return) private readonly returns: Repository<Return>,
    @InjectRepository(Transfer) private readonly transfers: Repository<Transfer>,
    @InjectRepository(DispatchNote)
    private readonly dispatches: Repository<DispatchNote>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * ÚNICA forma de mutar stock. Inserta el movimiento y actualiza el caché
   * `stocks` en la misma transacción del manager recibido. Falla si el stock
   * resultante quedaría negativo.
   *
   * Recibe un `EntityManager` para componerse con transacciones externas
   * (p. ej. PurchasesService llama N veces dentro de su propia transacción).
   */
  async applyMovement(
    manager: EntityManager,
    input: ApplyMovementInput,
  ): Promise<InventoryMovement> {
    if (input.qty === 0) {
      throw new BadRequestException('qty no puede ser 0');
    }

    // Validar producto y almacén dentro de la transacción.
    const product = await manager.findOne(Product, { where: { id: input.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const warehouse = await manager.findOne(Warehouse, { where: { id: input.warehouseId } });
    if (!warehouse) throw new NotFoundException('Almacén no encontrado');

    // Insertar movimiento.
    const movement = manager.create(InventoryMovement, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      qty: input.qty,
      unitCost: input.unitCost ?? null,
      reference: input.reference ?? null,
      refId: input.refId ?? null,
      userId: input.userId,
    });
    await manager.save(movement);

    // Upsert atómico del stock (incremento/decremento).
    // ON DUPLICATE KEY UPDATE garantiza que dos transacciones concurrentes
    // serializan el update, en vez de pisarse.
    await manager.query(
      `INSERT INTO stocks (id, productId, warehouseId, quantity, updatedAt)
       VALUES (UUID(), ?, ?, ?, NOW(6))
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), updatedAt = NOW(6)`,
      [input.productId, input.warehouseId, input.qty],
    );

    // Validar que no quedó negativo.
    const updated = await manager.findOne(Stock, {
      where: { productId: input.productId, warehouseId: input.warehouseId },
    });
    if (updated && updated.quantity < 0) {
      throw new ConflictException(
        `Stock insuficiente para "${product.name}". Disponible: ${
          updated.quantity - input.qty
        }, requerido: ${Math.abs(input.qty)}.`,
      );
    }

    return movement;
  }

  /**
   * Inserta una fila en `inventory_movements` SIN modificar `stocks`. Usado
   * para registrar eventos informativos que no mueven inventario real,
   * como devoluciones de cliente con producto dañado (`RETURN_IN_DAMAGED`,
   * Ronda 7). Comparte la misma firma que `applyMovement` para que el
   * caller switchee entre uno y otro según la condición del item.
   *
   * NO valida `qty > 0` ni intenta upsertear el stock — solo persiste
   * el registro de auditoría con la metadata que recibe.
   */
  async recordMovementWithoutStockImpact(
    manager: EntityManager,
    input: ApplyMovementInput,
  ): Promise<InventoryMovement> {
    const product = await manager.findOne(Product, { where: { id: input.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const warehouse = await manager.findOne(Warehouse, { where: { id: input.warehouseId } });
    if (!warehouse) throw new NotFoundException('Almacén no encontrado');

    const movement = manager.create(InventoryMovement, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      qty: input.qty,
      unitCost: input.unitCost ?? null,
      reference: input.reference ?? null,
      refId: input.refId ?? null,
      userId: input.userId,
    });
    return manager.save(movement);
  }

  /** Endpoint de ajuste manual: corre applyMovement en una transacción nueva. */
  async adjust(dto: AdjustStockDto, userId: string) {
    const warehouseId = dto.warehouseId ?? (await this.defaultWarehouseId());
    return this.dataSource.transaction(async (manager) =>
      this.applyMovement(manager, {
        productId: dto.productId,
        warehouseId,
        type: InventoryMovementType.ADJUSTMENT,
        qty: dto.qty,
        unitCost: dto.qty > 0 ? dto.unitCost ?? null : null,
        reference: 'Adjustment',
        refId: null,
        userId,
      }).then(async (mov) => ({
        movement: mov,
        reason: dto.reason,
      })),
    );
  }

  /**
   * Ronda 13 — listado de movimientos agrupados por transacción (refId) y
   * enriquecidos con la entidad padre. Una venta de 5 productos = 1 card; una
   * transferencia = 1 card con OUT e IN combinados; un ajuste manual = 1 card
   * singleton. Los eventos de auditoría (DISPATCH_*, RETURN_DAMAGED_CANCELLED)
   * se devuelven con `isAuditOnly=true` para que el frontend los pinte distinto.
   *
   * Algoritmo:
   *  1. Resolver la lista de `groupKey` (refId || id) paginada con un SELECT
   *     DISTINCT … ORDER BY MAX(createdAt) DESC para que cada grupo aparezca
   *     una sola vez en la página correspondiente.
   *  2. Cargar TODOS los movimientos de esos groupKeys con relaciones básicas.
   *  3. Cargar la entidad padre por groupKey según el tipo dominante:
   *     - PURCHASE_IN → PurchaseEntry + supplier + items + invoices
   *     - SALE_OUT → Sale + customer + items + quotation
   *     - RETURN_* → Return + customer/supplier + sale/purchase origin + items
   *     - TRANSFER_OUT/IN → Transfer + fromWarehouse + toWarehouse + items
   *     - DISPATCH_OUT/VOIDED → DispatchNote + sale + customer + commune
   *     - ADJUSTMENT (refId nulo) → singleton sin entidad padre
   *  4. Armar la card discriminada y devolverla.
   */
  async listMovementCards(query: ListMovementCardsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    // Paso 1: armar el query base de grupos. Usamos una subquery contra
    // inventory_movements con los filtros del usuario y agrupamos por
    // (COALESCE(refId, id)). El `latestAt` decide el orden de la página.
    const subQb = this.dataSource
      .createQueryBuilder()
      .from('inventory_movements', 'im')
      .select('COALESCE(im.refId, im.id)', 'groupKey')
      .addSelect('MAX(im.createdAt)', 'latestAt')
      .groupBy('COALESCE(im.refId, im.id)');

    if (query.productId)
      subQb.andWhere('im.productId = :productId', { productId: query.productId });
    if (query.warehouseId)
      subQb.andWhere('im.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
    if (query.userId)
      subQb.andWhere('im.userId = :userId', { userId: query.userId });
    if (query.type) subQb.andWhere('im.type = :type', { type: query.type });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      subQb.andWhere('im.createdAt BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      const q = `%${query.q}%`;
      // Búsqueda libre: reference (sale/purchase/return/transfer number) o
      // SKU/nombre del producto vía exists subquery (evita join sobre todos).
      subQb.andWhere(
        `(
          im.reference LIKE :q
          OR EXISTS (
            SELECT 1 FROM products p
            WHERE p.id = im.productId
              AND (p.sku LIKE :q OR p.name LIKE :q OR p.partNumber LIKE :q)
          )
          OR EXISTS (
            SELECT 1 FROM sales s
            INNER JOIN customers c ON c.id = s.customerId
            WHERE s.id = im.refId AND (s.number LIKE :q OR c.name LIKE :q)
          )
          OR EXISTS (
            SELECT 1 FROM purchase_entries pe
            INNER JOIN suppliers sup ON sup.id = pe.supplierId
            WHERE pe.id = im.refId AND sup.name LIKE :q
          )
        )`,
        { q },
      );
    }
    if (query.customerId) {
      subQb.andWhere(
        `(
          EXISTS (SELECT 1 FROM sales s WHERE s.id = im.refId AND s.customerId = :customerId)
          OR EXISTS (
            SELECT 1 FROM returns r
            INNER JOIN sales s2 ON s2.id = r.saleId
            WHERE r.id = im.refId AND s2.customerId = :customerId
          )
          OR EXISTS (
            SELECT 1 FROM dispatch_notes dn
            INNER JOIN sales s3 ON s3.id = dn.saleId
            WHERE dn.id = im.refId AND s3.customerId = :customerId
          )
        )`,
        { customerId: query.customerId },
      );
    }
    if (query.supplierId) {
      subQb.andWhere(
        `(
          EXISTS (SELECT 1 FROM purchase_entries pe WHERE pe.id = im.refId AND pe.supplierId = :supplierId)
          OR EXISTS (
            SELECT 1 FROM returns r
            INNER JOIN purchase_entries pe2 ON pe2.id = r.purchaseEntryId
            WHERE r.id = im.refId AND pe2.supplierId = :supplierId
          )
        )`,
        { supplierId: query.supplierId },
      );
    }
    if (query.status) {
      // Mostrar solo activos vs solo cancelados. La regla de "activo" depende
      // de cada tabla padre — los ajustes y compras (que no tienen estado
      // cancelable) cuentan como activos por defecto. Si el refId no matchea
      // ninguna tabla con estado, se considera activo (orphan/legacy).
      const cancelledClause = `(
        EXISTS (SELECT 1 FROM sales s WHERE s.id = im.refId AND s.status = 'CANCELLED')
        OR EXISTS (SELECT 1 FROM returns r WHERE r.id = im.refId AND r.status = 'CANCELLED')
        OR EXISTS (SELECT 1 FROM transfers t WHERE t.id = im.refId AND t.status = 'CANCELLED')
        OR EXISTS (SELECT 1 FROM dispatch_notes dn WHERE dn.id = im.refId AND dn.status = 'VOIDED')
      )`;
      if (query.status === 'cancelled') {
        subQb.andWhere(cancelledClause);
      } else {
        subQb.andWhere(`NOT ${cancelledClause}`);
      }
    }

    // Total de grupos (para la paginación). Hacemos un COUNT sobre el query
    // sin LIMIT/OFFSET.
    const totalRows = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'cnt')
      .from(`(${subQb.getQuery()})`, 'g')
      .setParameters(subQb.getParameters())
      .getRawOne<{ cnt: string }>();
    const total = Number(totalRows?.cnt ?? 0);

    // Aplicar orden + paginación al subquery y traer los groupKeys.
    const groupRows = await subQb
      .orderBy('latestAt', 'DESC')
      .limit(pageSize)
      .offset(offset)
      .getRawMany<{ groupKey: string; latestAt: Date }>();

    if (groupRows.length === 0) {
      return { items: [] as MovementCardDto[], total, page, pageSize };
    }

    const groupKeys = groupRows.map((r) => r.groupKey);
    const orderIndex = new Map(groupKeys.map((k, i) => [k, i] as const));

    // Paso 2: cargar todos los movimientos de los grupos con relaciones
    // mínimas (producto + bodega + usuario).
    const allMovements = await this.movements
      .createQueryBuilder('im')
      .leftJoinAndSelect('im.product', 'product')
      .leftJoinAndSelect('im.warehouse', 'warehouse')
      .leftJoinAndSelect('im.user', 'user')
      .where(
        `COALESCE(im.refId, im.id) IN (:...groupKeys)`,
        { groupKeys },
      )
      .orderBy('im.createdAt', 'ASC')
      .getMany();

    // Agrupar movimientos por groupKey en memoria.
    const byGroup = new Map<string, InventoryMovement[]>();
    for (const m of allMovements) {
      const key = m.refId ?? m.id;
      const arr = byGroup.get(key);
      if (arr) arr.push(m);
      else byGroup.set(key, [m]);
    }

    // Paso 3: cargar entidades padre por groupKey según el tipo dominante.
    // Determinamos el "kind" de la card en base al primer movimiento del grupo.
    const purchaseIds: string[] = [];
    const saleIds: string[] = [];
    const returnIds: string[] = [];
    const transferIds: string[] = [];
    const dispatchIds: string[] = [];

    for (const [key, movs] of byGroup) {
      const first = movs[0]!;
      const kind = movementKindOf(first.type);
      if (kind === 'PURCHASE') purchaseIds.push(key);
      else if (kind === 'SALE') saleIds.push(key);
      else if (kind === 'RETURN') returnIds.push(key);
      else if (kind === 'TRANSFER') transferIds.push(key);
      else if (kind === 'DISPATCH') dispatchIds.push(key);
    }

    // SALE_OUT también puede provenir de un Return en modo EXCHANGE (refId
    // apunta al Return, no al Sale). Detectamos esos casos cuando el lookup
    // de Sale por groupKey no devuelve nada y caemos a Return.
    const [
      purchaseRows,
      saleRows,
      returnRows,
      transferRows,
      dispatchRows,
    ] = await Promise.all([
      purchaseIds.length
        ? this.purchases.find({
            where: { id: In(purchaseIds) },
            relations: {
              supplier: true,
              warehouse: true,
              items: { product: true },
              invoices: true,
            },
          })
        : Promise.resolve([] as PurchaseEntry[]),
      saleIds.length
        ? this.sales.find({
            where: { id: In(saleIds) },
            relations: {
              customer: true,
              warehouse: true,
              items: { product: true },
              quotation: true,
            },
          })
        : Promise.resolve([] as Sale[]),
      returnIds.length
        ? this.returns.find({
            where: { id: In(returnIds) },
            relations: {
              sale: { customer: true },
              purchaseEntry: { supplier: true },
              warehouse: true,
              items: { product: true },
            },
          })
        : Promise.resolve([] as Return[]),
      transferIds.length
        ? this.transfers.find({
            where: { id: In(transferIds) },
            relations: {
              fromWarehouse: true,
              toWarehouse: true,
              items: { product: true },
            },
          })
        : Promise.resolve([] as Transfer[]),
      dispatchIds.length
        ? this.dispatches.find({
            where: { id: In(dispatchIds) },
            relations: {
              sale: { customer: true },
              commune: true,
            },
          })
        : Promise.resolve([] as DispatchNote[]),
    ]);

    const purchaseById = new Map(purchaseRows.map((p) => [p.id, p]));
    const saleById = new Map(saleRows.map((s) => [s.id, s]));
    const returnById = new Map(returnRows.map((r) => [r.id, r]));
    const transferById = new Map(transferRows.map((t) => [t.id, t]));
    const dispatchById = new Map(dispatchRows.map((d) => [d.id, d]));

    // Detectar SALE_OUT con refId que en realidad apunta a un Return (caso
    // EXCHANGE: items de reemplazo). Si el saleId no matchea pero está en
    // returnById, lo mapeamos como Return.
    const saleIdsToRetry = saleIds.filter((id) => !saleById.has(id));
    const extraReturns: Return[] = saleIdsToRetry.length
      ? await this.returns.find({
          where: { id: In(saleIdsToRetry) },
          relations: {
            sale: { customer: true },
            purchaseEntry: { supplier: true },
            warehouse: true,
            items: { product: true },
          },
        })
      : [];
    for (const r of extraReturns) returnById.set(r.id, r);

    // Paso 4: armar las cards en el orden de los groupKeys (ya viene del SQL).
    const cards: MovementCardDto[] = [];
    for (const [key, movs] of byGroup) {
      const card = this.buildCard(
        key,
        movs,
        purchaseById,
        saleById,
        returnById,
        transferById,
        dispatchById,
      );
      if (card) cards.push(card);
    }

    cards.sort((a, b) => {
      const ai = orderIndex.get(a.groupKey) ?? 0;
      const bi = orderIndex.get(b.groupKey) ?? 0;
      return ai - bi;
    });

    return { items: cards, total, page, pageSize };
  }

  /**
   * Construye una card concreta para un grupo de movimientos. Devuelve null
   * si el grupo está vacío (no debería pasar pero defensivo).
   */
  private buildCard(
    groupKey: string,
    movs: InventoryMovement[],
    purchaseById: Map<string, PurchaseEntry>,
    saleById: Map<string, Sale>,
    returnById: Map<string, Return>,
    transferById: Map<string, Transfer>,
    dispatchById: Map<string, DispatchNote>,
  ): MovementCardDto | null {
    if (movs.length === 0) return null;
    const first = movs[0]!;
    const last = movs[movs.length - 1]!;
    const latestAt = movs.reduce(
      (acc, m) => (m.createdAt > acc ? m.createdAt : acc),
      first.createdAt,
    );

    const user = last.user
      ? { id: last.user.id, name: last.user.name, email: last.user.email }
      : null;

    const movements: MovementCardEntryDto[] = movs.map((m) => ({
      movementId: m.id,
      type: m.type,
      qty: m.qty,
      unitCost: m.unitCost,
      product: m.product
        ? { id: m.product.id, sku: m.product.sku, name: m.product.name }
        : { id: m.productId, sku: null, name: '(producto eliminado)' },
      warehouse: m.warehouse
        ? { id: m.warehouse.id, name: m.warehouse.name }
        : { id: m.warehouseId, name: '(bodega eliminada)' },
      createdAt: m.createdAt.toISOString(),
    }));

    const totalQty = movs.reduce((acc, m) => acc + Math.abs(m.qty), 0);
    // Cantidad de productos distintos (líneas).
    const itemCount = new Set(movs.map((m) => m.productId)).size;

    const base = {
      groupKey,
      latestAt: latestAt.toISOString(),
      user,
      movements,
      totalQty,
      itemCount,
      isAuditOnly: AUDIT_ONLY_TYPES.has(first.type),
    } as const;

    const kind = movementKindOf(first.type);

    if (kind === 'PURCHASE') {
      const p = purchaseById.get(groupKey);
      if (!p) return this.buildOrphanCard(base, first);
      return {
        ...base,
        kind: 'PURCHASE',
        purchase: {
          id: p.id,
          supplier: p.supplier
            ? { id: p.supplier.id, name: p.supplier.name, taxId: p.supplier.taxId }
            : null,
          warehouse: p.warehouse
            ? { id: p.warehouse.id, name: p.warehouse.name }
            : null,
          date: p.date.toISOString(),
          total: p.total,
          subtotal: p.subtotal,
          taxAmount: p.taxAmount,
          notes: p.notes,
          invoices: (p.invoices ?? []).map((inv) => ({
            id: inv.id,
            url: inv.url,
            originalName: inv.originalName,
            mimeType: inv.mimeType,
          })),
          items: (p.items ?? []).map((it) => ({
            product: it.product
              ? {
                  id: it.product.id,
                  sku: it.product.sku,
                  name: it.product.name,
                }
              : { id: it.productId, sku: null, name: '(producto eliminado)' },
            qty: it.qty,
            unitCost: it.unitCost,
            subtotal: it.subtotal,
          })),
        },
      };
    }

    if (kind === 'SALE') {
      const s = saleById.get(groupKey);
      // Si no encontramos Sale pero sí Return, el SALE_OUT viene de un
      // replacement (RefundMode.EXCHANGE). Lo mostramos como card de Return.
      if (!s) {
        const r = returnById.get(groupKey);
        if (r) return this.buildReturnCard(base, r);
        return this.buildOrphanCard(base, first);
      }
      return {
        ...base,
        kind: 'SALE',
        sale: {
          id: s.id,
          number: s.number,
          customer: s.customer
            ? {
                id: s.customer.id,
                name: s.customer.name,
                taxId: s.customer.taxId,
                phone: s.customer.phone,
              }
            : null,
          warehouse: s.warehouse
            ? { id: s.warehouse.id, name: s.warehouse.name }
            : { id: s.warehouseId, name: '(bodega eliminada)' },
          date: s.date.toISOString(),
          paymentMethod: s.paymentMethod,
          status: s.status,
          subtotal: s.subtotal,
          taxAmount: s.taxAmount,
          commissionAmount: s.commissionAmount,
          total: s.total,
          quotationId: s.quotationId,
          quotationNumber: s.quotation?.number ?? null,
          notes: s.notes,
          cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
          cancelReason: s.cancelReason,
          items: (s.items ?? []).map((it) => ({
            product: it.product
              ? {
                  id: it.product.id,
                  sku: it.product.sku,
                  name: it.product.name,
                }
              : { id: it.productId, sku: null, name: '(producto eliminado)' },
            qty: it.qty,
            unitPrice: it.unitPrice,
            discount: it.discount,
            subtotal: it.subtotal,
          })),
        },
      };
    }

    if (kind === 'RETURN') {
      const r = returnById.get(groupKey);
      if (!r) return this.buildOrphanCard(base, first);
      return this.buildReturnCard(base, r);
    }

    if (kind === 'TRANSFER') {
      const t = transferById.get(groupKey);
      if (!t) return this.buildOrphanCard(base, first);
      return {
        ...base,
        kind: 'TRANSFER',
        transfer: {
          id: t.id,
          number: t.number,
          fromWarehouse: t.fromWarehouse
            ? { id: t.fromWarehouse.id, name: t.fromWarehouse.name }
            : { id: t.fromWarehouseId, name: '(bodega eliminada)' },
          toWarehouse: t.toWarehouse
            ? { id: t.toWarehouse.id, name: t.toWarehouse.name }
            : { id: t.toWarehouseId, name: '(bodega eliminada)' },
          date: t.date.toISOString(),
          notes: t.notes,
          status: t.status,
          cancelledAt: t.cancelledAt ? t.cancelledAt.toISOString() : null,
          cancelReason: t.cancelReason,
          items: (t.items ?? []).map((it) => ({
            product: it.product
              ? {
                  id: it.product.id,
                  sku: it.product.sku,
                  name: it.product.name,
                }
              : { id: it.productId, sku: null, name: '(producto eliminado)' },
            qty: it.qty,
            unitCost: it.unitCost,
          })),
        },
      };
    }

    if (kind === 'DISPATCH') {
      const d = dispatchById.get(groupKey);
      if (!d) return this.buildOrphanCard(base, first);
      return {
        ...base,
        kind: 'DISPATCH',
        dispatch: {
          id: d.id,
          number: d.number,
          sale: {
            id: d.saleId,
            number: d.sale?.number ?? '—',
          },
          customer: d.sale?.customer
            ? {
                id: d.sale.customer.id,
                name: d.sale.customer.name,
                taxId: d.sale.customer.taxId,
              }
            : null,
          dispatchedAt: d.dispatchedAt.toISOString(),
          carrier: d.carrier,
          trackingNumber: d.trackingNumber,
          addressStreet: d.addressStreet,
          addressNumber: d.addressNumber,
          commune: d.commune
            ? {
                id: d.commune.id,
                name: d.commune.name,
                region: d.commune.region,
              }
            : null,
          addressNotes: d.addressNotes,
          notes: d.notes,
          status: d.status,
          eventType:
            first.type === InventoryMovementType.DISPATCH_VOIDED
              ? 'DISPATCH_VOIDED'
              : 'DISPATCH_OUT',
          voidedAt: d.voidedAt ? d.voidedAt.toISOString() : null,
          voidReason: d.voidReason,
        },
      };
    }

    // ADJUSTMENT (refId nulo) o cualquier otro caso: singleton sin padre.
    if (first.type === InventoryMovementType.ADJUSTMENT) {
      return { ...base, kind: 'ADJUSTMENT' };
    }

    return this.buildOrphanCard(base, first);
  }

  private buildReturnCard(base: CardBaseShape, r: Return): MovementCardDto {
    return {
      ...base,
      kind: 'RETURN',
      return: {
        id: r.id,
        number: r.number,
        type: r.type,
        customer:
          r.type === 'CUSTOMER' && r.sale?.customer
            ? {
                id: r.sale.customer.id,
                name: r.sale.customer.name,
                taxId: r.sale.customer.taxId,
                phone: r.sale.customer.phone,
              }
            : null,
        supplier:
          r.type === 'SUPPLIER' && r.purchaseEntry?.supplier
            ? {
                id: r.purchaseEntry.supplier.id,
                name: r.purchaseEntry.supplier.name,
                taxId: r.purchaseEntry.supplier.taxId,
              }
            : null,
        saleOrigin: r.sale
          ? { id: r.sale.id, number: r.sale.number }
          : null,
        purchaseOrigin: r.purchaseEntry
          ? {
              id: r.purchaseEntry.id,
              date: r.purchaseEntry.date.toISOString(),
            }
          : null,
        warehouse: r.warehouse
          ? { id: r.warehouse.id, name: r.warehouse.name }
          : { id: r.warehouseId, name: '(bodega eliminada)' },
        date: r.date.toISOString(),
        reason: r.reason,
        notes: r.notes,
        refundAmount: r.refundAmount,
        paymentMethod: r.paymentMethod,
        refundMode: r.refundMode,
        exchangeDifference: r.exchangeDifference,
        status: r.status,
        cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
        cancelReason: r.cancelReason,
        items: (r.items ?? []).map((it) => ({
          product: it.product
            ? { id: it.product.id, sku: it.product.sku, name: it.product.name }
            : { id: it.productId, sku: null, name: '(producto eliminado)' },
          qty: it.qty,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
          itemCondition: it.itemCondition,
        })),
      },
    };
  }

  private buildOrphanCard(
    base: CardBaseShape,
    first: InventoryMovement,
  ): MovementCardDto {
    return {
      ...base,
      kind: 'ORPHAN',
      rawType: first.type,
      reference: first.reference,
      refId: first.refId,
    };
  }

  async listMovements(query: ListMovementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? MOVEMENTS_PAGE_SIZE;
    const where: Record<string, unknown> = {};
    if (query.productId) where.productId = query.productId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.type) where.type = query.type;
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      where.createdAt = Between(from, to);
    }

    const [items, total] = await this.movements.findAndCount({
      where,
      relations: { product: true, warehouse: true, user: true },
      order: { createdAt: 'DESC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });

    return {
      items: items.map((m) => ({
        id: m.id,
        type: m.type,
        qty: m.qty,
        unitCost: m.unitCost,
        reference: m.reference,
        refId: m.refId,
        createdAt: m.createdAt,
        product: m.product
          ? { id: m.product.id, sku: m.product.sku, name: m.product.name }
          : null,
        warehouse: m.warehouse ? { id: m.warehouse.id, name: m.warehouse.name } : null,
        user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email } : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Listado de stock por producto activo. Si un producto nunca tuvo movimientos,
   * aparece con quantity=0 y status='out' (en lugar de no aparecer).
   *
   * El filtro `status` se aplica en memoria (depende de `qty` calculada al
   * vuelo). La paginación se aplica DESPUÉS de filtrar por estado, así el total
   * informado coincide con los items efectivamente devueltos.
   */
  async listStock(query: ListStockQueryDto) {
    const warehouseId = query.warehouseId ?? (await this.defaultWarehouseId());

    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.brand', 'brand')
      .leftJoin('stocks', 's', 's.productId = p.id AND s.warehouseId = :wid', {
        wid: warehouseId,
      })
      .addSelect('COALESCE(s.quantity, 0)', 'qty')
      .addSelect('s.id', 'stockId')
      .addSelect('s.locationCode', 'locationCode')
      .where('p.isActive = TRUE');

    if (query.q) {
      qb.andWhere(
        '(p.sku LIKE :q OR p.partNumber LIKE :q OR p.barcode LIKE :q OR p.name LIKE :q OR s.locationCode LIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    qb.orderBy('p.name', 'ASC');

    const raw = await qb.getRawAndEntities();
    const all = raw.entities.map((p, idx) => {
      const qty = Number(raw.raw[idx]?.qty ?? 0);
      const status: 'ok' | 'low' | 'out' =
        qty <= 0 ? 'out' : qty <= p.minStock ? 'low' : 'ok';
      return {
        product: {
          id: p.id,
          sku: p.sku,
          name: p.name,
          partNumber: p.partNumber,
          barcode: p.barcode,
          minStock: p.minStock,
          maxStock: p.maxStock,
          // `Product.location` queda deprecated desde Fase 7.5 — la fuente
          // de verdad ahora es `Stock.locationCode` per bodega.
          location: p.location,
          cost: p.cost,
          price: p.price,
          category: p.category ? { id: p.category.id, name: p.category.name } : null,
          brand: p.brand ? { id: p.brand.id, name: p.brand.name } : null,
        },
        warehouseId,
        quantity: qty,
        status,
        locationCode: (raw.raw[idx]?.locationCode as string | null) ?? null,
        stockId: (raw.raw[idx]?.stockId as string | null) ?? null,
      };
    });

    const filtered = query.status ? all.filter((i) => i.status === query.status) : all;

    const paginated = query.page !== undefined || query.pageSize !== undefined;
    if (!paginated) return filtered;

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  /**
   * Setea el `locationCode` de un producto en una bodega específica. Si la
   * fila de Stock no existe todavía (caso: producto nunca tuvo movimiento
   * en esa bodega), se crea con qty=0 y el code seteado.
   *
   * Esto soporta la edición inline de "Ubicación" en `/inventario` desde
   * Fase 7.5. Acepta `null` o string vacío para limpiar la ubicación.
   */
  async setLocationCode(
    productId: string,
    warehouseId: string,
    locationCode: string | null,
  ): Promise<{ stockId: string; locationCode: string | null }> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const warehouse = await this.warehouses.findOne({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Bodega no encontrada');

    const value = locationCode && locationCode.trim() !== '' ? locationCode.trim() : null;
    if (value && value.length > 30) {
      throw new BadRequestException(
        'El código de ubicación no puede tener más de 30 caracteres',
      );
    }

    let row = await this.stocks.findOne({
      where: { productId, warehouseId },
    });
    if (!row) {
      row = this.stocks.create({
        productId,
        warehouseId,
        quantity: 0,
        locationCode: value,
      });
    } else {
      row.locationCode = value;
    }
    const saved = await this.stocks.save(row);
    return { stockId: saved.id, locationCode: saved.locationCode };
  }

  /**
   * Bodega activa por defecto. Filtramos activas y preferimos "Principal"
   * explícitamente — antes el orden alfabético hacía que "Mercado Libre Full"
   * ganara y los ajustes terminaban en la bodega equivocada (bug Ronda 5/7).
   * El frontend siempre debería pasar warehouseId explícito; este fallback
   * es defensa en profundidad.
   */
  private async defaultWarehouseId(): Promise<string> {
    const rows = await this.warehouses
      .createQueryBuilder('w')
      .where('w.isActive = TRUE')
      .orderBy(`(w.name = 'Principal')`, 'DESC')
      .addOrderBy('w.name', 'ASC')
      .limit(1)
      .getMany();
    const w = rows[0];
    if (!w) throw new NotFoundException('No hay ningún almacén activo configurado.');
    return w.id;
  }
}
