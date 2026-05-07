import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { Supplier } from '../database/entities';
import {
  CreateSupplierDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
  ) {}

  async list(query: ListSuppliersQueryDto = {}) {
    const qb = this.repo.createQueryBuilder('s').orderBy('s.name', 'ASC');
    if (query.q) {
      qb.andWhere(
        '(s.name LIKE :q OR s.taxId LIKE :q OR s.email LIKE :q OR s.phone LIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    const paginated = query.page !== undefined || query.pageSize !== undefined;
    if (!paginated) return qb.getMany();

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    qb.take(pageSize).skip((page - 1) * pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
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
    if (dto.taxId) {
      const dup = await this.repo.findOne({ where: { taxId: dto.taxId } });
      if (dup) {
        throw new ConflictException(
          `Ya existe un proveedor con NIT/RUC "${dto.taxId}" (${dup.name}).`,
        );
      }
    }
    return this.repo.save(this.repo.create({ ...dto }));
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const entity = await this.getOne(id);
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) throw new ConflictException(`Ya existe un proveedor con nombre "${dto.name}"`);
    }
    if (dto.taxId && dto.taxId !== entity.taxId) {
      const dup = await this.repo.findOne({
        where: { taxId: dto.taxId, id: Not(id) },
      });
      if (dup) {
        throw new ConflictException(
          `Ya existe un proveedor con NIT/RUC "${dto.taxId}" (${dup.name}).`,
        );
      }
    }
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string) {
    const entity = await this.getOne(id);
    try {
      await this.repo.remove(entity);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar: el proveedor tiene compras o productos asociados.',
      );
    }
  }
}
