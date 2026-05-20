import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Like, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { Category } from '../database/entities';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
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
      return this.attachParentNames(items);
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { name: 'ASC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return {
      items: await this.attachParentNames(items),
      total,
      page,
      pageSize,
    };
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
