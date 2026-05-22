import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SaleStatus } from '@inventory/shared';
import { In, IsNull, Like, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import {
  Category,
  Product,
  ProductImage,
  Sale,
  SaleItem,
  Stock,
} from '../database/entities';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto';

/**
 * Forma plana de los stats lightweight calculados con una sola query
 * agregada. `productCount` puede o no incluir hijas según el caller.
 */
type CategoryStats = {
  productCount: number;
  inventoryValue: number;
  outOfStockCount: number;
  lowStockCount: number;
  avgMarginPct: number;
};

type CategoryTopProduct = {
  id: string;
  sku: string | null;
  name: string;
  units: number;
  amount: number;
  coverUrl: string | null;
};

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly productImages: Repository<ProductImage>,
    @InjectRepository(SaleItem)
    private readonly saleItems: Repository<SaleItem>,
  ) {}

  /**
   * Si vienen `page` o `pageSize` se devuelve `PaginatedResult`; si no, se
   * devuelve un array completo (selectores).
   *
   * Ronda 10 — filtro `parentId`:
   *  - sin valor → todas las categorías (planas).
   *  - `parentId=null` (literal) → solo raíces.
   *  - `parentId=<uuid>` → solo hijas de ese padre.
   *
   * Cada item incluye `parentName` resuelto en memoria (1 sola query
   * extra para los padres únicos).
   *
   * Ronda 11 — `withStats=true` adjunta los 5 stats lightweight
   * (productCount/inventoryValue/outOfStock/lowStock/avgMargin) con
   * alcance DIRECTO (sin rollup de hijas). El cálculo es 1 query agregada
   * sobre todos los IDs devueltos — no N+1.
   */
  async list(query: ListCategoriesQueryDto = {}) {
    const where: Record<string, unknown> = {};
    if (query.q) where.name = Like(`%${query.q}%`);
    if (query.parentId !== undefined) {
      where.parentId =
        query.parentId === 'null' || query.parentId === ''
          ? IsNull()
          : query.parentId;
    }

    const paginated = query.page !== undefined || query.pageSize !== undefined;
    if (!paginated) {
      const items = await this.repo.find({ where, order: { name: 'ASC' } });
      const withParents = await this.attachParentNames(items);
      if (!query.withStats) return withParents;
      return this.attachDirectStats(withParents);
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { name: 'ASC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    const withParents = await this.attachParentNames(items);
    const finalItems = query.withStats
      ? await this.attachDirectStats(withParents)
      : withParents;
    return {
      items: finalItems,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Ronda 11 — detalle de una categoría. Si `withStats=true` adjunta:
   *   - stats rolled-up (categoría + sus subcategorías de 1 nivel).
   *   - topProducts del mes en curso (top 3 por monto facturado).
   *
   * Si la categoría no existe, lanza 404.
   */
  async getOne(id: string, withStats = false) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Categoría no encontrada');

    const [withParent] = await this.attachParentNames([entity]);
    if (!withStats) return withParent;

    const ids = await this.descendantIds(id);
    const [stats, topProducts] = await Promise.all([
      this.computeStats(ids),
      this.computeTopProducts(ids, 3),
    ]);
    return { ...withParent, ...stats, topProducts };
  }

  /**
   * Ronda 10 — IDs de la categoría y todas sus descendientes (1 nivel
   * por ahora — soportamos sólo Categoría › Subcategoría). Lo usa
   * ProductsService.list para que filtrar por una categoría padre
   * incluya productos de cualquiera de sus subcategorías.
   */
  async descendantIds(categoryId: string): Promise<string[]> {
    const children = await this.repo.find({
      where: { parentId: categoryId },
      select: ['id'],
    });
    return [categoryId, ...children.map((c) => c.id)];
  }

  private async attachParentNames(items: Category[]) {
    const parentIds = Array.from(
      new Set(items.map((c) => c.parentId).filter((p): p is string => !!p)),
    );
    if (parentIds.length === 0) {
      return items.map((c) => ({ ...c, parentName: null }));
    }
    const parents = await this.repo.find({
      where: { id: In(parentIds) },
    });
    const byId = new Map(parents.map((p) => [p.id, p.name]));
    return items.map((c) => ({
      ...c,
      parentName: c.parentId ? (byId.get(c.parentId) ?? null) : null,
    }));
  }

  /**
   * Adjunta los 5 stats DIRECTOS a cada categoría en `items`. Una sola
   * query agregada agrupada por `categoryId` (sin descender por hijas).
   * Las categorías sin productos quedan con todos los campos en 0.
   */
  private async attachDirectStats<T extends { id: string }>(
    items: T[],
  ): Promise<Array<T & CategoryStats>> {
    if (items.length === 0) return [];
    const ids = items.map((i) => i.id);

    // Subquery: stock total por producto sumando todas las bodegas.
    // LEFT JOIN para que productos sin row en stocks cuenten como 0
    // (consistente con stockStatusCounts del dashboard).
    const rows = await this.products
      .createQueryBuilder('p')
      .leftJoin(
        (sq) =>
          sq
            .from(Stock, 'st')
            .select('st.productId', 'productId')
            .addSelect('SUM(st.quantity)', 'qty')
            .groupBy('st.productId'),
        'sa',
        'sa.productId = p.id',
      )
      .select('p.categoryId', 'categoryId')
      .addSelect('COUNT(p.id)', 'productCount')
      .addSelect('COALESCE(SUM(COALESCE(sa.qty, 0) * p.cost), 0)', 'inventoryValue')
      .addSelect(
        "SUM(CASE WHEN COALESCE(sa.qty, 0) <= 0 THEN 1 ELSE 0 END)",
        'outOfStockCount',
      )
      .addSelect(
        "SUM(CASE WHEN COALESCE(sa.qty, 0) > 0 AND COALESCE(sa.qty, 0) < p.minStock THEN 1 ELSE 0 END)",
        'lowStockCount',
      )
      .addSelect(
        'AVG(CASE WHEN p.price > 0 THEN ((p.price - p.cost) / p.price) * 100 ELSE NULL END)',
        'avgMarginPct',
      )
      .where('p.categoryId IN (:...ids)', { ids })
      .andWhere('p.isActive = TRUE')
      .groupBy('p.categoryId')
      .getRawMany<{
        categoryId: string;
        productCount: string;
        inventoryValue: string;
        outOfStockCount: string;
        lowStockCount: string;
        avgMarginPct: string | null;
      }>();

    const statsByCategoryId = new Map<string, CategoryStats>(
      rows.map((r) => [
        r.categoryId,
        {
          productCount: Number(r.productCount ?? 0),
          inventoryValue: Math.round(Number(r.inventoryValue ?? 0)),
          outOfStockCount: Number(r.outOfStockCount ?? 0),
          lowStockCount: Number(r.lowStockCount ?? 0),
          avgMarginPct:
            r.avgMarginPct != null ? Math.round(Number(r.avgMarginPct)) : 0,
        },
      ]),
    );

    const zero: CategoryStats = {
      productCount: 0,
      inventoryValue: 0,
      outOfStockCount: 0,
      lowStockCount: 0,
      avgMarginPct: 0,
    };
    return items.map((it) => ({
      ...it,
      ...(statsByCategoryId.get(it.id) ?? zero),
    }));
  }

  /**
   * Cálculo de stats sobre un conjunto de categoryIds (típicamente
   * [self, ...children]). Es la misma query agregada que attachDirectStats
   * pero SIN GROUP BY — un único row agregado para todo el conjunto.
   */
  private async computeStats(categoryIds: string[]): Promise<CategoryStats> {
    if (categoryIds.length === 0) {
      return {
        productCount: 0,
        inventoryValue: 0,
        outOfStockCount: 0,
        lowStockCount: 0,
        avgMarginPct: 0,
      };
    }
    const row = await this.products
      .createQueryBuilder('p')
      .leftJoin(
        (sq) =>
          sq
            .from(Stock, 'st')
            .select('st.productId', 'productId')
            .addSelect('SUM(st.quantity)', 'qty')
            .groupBy('st.productId'),
        'sa',
        'sa.productId = p.id',
      )
      .select('COUNT(p.id)', 'productCount')
      .addSelect('COALESCE(SUM(COALESCE(sa.qty, 0) * p.cost), 0)', 'inventoryValue')
      .addSelect(
        "SUM(CASE WHEN COALESCE(sa.qty, 0) <= 0 THEN 1 ELSE 0 END)",
        'outOfStockCount',
      )
      .addSelect(
        "SUM(CASE WHEN COALESCE(sa.qty, 0) > 0 AND COALESCE(sa.qty, 0) < p.minStock THEN 1 ELSE 0 END)",
        'lowStockCount',
      )
      .addSelect(
        'AVG(CASE WHEN p.price > 0 THEN ((p.price - p.cost) / p.price) * 100 ELSE NULL END)',
        'avgMarginPct',
      )
      .where('p.categoryId IN (:...ids)', { ids: categoryIds })
      .andWhere('p.isActive = TRUE')
      .getRawOne<{
        productCount: string;
        inventoryValue: string;
        outOfStockCount: string;
        lowStockCount: string;
        avgMarginPct: string | null;
      }>();

    return {
      productCount: Number(row?.productCount ?? 0),
      inventoryValue: Math.round(Number(row?.inventoryValue ?? 0)),
      outOfStockCount: Number(row?.outOfStockCount ?? 0),
      lowStockCount: Number(row?.lowStockCount ?? 0),
      avgMarginPct:
        row?.avgMarginPct != null ? Math.round(Number(row.avgMarginPct)) : 0,
    };
  }

  /**
   * Top productos por monto facturado en el MES EN CURSO, sobre la
   * categoría + sus subcategorías. Mismas convenciones que el dashboard:
   *   - filtro temporal sobre `s.date` (no `createdAt`)
   *   - excluye ventas CANCELLED (PENDING + PAID cuentan)
   *   - monto = SUM(si.qty × si.unitPrice)
   *   - units = SUM(si.qty)
   * Devuelve top N ordenado por monto desc. coverUrl en batch sin N+1.
   */
  private async computeTopProducts(
    categoryIds: string[],
    limit: number,
  ): Promise<CategoryTopProduct[]> {
    if (categoryIds.length === 0) return [];

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const rows = await this.saleItems
      .createQueryBuilder('si')
      .innerJoin(Sale, 's', 's.id = si.saleId')
      .innerJoin(Product, 'p', 'p.id = si.productId')
      .select('p.id', 'id')
      .addSelect('p.sku', 'sku')
      .addSelect('p.name', 'name')
      .addSelect('SUM(si.qty)', 'units')
      .addSelect('SUM(si.qty * si.unitPrice)', 'amount')
      .where('p.categoryId IN (:...ids)', { ids: categoryIds })
      .andWhere('s.date BETWEEN :from AND :to', {
        from: monthStart,
        to: monthEnd,
      })
      .andWhere('s.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy('p.id, p.sku, p.name')
      .orderBy('amount', 'DESC')
      .limit(limit)
      .getRawMany<{
        id: string;
        sku: string | null;
        name: string;
        units: string;
        amount: string;
      }>();

    if (rows.length === 0) return [];

    // Covers en batch (mismo patrón que products.service / dashboard.service).
    const productIds = rows.map((r) => r.id);
    const covers = await this.productImages
      .createQueryBuilder('img')
      .where('img.productId IN (:...ids)', { ids: productIds })
      .andWhere('img.isCover = TRUE')
      .getMany();
    const coverByProduct = new Map(covers.map((c) => [c.productId, c.url]));

    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      units: Number(r.units),
      amount: Number(r.amount),
      coverUrl: coverByProduct.get(r.id) ?? null,
    }));
  }

  async create(dto: CreateCategoryDto) {
    if (await this.repo.findOne({ where: { name: dto.name } })) {
      throw new ConflictException(`Ya existe una categoría con nombre "${dto.name}"`);
    }
    if (dto.parentId) {
      // Ronda 10 — el padre debe existir y ser raíz (1 nivel de anidamiento).
      const parent = await this.repo.findOne({ where: { id: dto.parentId } });
      if (!parent) {
        throw new NotFoundException('Categoría padre no encontrada');
      }
      if (parent.parentId) {
        throw new ConflictException(
          'Solo soportamos 1 nivel de subcategorías. Elegí una categoría raíz como padre.',
        );
      }
    }
    const entity = this.repo.create({
      name: dto.name,
      parentId: dto.parentId ?? null,
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Categoría no encontrada');
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) throw new ConflictException(`Ya existe una categoría con nombre "${dto.name}"`);
      entity.name = dto.name;
    }
    if (dto.parentId !== undefined) {
      // Ronda 10 — guard contra ciclos. Soportamos sólo 1 nivel de
      // anidamiento (Categoría › Subcategoría): si querés ser hija, tu
      // padre tiene que ser raíz; y nunca podés ser hija de vos misma.
      if (dto.parentId) {
        if (dto.parentId === id) {
          throw new ConflictException(
            'Una categoría no puede ser hija de sí misma.',
          );
        }
        const newParent = await this.repo.findOne({
          where: { id: dto.parentId },
        });
        if (!newParent) {
          throw new NotFoundException('Categoría padre no encontrada');
        }
        if (newParent.parentId) {
          throw new ConflictException(
            'Solo soportamos 1 nivel de subcategorías. Elegí una categoría raíz como padre.',
          );
        }
        // Si esta categoría tiene hijas, no puede convertirse en hija
        // (sería un 2do nivel).
        const hasChildren = await this.repo.findOne({
          where: { parentId: id },
        });
        if (hasChildren) {
          throw new ConflictException(
            'Esta categoría ya tiene subcategorías. Reasignalas o eliminalas antes de moverla.',
          );
        }
      }
      entity.parentId = dto.parentId;
    }
    return this.repo.save(entity);
  }

  async remove(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Categoría no encontrada');
    try {
      await this.repo.remove(entity);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar la categoría: hay productos asociados. Reasigná los productos o desactívalos primero.',
      );
    }
  }
}

// Tipos exportados para uso interno (tests) — los stats individuales no
// se expusieron al cliente fuera de attach* / getOne.
export type { CategoryStats, CategoryTopProduct };
