import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySettings } from '../database/entities';
import { UpdateCompanySettingsDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(CompanySettings)
    private readonly repo: Repository<CompanySettings>,
  ) {}

  /**
   * Devuelve el singleton. Asume que el seed inicial creó la fila — si no
   * existe, falla con 500 (problema de instalación).
   */
  async get(): Promise<CompanySettings> {
    const [first] = await this.repo.find({ take: 1, order: { updatedAt: 'DESC' } });
    if (!first) {
      throw new NotFoundException(
        'CompanySettings no inicializado. Corré los seeds.',
      );
    }
    return first;
  }

  async update(dto: UpdateCompanySettingsDto): Promise<CompanySettings> {
    const settings = await this.get();

    if (dto.taxRate !== undefined) {
      const n = parseFloat(dto.taxRate);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new BadRequestException('taxRate debe ser un decimal entre 0 y 1');
      }
    }
    if (dto.cardCommissionRate !== undefined) {
      const n = parseFloat(dto.cardCommissionRate);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new BadRequestException(
          'cardCommissionRate debe ser un decimal entre 0 y 1',
        );
      }
    }

    Object.assign(settings, dto);
    return this.repo.save(settings);
  }
}
