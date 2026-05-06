import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  Product,
  VehicleFitment,
  VehicleModel,
} from '../database/entities';
import {
  ByVehicleQueryDto,
  CreateProductDto,
  FitmentInputDto,
  ListProductsQueryDto,
  QuickSearchQueryDto,
  UpdateProductDto,
} from './dto';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(VehicleFitment) private readonly fitments: Repository<VehicleFitment>,
    @InjectRepository(VehicleModel) private readonly models: Repository<VehicleModel>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.brand', 'brand')
      .orderBy('p.name', 'ASC')
      .take(pageSize)
      .skip((page - 1) * pageSize);

    if (query.q) {
      qb.andWhere(
        '(p.sku LIKE :q OR p.partNumber LIKE :q OR p.barcode LIKE :q OR p.name LIKE :q)',
        { q: `%${query.q}%` },
      );
    }
    if (query.categoryId) qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.brandId) qb.andWhere('p.brandId = :brandId', { brandId: query.brandId });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async getOne(id: string) {
    const product = await this.products.findOne({
      where: { id },
      relations: { category: true, brand: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const fitments = await this.fitments.find({
      where: { productId: id },
      relations: { model: { make: true } },
    });
    return { ...product, fitments };
  }

  async create(dto: CreateProductDto) {
    if (await this.products.findOne({ where: { sku: dto.sku } })) {
      throw new ConflictException(`Ya existe un producto con SKU "${dto.sku}"`);
    }
    const id = await this.dataSource.transaction(async (manager) => {
      const product = manager.create(Product, this.toEntityFields(dto));
      const saved = await manager.save(product);
      if (dto.fitments?.length) {
        await this.replaceFitments(manager, saved.id, dto.fitments);
      }
      return saved.id;
    });
    return this.getOne(id);
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.products.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Producto no encontrado');

    if (dto.sku && dto.sku !== existing.sku) {
      const dup = await this.products.findOne({ where: { sku: dto.sku } });
      if (dup) throw new ConflictException(`Ya existe un producto con SKU "${dto.sku}"`);
    }

    await this.dataSource.transaction(async (manager) => {
      Object.assign(existing, this.toEntityFields(dto));
      await manager.save(existing);
      if (dto.fitments !== undefined) {
        await this.replaceFitments(manager, id, dto.fitments);
      }
    });
    return this.getOne(id);
  }

  async remove(id: string) {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    // VehicleFitment tiene CASCADE, los borra solos.
    // Stock e InventoryMovement tienen RESTRICT — si hay registros, MySQL falla.
    try {
      await this.products.remove(product);
      return { ok: true };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(
          'No se puede eliminar: el producto tiene movimientos de inventario o ítems asociados. Desactívalo en su lugar.',
        );
      }
      throw err;
    }
  }

  // -------- búsquedas --------
  async byVehicle(query: ByVehicleQueryDto) {
    const fitmentQb = this.fitments
      .createQueryBuilder('f')
      .select('f.productId', 'productId')
      .innerJoin('f.model', 'm');

    if (query.modelId) fitmentQb.andWhere('m.id = :modelId', { modelId: query.modelId });
    if (query.makeId) fitmentQb.andWhere('m.makeId = :makeId', { makeId: query.makeId });
    if (query.year !== undefined) {
      fitmentQb.andWhere('(f.yearFrom IS NULL OR f.yearFrom <= :year)', { year: query.year });
      fitmentQb.andWhere('(f.yearTo IS NULL OR f.yearTo >= :year)', { year: query.year });
    }

    const productIds = (await fitmentQb.getRawMany<{ productId: string }>()).map(
      (r) => r.productId,
    );
    if (productIds.length === 0) return [];

    return this.products.find({
      where: { id: In(productIds) },
      relations: { category: true, brand: true },
      order: { name: 'ASC' },
    });
  }

  async quickSearch(query: QuickSearchQueryDto) {
    const limit = query.limit ?? 10;
    return this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.brand', 'brand')
      .where(
        '(p.sku LIKE :q OR p.partNumber LIKE :q OR p.barcode LIKE :q OR p.name LIKE :q)',
        { q: `%${query.q}%` },
      )
      .andWhere('p.isActive = TRUE')
      .orderBy('p.name', 'ASC')
      .take(limit)
      .getMany();
  }

  // -------- helpers --------
  private toEntityFields(dto: CreateProductDto | UpdateProductDto): Partial<Product> {
    const fields: Partial<Product> = {};
    if (dto.sku !== undefined) fields.sku = dto.sku;
    if (dto.partNumber !== undefined) fields.partNumber = dto.partNumber ?? null;
    if (dto.barcode !== undefined) fields.barcode = dto.barcode ?? null;
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.description !== undefined) fields.description = dto.description ?? null;
    if (dto.categoryId !== undefined) fields.categoryId = dto.categoryId ?? null;
    if (dto.brandId !== undefined) fields.brandId = dto.brandId ?? null;
    if (dto.supplierId !== undefined) fields.supplierId = dto.supplierId ?? null;
    if (dto.cost !== undefined) fields.cost = dto.cost;
    if (dto.price !== undefined) fields.price = dto.price;
    if (dto.minStock !== undefined) fields.minStock = dto.minStock;
    if (dto.maxStock !== undefined) fields.maxStock = dto.maxStock ?? null;
    if (dto.location !== undefined) fields.location = dto.location ?? null;
    if (dto.isActive !== undefined) fields.isActive = dto.isActive;
    return fields;
  }

  // Estrategia replace: borra todos los fitments del producto y los reinserta.
  // Es predecible y simple; los fitments son pocos por producto.
  private async replaceFitments(
    manager: EntityManager,
    productId: string,
    fitments: FitmentInputDto[],
  ) {
    await manager.delete(VehicleFitment, { productId });
    if (fitments.length === 0) return;

    const modelIds = [...new Set(fitments.map((f) => f.modelId))];
    const validModels = await manager.find(VehicleModel, { where: { id: In(modelIds) } });
    if (validModels.length !== modelIds.length) {
      throw new NotFoundException('Algún modelo de vehículo no existe');
    }

    const entities = fitments.map((f) =>
      manager.create(VehicleFitment, {
        productId,
        modelId: f.modelId,
        yearFrom: f.yearFrom ?? null,
        yearTo: f.yearTo ?? null,
      }),
    );
    await manager.save(entities);
  }
}
