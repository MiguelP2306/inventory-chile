import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from '../database/entities';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
  ) {}

  list(q?: string) {
    const qb = this.repo.createQueryBuilder('s').orderBy('s.name', 'ASC');
    if (q) qb.andWhere('s.name LIKE :q', { q: `%${q}%` });
    return qb.getMany();
  }

  async getOne(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Proveedor no encontrado');
    return entity;
  }

  async create(dto: CreateSupplierDto) {
    if (await this.repo.findOne({ where: { name: dto.name } })) {
      throw new ConflictException(`Ya existe un proveedor con nombre "${dto.name}"`);
    }
    return this.repo.save(this.repo.create({ ...dto }));
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const entity = await this.getOne(id);
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) throw new ConflictException(`Ya existe un proveedor con nombre "${dto.name}"`);
    }
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string) {
    const entity = await this.getOne(id);
    try {
      await this.repo.remove(entity);
      return { ok: true };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(
          'No se puede eliminar: el proveedor tiene compras o productos asociados.',
        );
      }
      throw err;
    }
  }
}
