import { ProductCodeKind, ProductKind } from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import {
  Product,
  ProductCode,
  ProductImage,
  VehicleFitment,
  VehicleModel,
} from '../database/entities';
import { UPLOADS_ROOT } from '../uploads/upload-config';
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
    @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
    @InjectRepository(ProductCode) private readonly codes: Repository<ProductCode>,
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
      // Búsqueda extendida (Fase 4B): además de los campos directos del
      // producto, busca dentro de `product_codes.code`. Subquery EXISTS para
      // no traer duplicados ni romper la paginación.
      qb.andWhere(
        `(
          p.sku LIKE :q
          OR p.partNumber LIKE :q
          OR p.barcode LIKE :q
          OR p.name LIKE :q
          OR p.universalCode LIKE :q
          OR EXISTS (
            SELECT 1 FROM product_codes pc
            WHERE pc.productId = p.id AND pc.code LIKE :q
          )
        )`,
        { q: `%${query.q}%` },
      );
    }
    if (query.categoryId)
      qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.brandId) qb.andWhere('p.brandId = :brandId', { brandId: query.brandId });
    if (query.productKind)
      qb.andWhere('p.productKind = :productKind', { productKind: query.productKind });

    const [items, total] = await qb.getManyAndCount();
    const itemsWithCover = await this.attachCoverImages(items);
    return { items: itemsWithCover, total, page, pageSize };
  }

  async getOne(id: string) {
    const product = await this.products.findOne({
      where: { id },
      relations: { category: true, brand: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const [fitments, images, codes] = await Promise.all([
      this.fitments.find({
        where: { productId: id },
        relations: { model: { make: true } },
      }),
      this.images.find({
        where: { productId: id },
        order: { isCover: 'DESC', position: 'ASC', createdAt: 'ASC' },
      }),
      this.codes.find({ where: { productId: id }, order: { code: 'ASC' } }),
    ]);
    const coverUrl = images.find((i) => i.isCover)?.url ?? images[0]?.url ?? null;
    return {
      ...product,
      fitments,
      images,
      compatibleCodes: codes.filter((c) => c.kind === ProductCodeKind.COMPATIBLE).map((c) => c.code),
      coverUrl,
    };
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
      if (dto.compatibleCodes !== undefined) {
        await this.replaceCompatibleCodes(manager, saved.id, dto.compatibleCodes);
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
      if (dto.compatibleCodes !== undefined) {
        await this.replaceCompatibleCodes(manager, id, dto.compatibleCodes);
      }
    });
    return this.getOne(id);
  }

  async remove(id: string) {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    // Capturamos las imágenes ANTES de borrar — se eliminan los archivos físicos
    // después del commit (CASCADE borra los registros en product_images).
    const productImages = await this.images.find({ where: { productId: id } });

    try {
      await this.products.remove(product);
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar: el producto tiene movimientos de inventario o ítems asociados. Desactívalo en su lugar.',
      );
    }

    // Limpieza de archivos físicos. No falla la operación si alguno no existe.
    await Promise.all(
      productImages.map((img) => this.unlinkUploadedFile(img.url)),
    );
    return { ok: true };
  }

  // -------- imágenes (Fase 4B) --------
  /**
   * Registra una imagen recién subida vía multer. La primera imagen de un
   * producto se marca automáticamente como cover.
   */
  async addImage(productId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió archivo');
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) {
      // Si el producto no existe, el archivo ya está en disco — limpio.
      await this.unlinkUploadedFile(`/uploads/products/${file.filename}`);
      throw new NotFoundException('Producto no encontrado');
    }

    const existing = await this.images.find({ where: { productId } });
    const isFirst = existing.length === 0;
    const maxPosition = existing.reduce((acc, i) => Math.max(acc, i.position), -1);

    const image = this.images.create({
      productId,
      url: `/uploads/products/${file.filename}`,
      isCover: isFirst,
      position: maxPosition + 1,
    });
    return this.images.save(image);
  }

  async listImages(productId: string) {
    return this.images.find({
      where: { productId },
      order: { isCover: 'DESC', position: 'ASC', createdAt: 'ASC' },
    });
  }

  async setCover(productId: string, imageId: string) {
    const image = await this.images.findOne({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');
    await this.dataSource.transaction(async (manager) => {
      await manager.update(ProductImage, { productId }, { isCover: false });
      await manager.update(ProductImage, { id: imageId }, { isCover: true });
    });
    return this.images.findOneOrFail({ where: { id: imageId } });
  }

  async removeImage(productId: string, imageId: string) {
    const image = await this.images.findOne({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');
    const wasCover = image.isCover;
    await this.images.remove(image);
    await this.unlinkUploadedFile(image.url);

    // Si la imagen borrada era cover y quedan otras, promover la primera.
    if (wasCover) {
      const next = await this.images.findOne({
        where: { productId },
        order: { position: 'ASC', createdAt: 'ASC' },
      });
      if (next) await this.images.update({ id: next.id }, { isCover: true });
    }
    return { ok: true };
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

    const items = await this.products.find({
      where: { id: In(productIds) },
      relations: { category: true, brand: true },
      order: { name: 'ASC' },
    });
    return this.attachCoverImages(items);
  }

  async quickSearch(query: QuickSearchQueryDto) {
    const limit = query.limit ?? 10;
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.brand', 'brand')
      .where(
        `(
          p.sku LIKE :q
          OR p.partNumber LIKE :q
          OR p.barcode LIKE :q
          OR p.name LIKE :q
          OR p.universalCode LIKE :q
          OR EXISTS (
            SELECT 1 FROM product_codes pc
            WHERE pc.productId = p.id AND pc.code LIKE :q
          )
        )`,
        { q: `%${query.q}%` },
      )
      .orderBy('p.isActive', 'DESC') // activos primero
      .addOrderBy('p.name', 'ASC')
      .take(limit);
    // El default (sin filtro) sirve a la barra global de navegación. Los
    // selectores de cotización/venta deben pedir explícitamente `activeOnly=true`.
    if (query.activeOnly) qb.andWhere('p.isActive = TRUE');
    const items = await qb.getMany();
    return this.attachCoverImages(items);
  }

  /**
   * Ronda 7 — actualización masiva del `categoryId` de productos. Usado por
   * el detalle de categoría (`/categorias/[id]`) para:
   *
   *  - `categoryId = <uuid>` → mover N productos a otra categoría.
   *  - `categoryId = null` → desvincular N productos de su categoría actual.
   *
   * Devuelve cuántos productos se actualizaron.
   */
  async bulkUpdateCategory(
    productIds: string[],
    categoryId: string | null,
  ): Promise<{ updated: number }> {
    if (productIds.length === 0) return { updated: 0 };
    const result = await this.products
      .createQueryBuilder()
      .update(Product)
      .set({ categoryId })
      .whereInIds(productIds)
      .execute();
    return { updated: result.affected ?? 0 };
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
    if (dto.universalCode !== undefined) fields.universalCode = dto.universalCode ?? null;
    if (dto.productKind !== undefined) fields.productKind = dto.productKind;
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

  // Estrategia replace para códigos compatibles. Recibe lista plana de strings.
  private async replaceCompatibleCodes(
    manager: EntityManager,
    productId: string,
    codes: string[],
  ) {
    await manager.delete(ProductCode, { productId, kind: ProductCodeKind.COMPATIBLE });
    const cleaned = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    if (cleaned.length === 0) return;

    const entities = cleaned.map((code) =>
      manager.create(ProductCode, {
        productId,
        code,
        kind: ProductCodeKind.COMPATIBLE,
      }),
    );
    await manager.save(entities);
  }

  /**
   * Anota un campo `coverUrl` (string | null) a cada producto del listado en
   * memoria, evitando un N+1: una sola query trae todas las cover en batch.
   */
  private async attachCoverImages<T extends { id: string }>(
    items: T[],
  ): Promise<Array<T & { coverUrl: string | null }>> {
    if (items.length === 0) return [];
    const ids = items.map((i) => i.id);
    const covers = await this.images
      .createQueryBuilder('img')
      .where('img.productId IN (:...ids)', { ids })
      .andWhere('img.isCover = TRUE')
      .getMany();
    const map = new Map(covers.map((c) => [c.productId, c.url]));
    return items.map((i) => ({ ...i, coverUrl: map.get(i.id) ?? null }));
  }

  private async unlinkUploadedFile(publicUrl: string | null | undefined) {
    if (!publicUrl) return;
    // publicUrl viene como `/uploads/products/<file>`. Mapeo a path físico.
    const prefix = '/uploads/';
    if (!publicUrl.startsWith(prefix)) return;
    const relative = publicUrl.slice(prefix.length);
    const fullPath = join(UPLOADS_ROOT, relative);
    try {
      await unlink(fullPath);
    } catch {
      // El archivo puede no existir (caso típico: ya borrado, o env distinto).
      // No queremos romper el delete del registro por eso.
    }
  }

  // Reemplaza la lista completa de códigos compatibles del producto vía endpoint
  // dedicado, fuera del ciclo de update normal.
  async replaceCompatibleCodesPublic(productId: string, codes: string[]) {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    await this.dataSource.transaction(async (manager) => {
      await this.replaceCompatibleCodes(manager, productId, codes);
    });
    return this.getOne(productId);
  }
}
