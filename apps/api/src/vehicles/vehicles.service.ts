import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { VehicleMake, VehicleModel } from '../database/entities';
import {
  CreateVehicleMakeDto,
  CreateVehicleModelDto,
  ListVehicleMakesQueryDto,
  ListVehicleModelsQueryDto,
  UpdateVehicleMakeDto,
  UpdateVehicleModelDto,
} from './dto';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(VehicleMake) private readonly makesRepo: Repository<VehicleMake>,
    @InjectRepository(VehicleModel) private readonly modelsRepo: Repository<VehicleModel>,
  ) {}

  // -------- makes --------
  async listMakes(query: ListVehicleMakesQueryDto = {}) {
    const qb = this.makesRepo.createQueryBuilder('m').orderBy('m.name', 'ASC');
    if (query.q) qb.andWhere('m.name LIKE :q', { q: `%${query.q}%` });

    const paginated = query.page !== undefined || query.pageSize !== undefined;
    if (!paginated) return qb.getMany();

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    qb.take(pageSize).skip((page - 1) * pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async createMake(dto: CreateVehicleMakeDto) {
    if (await this.makesRepo.findOne({ where: { name: dto.name } })) {
      throw new ConflictException(`Ya existe la marca de vehículo "${dto.name}"`);
    }
    return this.makesRepo.save(this.makesRepo.create({ name: dto.name }));
  }

  async updateMake(id: string, dto: UpdateVehicleMakeDto) {
    const entity = await this.makesRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Marca de vehículo no encontrada');
    if (dto.name && dto.name !== entity.name) {
      const dup = await this.makesRepo.findOne({ where: { name: dto.name } });
      if (dup) throw new ConflictException(`Ya existe la marca "${dto.name}"`);
      entity.name = dto.name;
    }
    return this.makesRepo.save(entity);
  }

  async removeMake(id: string) {
    const entity = await this.makesRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Marca de vehículo no encontrada');
    try {
      await this.makesRepo.remove(entity);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar la marca de vehículo: hay modelos asociados. Eliminá primero los modelos.',
      );
    }
  }

  // -------- models --------
  async listModels(query: ListVehicleModelsQueryDto = {}) {
    const qb = this.modelsRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.make', 'make')
      .orderBy('make.name', 'ASC')
      .addOrderBy('m.name', 'ASC');
    if (query.makeId) qb.andWhere('m.makeId = :makeId', { makeId: query.makeId });
    if (query.q)
      qb.andWhere('(m.name LIKE :q OR make.name LIKE :q)', { q: `%${query.q}%` });

    const paginated = query.page !== undefined || query.pageSize !== undefined;
    if (!paginated) return qb.getMany();

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    qb.take(pageSize).skip((page - 1) * pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async createModel(dto: CreateVehicleModelDto) {
    const make = await this.makesRepo.findOne({ where: { id: dto.makeId } });
    if (!make) throw new NotFoundException('Marca no encontrada');
    const dup = await this.modelsRepo.findOne({
      where: { makeId: dto.makeId, name: dto.name },
    });
    if (dup) throw new ConflictException(`"${make.name} ${dto.name}" ya existe`);
    const entity = this.modelsRepo.create({ makeId: dto.makeId, name: dto.name });
    return this.modelsRepo.save(entity);
  }

  async updateModel(id: string, dto: UpdateVehicleModelDto) {
    const entity = await this.modelsRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Modelo no encontrado');
    if (dto.makeId !== undefined) {
      const make = await this.makesRepo.findOne({ where: { id: dto.makeId } });
      if (!make) throw new NotFoundException('Marca no encontrada');
      entity.makeId = dto.makeId;
    }
    if (dto.name !== undefined) entity.name = dto.name;
    return this.modelsRepo.save(entity);
  }

  async removeModel(id: string) {
    const entity = await this.modelsRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Modelo no encontrado');
    try {
      await this.modelsRepo.remove(entity);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar el modelo: hay productos con compatibilidades asociadas. Eliminá primero esas compatibilidades.',
      );
    }
  }
}
