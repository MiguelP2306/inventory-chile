import {
  WarrantyClaimDto,
  WarrantyStatus,
} from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Not, Repository } from 'typeorm';
import { CountersService } from '../common/counters.service';
import { dayRange } from '../common/date-range';
import { SaleItem, WarrantyClaim } from '../database/entities';
import {
  CreateWarrantyClaimDto,
  ListWarrantyClaimsQueryDto,
  UpdateWarrantyClaimStatusDto,
} from './dto';

const COUNTER_KIND = 'WARRANTY';
const NUMBER_PREFIX = 'GAR';
const PAGE_SIZE_DEFAULT = 20;

// Estados terminales — un reclamo en estos estados NO bloquea abrir uno nuevo
// sobre el mismo SaleItem. Estados activos (OPEN, IN_REVIEW, APPROVED) sí.
const TERMINAL_STATUSES: WarrantyStatus[] = [
  WarrantyStatus.REJECTED,
  WarrantyStatus.RESOLVED,
];

// Transiciones válidas. Las transiciones inválidas se rechazan con 409.
const VALID_TRANSITIONS: Record<WarrantyStatus, WarrantyStatus[]> = {
  [WarrantyStatus.OPEN]: [WarrantyStatus.IN_REVIEW, WarrantyStatus.REJECTED],
  [WarrantyStatus.IN_REVIEW]: [
    WarrantyStatus.APPROVED,
    WarrantyStatus.REJECTED,
  ],
  [WarrantyStatus.APPROVED]: [WarrantyStatus.RESOLVED],
  // Terminales: no se sale de acá.
  [WarrantyStatus.REJECTED]: [],
  [WarrantyStatus.RESOLVED]: [],
};

@Injectable()
export class WarrantiesService {
  constructor(
    @InjectRepository(WarrantyClaim)
    private readonly repo: Repository<WarrantyClaim>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepo: Repository<SaleItem>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly counters: CountersService,
  ) {}

