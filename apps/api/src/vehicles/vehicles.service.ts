import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleMake, VehicleModel } from '../database/entities';
import {
  CreateVehicleMakeDto,
  CreateVehicleModelDto,
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
  listMakes() {
    return this.makesRepo.find({ order: { name: 'ASC' } });
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
    await this.makesRepo.remove(entity);
    return { ok: true };
  }

  // -------- models --------
  listModels(makeId?: string) {
    return this.modelsRepo.find({
      where: makeId ? { makeId } : {},
      relations: { make: true },
      order: { name: 'ASC' },
    });
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
    await this.modelsRepo.remove(entity);
    return { ok: true };
  }
}
