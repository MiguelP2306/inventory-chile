import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../database/entities';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  async list() {
    return this.repo.find({ order: { name: 'ASC' } });
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
    await this.repo.remove(entity);
    return { ok: true };
  }
}
