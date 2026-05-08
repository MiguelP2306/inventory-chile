import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { ExpenseCategory } from '../database/entities';
import {
  CreateExpenseCategoryDto,
  ListExpenseCategoriesQueryDto,
  UpdateExpenseCategoryDto,
} from './dto';

// Categorías "de sistema": no pueden eliminarse ni renombrarse desde la UI.
// La lógica automática las referencia por nombre.
export const SYSTEM_CATEGORY_NAMES = [
  'IVA Compra',
  'IVA Venta',
  'Comisión Tarjeta',
];

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly repo: Repository<ExpenseCategory>,
  ) {}

  async list(query: ListExpenseCategoriesQueryDto = {}) {
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

  /**
   * Busca una categoría de sistema por nombre exacto. La usa la integración
   * automática de caja (compras → backfill, ventas con tarjeta → comisión).
   */
  async findSystemByName(name: string): Promise<ExpenseCategory> {
    const found = await this.repo.findOne({ where: { name, isSystem: true } });
    if (!found) {
      throw new NotFoundException(
        `Categoría de sistema "${name}" no encontrada — corré los seeds.`,
      );
    }
    return found;
  }

  async create(dto: CreateExpenseCategoryDto) {
    if (await this.repo.findOne({ where: { name: dto.name } })) {
      throw new ConflictException(
        `Ya existe una categoría con nombre "${dto.name}"`,
      );
    }
    return this.repo.save(this.repo.create({ name: dto.name, isSystem: false }));
  }

  async update(id: string, dto: UpdateExpenseCategoryDto) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Categoría no encontrada');
    if (entity.isSystem) {
      throw new ConflictException(
        'Esta categoría es del sistema y no puede modificarse.',
      );
    }
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.repo.findOne({ where: { name: dto.name } });
      if (dup)
        throw new ConflictException(
          `Ya existe una categoría con nombre "${dto.name}"`,
        );
      entity.name = dto.name;
    }
    return this.repo.save(entity);
  }

  async remove(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Categoría no encontrada');
    if (entity.isSystem) {
      throw new ConflictException(
        'Esta categoría es del sistema y no puede eliminarse.',
      );
    }
    try {
      await this.repo.remove(entity);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar la categoría: hay gastos asociados. Reasigná los gastos primero.',
      );
    }
  }
}
