import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Not, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { normalizePhone } from '../common/validators/phone';
import { normalizeRut } from '../common/validators/rut';
import { PurchaseEntry, Supplier } from '../database/entities';
import {
  CreateSupplierDto,
  ListSupplierPurchasesQueryDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
    @InjectRepository(PurchaseEntry)
    private readonly purchases: Repository<PurchaseEntry>,
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
    const taxId = dto.taxId ? normalizeRut(dto.taxId) : null;
    if (taxId) {
      const dup = await this.repo.findOne({ where: { taxId } });
      if (dup) {
        throw new ConflictException(
          `Ya existe un proveedor con NIT/RUC "${taxId}" (${dup.name}).`,
        );
      }
    }
    return this.repo.save(
      this.repo.create({
        ...dto,
        taxId,
        phone: dto.phone ? normalizePhone(dto.phone) : null,
      }),
    );
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const entity = await this.getOne(id);
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup) throw new ConflictException(`Ya existe un proveedor con nombre "${dto.name}"`);
    }
    if (dto.taxId !== undefined) {
      const newTaxId = dto.taxId ? normalizeRut(dto.taxId) : null;
      if (newTaxId !== entity.taxId) {
        if (newTaxId) {
          const dup = await this.repo.findOne({
            where: { taxId: newTaxId, id: Not(id) },
          });
          if (dup) {
            throw new ConflictException(
              `Ya existe un proveedor con NIT/RUC "${newTaxId}" (${dup.name}).`,
            );
          }
        }
        entity.taxId = newTaxId;
      }
    }
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.email !== undefined) entity.email = dto.email ?? null;
    if (dto.phone !== undefined) {
      entity.phone = dto.phone ? normalizePhone(dto.phone) : null;
    }
    if (dto.address !== undefined) entity.address = dto.address ?? null;
    if (dto.notes !== undefined) entity.notes = dto.notes ?? null;
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

  /**
   * Historial paginado de compras de un proveedor. Lo usa la pestaña
   * "Compras" del detalle del proveedor.
   */
  async listPurchases(supplierId: string, query: ListSupplierPurchasesQueryDto = {}) {
    await this.getOne(supplierId); // 404 si no existe
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { supplierId };
    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : new Date('1900-01-01');
      const to = query.dateTo ? new Date(query.dateTo) : new Date('2999-12-31');
      where.date = Between(from, to);
    }
    const [items, total] = await this.purchases.findAndCount({
      where,
      order: { date: 'DESC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  }
}
