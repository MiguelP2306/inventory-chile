import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Commune } from '../database/entities';

@Injectable()
export class CommunesService {
  constructor(
    @InjectRepository(Commune)
    private readonly repo: Repository<Commune>,
  ) {}

  /** Lista todas las comunas, ordenadas por región y luego por nombre. */
  list(region?: string) {
    return this.repo.find({
      where: region ? { region } : {},
      order: { region: 'ASC', name: 'ASC' },
    });
  }

  async getOne(id: string) {
    const commune = await this.repo.findOne({ where: { id } });
    if (!commune) throw new NotFoundException('Comuna no encontrada');
    return commune;
  }
}
