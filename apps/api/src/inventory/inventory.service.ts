import { InventoryMovementType } from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, Repository } from 'typeorm';
import {
  InventoryMovement,
  Product,
  Stock,
  Warehouse,
} from '../database/entities';
import {
  AdjustStockDto,
  ListMovementsQueryDto,
  ListStockQueryDto,
} from './dto';

const MOVEMENTS_PAGE_SIZE = 50;

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

  async listMovements(query: ListMovementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? MOVEMENTS_PAGE_SIZE;
    const where: Record<string, unknown> = {};
    if (query.productId) where.productId = query.productId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.type) where.type = query.type;
    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : new Date('1900-01-01');
      const to = query.dateTo ? new Date(query.dateTo) : new Date('2999-12-31');
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
      .where('p.isActive = TRUE');

    if (query.q) {
      qb.andWhere(
        '(p.sku LIKE :q OR p.partNumber LIKE :q OR p.barcode LIKE :q OR p.name LIKE :q)',
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
          location: p.location,
          cost: p.cost,
          price: p.price,
          category: p.category ? { id: p.category.id, name: p.category.name } : null,
          brand: p.brand ? { id: p.brand.id, name: p.brand.name } : null,
        },
        warehouseId,
        quantity: qty,
        status,
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

  private async defaultWarehouseId(): Promise<string> {
    const w = await this.warehouses.findOne({ where: {}, order: { name: 'ASC' } });
    if (!w) throw new NotFoundException('No hay ningún almacén configurado.');
    return w.id;
  }
}
