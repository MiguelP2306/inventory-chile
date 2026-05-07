import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
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
   * Si vienen `page` o `pageSize` se devuelve `PaginatedResult` para los listados
   * con paginación; si no, se devuelve un array completo (selectores, dropdowns).
   */
  async list(query: ListCategoriesQueryDto = {}) {
    const where = query.q ? { name: Like(`%${query.q}%`) } : {};
    const paginated = query.page !== undefined || query.pageSize !== undefined;
    if (!paginated) {
      return this.repo.find({ where, order: { name: 'ASC' } });
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { name: 'ASC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  }

  async create(dto: CreateCategoryDto) {
    if (await this.repo.findOne({ where: { name: dto.name } })) {
      throw new ConflictException(`Ya existe una categoría con nombre "${dto.name}"`);
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
    if (dto.parentId !== undefined) entity.parentId = dto.parentId;
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