  async list(query: ListWarrantyClaimsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;

    const qb = this.repo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.product', 'product')
      .leftJoinAndSelect('w.customer', 'customer')
      .leftJoinAndSelect('w.user', 'user')
      .leftJoinAndSelect('w.linkedReturn', 'linkedReturn')
      .leftJoinAndSelect('w.saleItem', 'saleItem')
      .leftJoinAndSelect('saleItem.sale', 'sale');

    if (query.status) qb.andWhere('w.status = :st', { st: query.status });
    if (query.customerId)
      qb.andWhere('w.customerId = :cid', { cid: query.customerId });
    if (query.productId)
      qb.andWhere('w.productId = :pid', { pid: query.productId });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('w.openedAt BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('w.number LIKE :q', { q: `%${query.q}%` })
            .orWhere('product.name LIKE :q')
            .orWhere('product.sku LIKE :q')
            .orWhere('customer.name LIKE :q');
        }),
      );
    }

    qb.orderBy('w.openedAt', 'DESC').addOrderBy('w.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((w) => this.toDto(w)),
      total,
      page,
      pageSize,
    };
  }

  async getOne(id: string): Promise<WarrantyClaimDto> {
    const w = await this.repo.findOne({
      where: { id },
      relations: {
        product: true,
        customer: true,
        user: true,
        linkedReturn: true,
        saleItem: { sale: true },
      },
    });
    if (!w) throw new NotFoundException('Reclamo de garantía no encontrado');
    return this.toDto(w);
  }

  async create(
    dto: CreateWarrantyClaimDto,
    userId: string,
  ): Promise<WarrantyClaimDto> {
    const saleItem = await this.saleItemRepo.findOne({
      where: { id: dto.saleItemId },
      relations: { sale: true, product: true },
    });
    if (!saleItem) throw new NotFoundException('Item de venta no encontrado');
    if (!saleItem.sale) {
      throw new BadRequestException('El item no está vinculado a una venta');
    }

    // Validar que no haya un reclamo activo sobre este saleItem.
    const activeExisting = await this.repo.findOne({
      where: {
        saleItemId: dto.saleItemId,
        status: Not(WarrantyStatus.REJECTED),
      },
    });
    if (
      activeExisting &&
      !TERMINAL_STATUSES.includes(activeExisting.status as WarrantyStatus)
    ) {
      throw new ConflictException(
        `Ya hay un reclamo activo sobre este item (${activeExisting.number}, estado ${activeExisting.status}). Cerrá ese primero o abrí uno nuevo si quedó en RESOLVED/REJECTED.`,
      );
    }

    const now = new Date();
    const year = now.getFullYear();

    const id = await this.ds.transaction(async (manager) => {
      const seq = await this.counters.nextNumber(COUNTER_KIND, year, manager);
      const number = CountersService.format(NUMBER_PREFIX, year, seq);

      const claim = manager.getRepository(WarrantyClaim).create({
        number,
        saleItemId: dto.saleItemId,
        productId: saleItem.productId,
        customerId: saleItem.sale!.customerId,
        status: WarrantyStatus.OPEN,
        openedAt: now,
        resolvedAt: null,
        resolution: null,
        notes: dto.notes?.trim() || null,
        linkedReturnId: null,
        userId,
      });
      const saved = await manager.getRepository(WarrantyClaim).save(claim);
      return saved.id;
    });

    return this.getOne(id);
  }

  /**
   * Cambia el estado del reclamo respetando las transiciones permitidas.
   * Al pasar a RESOLVED, marca `resolvedAt`. La resolución (texto) se persiste
   * para que quede registro de qué pasó (cambio de producto, reparación, etc.).
   */
  async updateStatus(
    id: string,
    dto: UpdateWarrantyClaimStatusDto,
  ): Promise<WarrantyClaimDto> {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('Reclamo de garantía no encontrado');

    if (w.status === dto.status) return this.getOne(id);

    const allowed = VALID_TRANSITIONS[w.status as WarrantyStatus] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Transición inválida: ${w.status} → ${dto.status}. Transiciones permitidas: ${allowed.join(', ') || '(ninguna — estado terminal)'}.`,
      );
    }

    // RESOLVED y REJECTED necesitan resolución (texto explicativo).
    if (
      (dto.status === WarrantyStatus.RESOLVED ||
        dto.status === WarrantyStatus.REJECTED) &&
      !dto.resolution?.trim()
    ) {
      throw new BadRequestException(
        'Para cerrar el reclamo debés escribir una resolución (texto explicativo)',
      );
    }

    w.status = dto.status;
    if (dto.resolution !== undefined) w.resolution = dto.resolution?.trim() || null;
    if (dto.notes !== undefined) w.notes = dto.notes?.trim() || null;
    if (
      dto.status === WarrantyStatus.RESOLVED ||
      dto.status === WarrantyStatus.REJECTED
    ) {
      w.resolvedAt = new Date();
    }
    await this.repo.save(w);
    return this.getOne(id);
  }

  /**
   * Linkea una devolución existente a este reclamo. Lo llama el frontend tras
   * crear la devolución desde el detalle del reclamo (flujo APPROVED → cambio).
   */
  async linkReturn(id: string, returnId: string): Promise<WarrantyClaimDto> {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('Reclamo de garantía no encontrado');
    w.linkedReturnId = returnId;
    await this.repo.save(w);
    return this.getOne(id);
  }

  private toDto(w: WarrantyClaim): WarrantyClaimDto {
    return {
      id: w.id,
      number: w.number,
      saleItemId: w.saleItemId,
      productId: w.productId,
      customerId: w.customerId,
      status: w.status,
      openedAt: w.openedAt.toISOString(),
      resolvedAt: w.resolvedAt ? w.resolvedAt.toISOString() : null,
      resolution: w.resolution,
      notes: w.notes,
      linkedReturnId: w.linkedReturnId,
      sale: w.saleItem?.sale
        ? { id: w.saleItem.sale.id, number: w.saleItem.sale.number }
        : null,
      product: w.product
        ? { id: w.product.id, sku: w.product.sku, name: w.product.name }
        : undefined,
      customer: w.customer
        ? { id: w.customer.id, name: w.customer.name, taxId: w.customer.taxId }
        : undefined,
      user: w.user
        ? { id: w.user.id, name: w.user.name, email: w.user.email }
        : undefined,
      linkedReturn: w.linkedReturn
        ? { id: w.linkedReturn.id, number: w.linkedReturn.number }
        : null,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    };
  }
}
