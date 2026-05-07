import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { Brand } from '../database/entities';
import { CreateBrandDto, ListBrandsQueryDto, UpdateBrandDto } from './dto';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly repo: Repository<Brand>,
  ) {}

  async list(query: ListBrandsQueryDto = {}) {
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

  async create(dto: CreateBrandDto) {
    if (await this.repo.findOne({ where: { name: dto.name } })) {
      throw new ConflictException(`Ya existe una marca con nombre "${dto.name}"`);
    }
    return this.repo.save(this.repo.create({ name: dto.name }));
  }

  async update(id: string, dto: UpdateBrandDto) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Marca no encontrada');
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) throw new ConflictException(`Ya existe una marca con nombre "${dto.name}"`);
      entity.name = dto.name;
    }
    return this.repo.save(entity);
  }

  async remove(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Marca no encontrada');
    try {
      await this.repo.remove(entity);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar la marca: hay productos asociados. Reasigná los productos o desactívalos primero.',
      );
    }
  }
}
