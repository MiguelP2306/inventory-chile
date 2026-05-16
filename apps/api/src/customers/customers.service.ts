import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { rethrowFkAsConflict } from '../common/fk-error';
import { normalizePhone } from '../common/validators/phone';
import { normalizeRut } from '../common/validators/rut';
import { Commune, Customer } from '../database/entities';
import {
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    @InjectRepository(Commune)
    private readonly communes: Repository<Commune>,
  ) {}

  async list(query: ListCustomersQueryDto = {}) {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.commune', 'commune')
      .orderBy('c.name', 'ASC');
    if (query.q) {
      qb.andWhere(
        '(c.name LIKE :q OR c.taxId LIKE :q OR c.email LIKE :q OR c.phone LIKE :q)',
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
    const customer = await this.repo.findOne({
      where: { id },
      relations: { commune: true },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async create(dto: CreateCustomerDto) {
    const taxId = normalizeRut(dto.taxId);
    if (await this.repo.findOne({ where: { taxId } })) {
      throw new ConflictException(`Ya existe un cliente con RUT "${taxId}"`);
    }
    if (dto.communeId) await this.assertCommuneExists(dto.communeId);

    const entity = this.repo.create({
      name: dto.name.trim(),
      taxId,
      email: blank(dto.email),
      phone: dto.phone ? normalizePhone(dto.phone) : null,
      addressStreet: blank(dto.addressStreet),
      addressNumber: blank(dto.addressNumber),
      communeId: dto.communeId ?? null,
      internalNotes: blank(dto.internalNotes),
      // Fase 8.5 — campos de lifecycle. lifecycleStatus arranca en NEW por
      // default de la entidad. El operador puede setear source/whatsappPhone
      // al crear.
      source: dto.source,
      whatsappPhone: dto.whatsappPhone
        ? normalizePhone(dto.whatsappPhone)
        : null,
    });
    const saved = await this.repo.save(entity);
    return this.getOne(saved.id);
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Cliente no encontrado');

    if (dto.taxId !== undefined) {
      const newTaxId = normalizeRut(dto.taxId);
      if (newTaxId !== entity.taxId) {
        const dup = await this.repo.findOne({
          where: { taxId: newTaxId, id: Not(id) },
        });
        if (dup) {
          throw new ConflictException(
            `Ya existe un cliente con RUT "${newTaxId}"`,
          );
        }
        entity.taxId = newTaxId;
      }
    }
    if (dto.name !== undefined) entity.name = dto.name.trim();
    if (dto.email !== undefined) entity.email = blank(dto.email);
    if (dto.phone !== undefined) {
      entity.phone = dto.phone ? normalizePhone(dto.phone) : null;
    }
    if (dto.addressStreet !== undefined)
      entity.addressStreet = blank(dto.addressStreet);
    if (dto.addressNumber !== undefined)
      entity.addressNumber = blank(dto.addressNumber);
    if (dto.communeId !== undefined) {
      if (dto.communeId) await this.assertCommuneExists(dto.communeId);
      entity.communeId = dto.communeId ?? null;
    }
    if (dto.internalNotes !== undefined)
      entity.internalNotes = blank(dto.internalNotes);
    if (dto.source !== undefined) entity.source = dto.source;
    if (dto.whatsappPhone !== undefined) {
      entity.whatsappPhone = dto.whatsappPhone
        ? normalizePhone(dto.whatsappPhone)
        : null;
    }

    await this.repo.save(entity);
    return this.getOne(id);
  }

  async remove(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Cliente no encontrado');
    try {
      await this.repo.remove(entity);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar: el cliente tiene cotizaciones o ventas asociadas.',
      );
    }
  }

  private async assertCommuneExists(communeId: string) {
    const found = await this.communes.findOne({ where: { id: communeId } });
    if (!found) throw new NotFoundException('Comuna no encontrada');
  }
}

function blank(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}
