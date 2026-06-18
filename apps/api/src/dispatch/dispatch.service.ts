import {
  DispatchNoteDto,
  DispatchStatus,
  InventoryMovementType,
  SaleStatus,
} from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { CountersService } from '../common/counters.service';
import { dayRange } from '../common/date-range';
import { businessNoonToday, parseBusinessDate } from '../common/timezone';
import {
  Commune,
  Customer,
  DispatchNote,
  Sale,
  SaleItem,
} from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import {
  CreateDispatchNoteDto,
  ListDispatchNotesQueryDto,
  VoidDispatchNoteDto,
} from './dto';

const COUNTER_KIND = 'DISPATCH';
const NUMBER_PREFIX = 'DESP';
const PAGE_SIZE_DEFAULT = 20;

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    @InjectRepository(DispatchNote)
    private readonly repo: Repository<DispatchNote>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Commune)
    private readonly communeRepo: Repository<Commune>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly counters: CountersService,
    private readonly inventory: InventoryService,
  ) {}

  // ---------------- reads ----------------

  async list(query: ListDispatchNotesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;

    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.sale', 'sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('d.commune', 'commune')
      .leftJoinAndSelect('d.user', 'user')
      .leftJoinAndSelect('d.voidedBy', 'voidedBy');

    if (query.status) qb.andWhere('d.status = :st', { st: query.status });
    if (query.saleId) qb.andWhere('d.saleId = :sid', { sid: query.saleId });
    if (query.carrier)
      qb.andWhere('d.carrier = :c', { c: query.carrier });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('d.dispatchedAt BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('d.number LIKE :q', { q: `%${query.q}%` })
            .orWhere('sale.number LIKE :q')
            .orWhere('d.carrier LIKE :q')
            .orWhere('d.trackingNumber LIKE :q')
            .orWhere('customer.name LIKE :q');
        }),
      );
    }

    qb.orderBy('d.dispatchedAt', 'DESC').addOrderBy('d.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((d) => this.toDto(d)),
      total,
      page,
      pageSize,
    };
  }

  async getOne(id: string): Promise<DispatchNoteDto> {
    const d = await this.repo.findOne({
      where: { id },
      relations: {
        sale: { customer: true, items: { product: true } },
        commune: true,
        user: true,
        voidedBy: true,
      },
    });
    if (!d) throw new NotFoundException('Guía de despacho no encontrada');
    return this.toDto(d);
  }

  /**
   * Lista de transportistas usados recientemente (top N por uso). Lo consume
   * el form para sugerir transportistas frecuentes sin necesidad de un CRUD
   * dedicado de transportistas.
   */
  async recentCarriers(limit = 10): Promise<string[]> {
    const rows: Array<{ carrier: string; uses: number }> = await this.repo
      .createQueryBuilder('d')
      .select('d.carrier', 'carrier')
      .addSelect('COUNT(*)', 'uses')
      .where('d.carrier IS NOT NULL')
      .andWhere('d.carrier <> :empty', { empty: '' })
      .groupBy('d.carrier')
      .orderBy('uses', 'DESC')
      .limit(limit)
      .getRawMany();
    return rows.map((r) => r.carrier).filter(Boolean);
  }

  /**
   * Devuelve la guía ACTIVA de una venta si existe (o null). Util para que
   * el frontend pinte el botón "Generar guía" vs "Ver guía DESP-XYZ" según
   * el estado.
   */
  async findActiveBySale(saleId: string): Promise<DispatchNoteDto | null> {
    const d = await this.repo.findOne({
      where: { saleId, status: DispatchStatus.ACTIVE },
      relations: {
        sale: { customer: true, items: { product: true } },
        commune: true,
        user: true,
      },
    });
    return d ? this.toDto(d) : null;
  }

  // ---------------- create ----------------

  async create(
    dto: CreateDispatchNoteDto,
    userId: string,
  ): Promise<DispatchNoteDto> {
    const sale = await this.saleRepo.findOne({ where: { id: dto.saleId } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === SaleStatus.CANCELLED) {
      throw new ConflictException(
        'La venta está cancelada — no se puede generar guía de despacho.',
      );
    }

    // Regla 1-activa-por-venta: si ya hay una ACTIVE, rechazamos. El
    // operador debe anularla primero (flujo explícito).
    const existing = await this.repo.findOne({
      where: { saleId: dto.saleId, status: DispatchStatus.ACTIVE },
    });
    if (existing) {
      throw new ConflictException(
        `Esta venta ya tiene una guía activa (${existing.number}). Anulala antes de generar una nueva.`,
      );
    }

    if (dto.communeId) {
      const c = await this.communeRepo.findOne({
        where: { id: dto.communeId },
      });
      if (!c) throw new NotFoundException('Comuna no encontrada');
    }

    const dispatchedAt = dto.dispatchedAt
      ? parseBusinessDate(dto.dispatchedAt)
      : businessNoonToday();
    const year = dispatchedAt.getFullYear();

    const id = await this.ds.transaction(async (manager) => {
      const seq = await this.counters.nextNumber(COUNTER_KIND, year, manager);
      const number = CountersService.format(NUMBER_PREFIX, year, seq);

      const note = manager.getRepository(DispatchNote).create({
        number,
        saleId: dto.saleId,
        dispatchedAt,
        carrier: dto.carrier?.trim() || null,
        trackingNumber: dto.trackingNumber?.trim() || null,
        addressStreet: dto.addressStreet?.trim() || null,
        addressNumber: dto.addressNumber?.trim() || null,
        communeId: dto.communeId ?? null,
        addressNotes: dto.addressNotes?.trim() || null,
        notes: dto.notes?.trim() || null,
        status: DispatchStatus.ACTIVE,
        userId,
      });
      const saved = await manager.getRepository(DispatchNote).save(note);

      // Audit-only: el SALE_OUT real ya bajó stock al confirmar la venta.
      // Acá dejamos rastro del despacho físico en /inventario/movimientos
      // para trazabilidad, sin volver a tocar `stocks`.
      await this.recordSaleItemAudit(
        manager,
        sale.id,
        sale.warehouseId,
        InventoryMovementType.DISPATCH_OUT,
        number,
        saved.id,
        userId,
      );

      return saved.id;
    });

    return this.getOne(id);
  }

  /**
   * Recorre los items de la venta y registra un movimiento audit-only por
   * cada uno. Se usa al generar y al anular guías (mismo formato, distinto
   * `type` y signo). NO modifica `stocks`.
   */
  private async recordSaleItemAudit(
    manager: EntityManager,
    saleId: string,
    warehouseId: string,
    type: InventoryMovementType,
    reference: string,
    refId: string,
    userId: string,
  ): Promise<void> {
    const items = await manager.getRepository(SaleItem).find({
      where: { saleId },
    });
    // DISPATCH_OUT: qty negativa (salida); DISPATCH_VOIDED: qty positiva
    // (reversa). El registro es informativo — el stock real no se toca.
    const sign = type === InventoryMovementType.DISPATCH_OUT ? -1 : 1;
    for (const it of items) {
      await this.inventory.recordMovementWithoutStockImpact(manager, {
        productId: it.productId,
        warehouseId,
        type,
        qty: sign * it.qty,
        unitCost: it.unitCost ?? null,
        reference,
        refId,
        userId,
      });
    }
  }

  // ---------------- void ----------------

  async voidNote(
    id: string,
    dto: VoidDispatchNoteDto,
    userId: string,
  ): Promise<DispatchNoteDto> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Guía de despacho no encontrada');
    if (existing.status === DispatchStatus.VOIDED) {
      throw new ConflictException('La guía ya está anulada');
    }

    await this.ds.transaction(async (manager) => {
      existing.status = DispatchStatus.VOIDED;
      existing.voidedAt = new Date();
      existing.voidReason = dto.reason.trim();
      existing.voidedById = userId;
      await manager.getRepository(DispatchNote).save(existing);

      // Audit-only: dejamos rastro del cambio de estado en el historial
      // de movimientos. No revertimos stock (el SALE_OUT sigue vigente
      // mientras la venta no se cancele).
      const sale = await manager.getRepository(Sale).findOne({
        where: { id: existing.saleId },
      });
      if (sale) {
        await this.recordSaleItemAudit(
          manager,
          sale.id,
          sale.warehouseId,
          InventoryMovementType.DISPATCH_VOIDED,
          existing.number,
          existing.id,
          userId,
        );
      }
    });

    return this.getOne(id);
  }

  /**
   * Anula la guía activa (si la hay) de una venta. Se llama desde
   * SalesService.cancel en cascada. Usa el manager del caller para mantener
   * atomicidad con el cancel.
   */
  async voidActiveBySale(
    saleId: string,
    reason: string,
    userId: string,
    manager: EntityManager,
  ): Promise<void> {
    const active = await manager.getRepository(DispatchNote).findOne({
      where: { saleId, status: DispatchStatus.ACTIVE },
    });
    if (!active) return;
    active.status = DispatchStatus.VOIDED;
    active.voidedAt = new Date();
    active.voidReason = reason;
    active.voidedById = userId;
    await manager.getRepository(DispatchNote).save(active);

    // Audit-only del cambio de estado, usando el manager del caller para
    // mantener atomicidad con la cancelación de la venta.
    const sale = await manager.getRepository(Sale).findOne({
      where: { id: saleId },
    });
    if (sale) {
      await this.recordSaleItemAudit(
        manager,
        sale.id,
        sale.warehouseId,
        InventoryMovementType.DISPATCH_VOIDED,
        active.number,
        active.id,
        userId,
      );
    }
  }

  // ---------------- helpers ----------------

  private toDto(d: DispatchNote): DispatchNoteDto {
    const sale = d.sale;
    return {
      id: d.id,
      number: d.number,
      saleId: d.saleId,
      sale: sale
        ? {
            id: sale.id,
            number: sale.number,
            customerId: sale.customerId,
            customer: sale.customer
              ? {
                  id: sale.customer.id,
                  name: sale.customer.name,
                  taxId: sale.customer.taxId,
                }
              : undefined,
            items: sale.items?.map((it) => ({
              id: it.id,
              productId: it.productId,
              qty: it.qty,
              unitPrice: it.unitPrice,
              discount: it.discount,
              subtotal: it.subtotal,
              product: it.product
                ? {
                    id: it.product.id,
                    sku: it.product.sku,
                    name: it.product.name,
                  }
                : undefined,
            })),
            // Totales de la venta para la guía valorizada.
            subtotal: sale.subtotal,
            taxAmount: sale.taxAmount,
            total: sale.total,
          }
        : undefined,
      dispatchedAt: d.dispatchedAt.toISOString(),
      carrier: d.carrier,
      trackingNumber: d.trackingNumber,
      addressStreet: d.addressStreet,
      addressNumber: d.addressNumber,
      communeId: d.communeId,
      commune: d.commune
        ? { id: d.commune.id, name: d.commune.name, region: d.commune.region }
        : null,
      addressNotes: d.addressNotes,
      notes: d.notes,
      status: d.status,
      voidedAt: d.voidedAt ? d.voidedAt.toISOString() : null,
      voidReason: d.voidReason,
      voidedBy: d.voidedBy
        ? {
            id: d.voidedBy.id,
            name: d.voidedBy.name,
            email: d.voidedBy.email,
          }
        : null,
      user: d.user
        ? { id: d.user.id, name: d.user.name, email: d.user.email }
        : undefined,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
