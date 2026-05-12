import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { Warehouse } from '../database/entities';
import {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from './dto';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly repo: Repository<Warehouse>,
  ) {}

  /**
   * Listado. `active=true` (default) muestra solo bodegas activas — útil para
   * selectores de venta/transferencia. `active=false` o sin filtro en la
   * pantalla `/almacenes` muestra todas para poder reactivar inactivas.
   */
  async list(query: ListWarehousesQueryDto = {}) {
    const where: Record<string, unknown> = {};
    if (query.q) where.name = Like(`%${query.q}%`);
    if (query.active === 'true') where.isActive = true;
    else if (query.active === 'false') where.isActive = false;
    // Si active no viene, devolvemos todas (caso `/almacenes`).

    const paginated = query.page !== undefined || query.pageSize !== undefined;
    if (!paginated) {
      return this.repo.find({
        where,
        // Activas primero, luego alfabético. Útil tanto para selectores como
        // para la pantalla de admin.
        order: { isActive: 'DESC', name: 'ASC' },
      });
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { isActive: 'DESC', name: 'ASC' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getOne(id: string) {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('Bodega no encontrada');
    return w;
  }

  async create(dto: CreateWarehouseDto) {
    const name = dto.name.trim();
    if (await this.repo.findOne({ where: { name } })) {
      throw new ConflictException(`Ya existe una bodega con nombre "${name}"`);
    }
    const entity = this.repo.create({
      name,
      address: dto.address?.trim() || null,
      isActive: true,
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Bodega no encontrada');

    if (dto.name && dto.name.trim() !== entity.name) {
      const trimmed = dto.name.trim();
      const dup = await this.repo.findOne({ where: { name: trimmed } });
      if (dup && dup.id !== id) {
        throw new ConflictException(`Ya existe una bodega con nombre "${trimmed}"`);
      }
      entity.name = trimmed;
    }
    if (dto.address !== undefined) {
      entity.address = dto.address?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      entity.isActive = dto.isActive;
    }
    return this.repo.save(entity);
  }

  /**
   * "Eliminar" desde la UI = soft delete (isActive=false). Si la bodega no
   * tiene movimientos NI stock asociado, permitimos hard delete (la borra de
   * la DB completamente). En caso contrario hace soft delete.
   *
   * La estrategia es deliberada: el operador hace click en "Eliminar" sin
   * tener que pensar en el estado. Si la bodega es virgen, desaparece. Si
   * tiene historia, se desactiva preservando los datos.
   */
  async remove(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Bodega no encontrada');

    try {
      await this.repo.remove(entity);
      return { ok: true, softDeleted: false };
    } catch (err) {
      // Si la FK rechaza el delete (hay movimientos/stock/ventas asociados),
      // hacemos soft delete preservando la fila. Cualquier otro error se
      // propaga sin cambios.
      const code = (err as { code?: string }).code;
      const isFkError =
        code === 'ER_ROW_IS_REFERENCED_2' ||
        code === 'ER_ROW_IS_REFERENCED' ||
        code === '23503';
      if (!isFkError) throw err as Error;

      entity.isActive = false;
      await this.repo.save(entity);
      return { ok: true, softDeleted: true };
    }
  }
}
