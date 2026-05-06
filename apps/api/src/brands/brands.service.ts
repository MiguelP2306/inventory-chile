import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../database/entities';
import { CreateBrandDto, UpdateBrandDto } from './dto';

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand)
    private readonly repo: Repository<Brand>,
  ) {}

  list() {
    return this.repo.find({ order: { name: 'ASC' } });
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
    await this.repo.remove(entity);
    return { ok: true };
  }
}
