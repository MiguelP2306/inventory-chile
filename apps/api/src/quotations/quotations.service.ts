import {
  PublicQuotationDto,
  QuotationCustomerView,
  QuotationDto,
  QuotationItemDto,
  QuotationStatus,
} from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { CountersService } from '../common/counters.service';
import { dayRange } from '../common/date-range';
import { rethrowFkAsConflict } from '../common/fk-error';
import { normalizeRut } from '../common/validators/rut';
import {
  CompanySettings,
  Customer,
  Product,
  Quotation,
  QuotationItem,
} from '../database/entities';
import {
  CreateQuotationDto,
  CreateQuotationItemDto,
  ListQuotationsQueryDto,
  UpdateQuotationDto,
} from './dto';

const COUNTER_KIND = 'QUOTATION';
const NUMBER_PREFIX = 'COT';
const PAGE_SIZE_DEFAULT = 20;
const IMMUTABLE_STATUSES: QuotationStatus[] = [
  QuotationStatus.CONVERTED,
  QuotationStatus.EXPIRED,
];

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    @InjectRepository(Quotation)
    private readonly repo: Repository<Quotation>,
    @InjectRepository(QuotationItem)
    private readonly itemRepo: Repository<QuotationItem>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly counters: CountersService,
  ) {}

  // ---------------- public read API ----------------

  async list(query: ListQuotationsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;

    const qb = this.repo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.customer', 'customer')
      .leftJoinAndSelect('q.user', 'user');

    if (query.status) qb.andWhere('q.status = :status', { status: query.status });
    if (query.customerId)
      qb.andWhere('q.customerId = :cid', { cid: query.customerId });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('q.date BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('q.number LIKE :q', { q: `%${query.q}%` })
            .orWhere('q.customerNameSnapshot LIKE :q', {
              q: `%${query.q}%`,
            })
            .orWhere('customer.name LIKE :q', { q: `%${query.q}%` });
        }),
      );
    }

    qb.orderBy('q.date', 'DESC').addOrderBy('q.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);

    const [items, total] = await qb.getManyAndCount();
    // Hidratamos los items por separado para no explotar la query.
    const ids = items.map((i) => i.id);
    const itemsByQ = ids.length
      ? await this.fetchItemsForQuotations(ids)
      : new Map<string, QuotationItem[]>();
    const dtos = items.map((q) => this.toDto(q, itemsByQ.get(q.id) ?? []));
    return { items: dtos, total, page, pageSize };
  }

  async getOne(id: string): Promise<QuotationDto> {
    const q = await this.repo.findOne({
      where: { id },
      relations: { customer: true, user: true },
    });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    const items = (await this.fetchItemsForQuotations([id])).get(id) ?? [];
    return this.toDto(q, items);
  }

  async findByPublicToken(token: string): Promise<{
    quotation: Quotation;
    items: QuotationItem[];
  }> {
    const q = await this.repo.findOne({
      where: { publicToken: token },
      relations: { customer: true },
    });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    const items = (await this.fetchItemsForQuotations([q.id])).get(q.id) ?? [];
    return { quotation: q, items };
  }

  async toPublicDto(
    q: Quotation,
    items: QuotationItem[],
  ): Promise<PublicQuotationDto> {
    const settings = await this.getSettings();
    const view = buildCustomerView(q);
    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
    return {
      id: q.id,
      number: q.number,
      date: q.date.toISOString(),
      validUntil: q.validUntil ? q.validUntil.toISOString() : null,
      status: q.status,
      subtotal: q.subtotal,
      taxAmount: q.taxAmount,
      total: q.total,
      notes: q.notes,
      customer: {
        name: view.name,
        taxId: view.taxId,
        email: view.email,
        phone: view.phone,
      },
      items: items.map((it) => ({
        code:
          it.product?.partNumber ??
          it.product?.sku ??
          it.product?.universalCode ??
          '',
        description: it.product?.name ?? '',
        qty: it.qty,
        unitPrice: it.unitPrice,
        discount: it.discount,
        discountPercent: it.discountPercent,
        subtotal: it.subtotal,
      })),
      company: {
        name: settings.name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUrl,
        taxId: settings.taxId,
        quotationFooter: settings.quotationFooter,
      },
      pdfUrl: `${baseUrl}/p/cotizacion/${q.publicToken}/pdf`,
    };
  }

  /**
   * Lanza GoneException si la cotización está vencida (caso del link público
   * cuyo "token" expira el mismo día que `validUntil`).
   */
  assertPublicTokenLive(q: Quotation): void {
    if (
      q.validUntil &&
      q.validUntil.getTime() < Date.now() &&
      q.status === QuotationStatus.EXPIRED
    ) {
      // Para la lectura del JSON dejamos pasar (badge "Cotización vencida"),
      // pero el PDF y otras acciones lo enforcan.
      return;
    }
  }

  assertPdfTokenLive(q: Quotation): void {
    if (q.validUntil && q.validUntil.getTime() < startOfToday().getTime()) {
      throw new GoneException('La cotización ya venció.');
    }
  }

  // ---------------- writes ----------------

  async create(dto: CreateQuotationDto, userId: string): Promise<QuotationDto> {
    this.assertNoCustomerConflict(dto);

    if (dto.customerId) {
      const c = await this.customerRepo.findOne({ where: { id: dto.customerId } });
      if (!c) throw new NotFoundException('Cliente no encontrado');
    }

    await this.assertProductsExist(dto.items.map((i) => i.productId));

    const settings = await this.getSettings();
    const taxRate = parseFloat(settings.taxRate);

    const date = new Date(dto.date);
    const year = date.getFullYear();
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : addDays(date, settings.defaultValidityDays);

    const id = await this.ds.transaction(async (manager) => {
      const seq = await this.counters.nextNumber(COUNTER_KIND, year, manager);
      const number = CountersService.format(NUMBER_PREFIX, year, seq);
      const publicToken = randomBytes(24).toString('hex');

      const totals = computeTotals(dto.items, taxRate);

      const quotation = manager.getRepository(Quotation).create({
        number,
        customerId: dto.customerId ?? null,
        customerNameSnapshot: dto.customerId ? null : dto.customerNameSnapshot ?? null,
        customerPhoneSnapshot: dto.customerId ? null : dto.customerPhoneSnapshot ?? null,
        customerEmailSnapshot: dto.customerId ? null : dto.customerEmailSnapshot ?? null,
        customerTaxIdSnapshot: dto.customerId
          ? null
          : dto.customerTaxIdSnapshot
            ? normalizeRut(dto.customerTaxIdSnapshot)
            : null,
        date,
        validUntil,
        status: QuotationStatus.DRAFT,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: dto.notes ?? null,
        publicToken,
        sentAt: null,
        userId,
      });
      const saved = await manager.getRepository(Quotation).save(quotation);

      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i]!;
        const lineTotals = totals.lines[i]!;
        const item = manager.getRepository(QuotationItem).create({
          quotationId: saved.id,
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discount: lineTotals.discountAmount,
          discountPercent: it.discountPercent ?? null,
          subtotal: lineTotals.lineGross,
        });
        await manager.getRepository(QuotationItem).save(item);
      }

      return saved.id;
    });

    return this.getOne(id);
  }

  async update(
    id: string,
    dto: UpdateQuotationDto,
    _userId: string,
  ): Promise<QuotationDto> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Cotización no encontrada');
    if (IMMUTABLE_STATUSES.includes(existing.status)) {
      throw new ConflictException(
        'La cotización está cerrada (convertida o vencida) y no puede editarse.',
      );
    }

    if (dto.customerId !== undefined && dto.customerNameSnapshot !== undefined) {
      // Cliente catálogo y libre simultáneo: ambiguo. Si vienen los dos,
      // prevalece customerId — el snapshot se ignora. Pero si customerId se
      // envía explícitamente como null junto con un snapshot, eso es OK.
    }

    if (dto.customerId) {
      const c = await this.customerRepo.findOne({ where: { id: dto.customerId } });
      if (!c) throw new NotFoundException('Cliente no encontrado');
    }

    if (dto.items) {
      await this.assertProductsExist(dto.items.map((i) => i.productId));
    }

    const settings = await this.getSettings();
    const taxRate = parseFloat(settings.taxRate);

    await this.ds.transaction(async (manager) => {
      // Customer / snapshots
      if (dto.customerId !== undefined) {
        existing.customerId = dto.customerId ?? null;
        if (dto.customerId) {
          existing.customerNameSnapshot = null;
          existing.customerPhoneSnapshot = null;
          existing.customerEmailSnapshot = null;
          existing.customerTaxIdSnapshot = null;
        }
      }
      const switchingToFree =
        dto.customerId === null ||
        (dto.customerNameSnapshot !== undefined && !existing.customerId);
      if (switchingToFree) {
        if (dto.customerNameSnapshot !== undefined)
          existing.customerNameSnapshot = dto.customerNameSnapshot ?? null;
        if (dto.customerPhoneSnapshot !== undefined)
          existing.customerPhoneSnapshot = dto.customerPhoneSnapshot ?? null;
        if (dto.customerEmailSnapshot !== undefined)
          existing.customerEmailSnapshot = dto.customerEmailSnapshot ?? null;
        if (dto.customerTaxIdSnapshot !== undefined)
          existing.customerTaxIdSnapshot = dto.customerTaxIdSnapshot
            ? normalizeRut(dto.customerTaxIdSnapshot)
            : null;
      }

      if (dto.date) existing.date = new Date(dto.date);
      if (dto.validUntil !== undefined)
        existing.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
      if (dto.notes !== undefined) existing.notes = dto.notes ?? null;

      if (dto.items) {
        // Replace strategy: borrar e insertar.
        await manager
          .getRepository(QuotationItem)
          .delete({ quotationId: id });

        const totals = computeTotals(dto.items, taxRate);
        existing.subtotal = totals.subtotal;
        existing.taxAmount = totals.taxAmount;
        existing.total = totals.total;

        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i]!;
          const lineTotals = totals.lines[i]!;
          const item = manager.getRepository(QuotationItem).create({
            quotationId: id,
            productId: it.productId,
            qty: it.qty,
            unitPrice: it.unitPrice,
            discount: lineTotals.discountAmount,
            discountPercent: it.discountPercent ?? null,
            subtotal: lineTotals.lineGross,
          });
          await manager.getRepository(QuotationItem).save(item);
        }
      }

      await manager.getRepository(Quotation).save(existing);
    });

    return this.getOne(id);
  }

  async markApproved(id: string): Promise<QuotationDto> {
    const q = await this.repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    if (q.status !== QuotationStatus.SENT) {
      throw new ConflictException(
        'Solo se pueden aprobar cotizaciones en estado ENVIADA.',
      );
    }
    q.status = QuotationStatus.APPROVED;
    await this.repo.save(q);
    return this.getOne(id);
  }

  async markRejected(id: string, notes?: string): Promise<QuotationDto> {
    const q = await this.repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    if (
      q.status !== QuotationStatus.SENT &&
      q.status !== QuotationStatus.APPROVED
    ) {
      throw new ConflictException(
        'Solo se pueden rechazar cotizaciones ENVIADAS o APROBADAS.',
      );
    }
    q.status = QuotationStatus.REJECTED;
    if (notes) q.notes = notes;
    await this.repo.save(q);
    return this.getOne(id);
  }

  /**
   * Idempotente. Si `sentAt` es null lo setea a now() y status=SENT. Si ya
   * estaba SENT/APPROVED/REJECTED se preserva el status pero se asegura
   * `sentAt` (no se pisa si ya tenía valor).
   */
  async markSent(id: string, manager?: EntityManager): Promise<Quotation> {
    const repo = manager ? manager.getRepository(Quotation) : this.repo;
    const q = await repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    if (IMMUTABLE_STATUSES.includes(q.status)) {
      throw new ConflictException(
        'La cotización está cerrada y no puede marcarse como enviada.',
      );
    }
    let dirty = false;
    if (!q.sentAt) {
      q.sentAt = new Date();
      dirty = true;
    }
    if (q.status === QuotationStatus.DRAFT) {
      q.status = QuotationStatus.SENT;
      dirty = true;
    }
    if (dirty) await repo.save(q);
    return q;
  }

  async convert(id: string): Promise<{
    prefill: {
      customerId: string | null;
      customerSnapshot: {
        name: string | null;
        phone: string | null;
        email: string | null;
        taxId: string | null;
      };
      items: Array<{
        productId: string;
        qty: number;
        unitPrice: string;
        discount: string;
        discountPercent: string | null;
      }>;
      subtotal: string;
      taxAmount: string;
      total: string;
      notes: string | null;
      quotationId: string;
    };
  }> {
    const q = await this.repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    if (
      q.status === QuotationStatus.CONVERTED ||
      q.status === QuotationStatus.EXPIRED ||
      q.status === QuotationStatus.REJECTED
    ) {
      throw new ConflictException(
        'Esta cotización no puede convertirse en venta en su estado actual.',
      );
    }
    const items =
      (await this.fetchItemsForQuotations([id])).get(id) ?? [];
    return {
      prefill: {
        quotationId: q.id,
        customerId: q.customerId,
        customerSnapshot: {
          name: q.customerNameSnapshot,
          phone: q.customerPhoneSnapshot,
          email: q.customerEmailSnapshot,
          taxId: q.customerTaxIdSnapshot,
        },
        items: items.map((it) => ({
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discount: it.discount,
          discountPercent: it.discountPercent,
        })),
        subtotal: q.subtotal,
        taxAmount: q.taxAmount,
        total: q.total,
        notes: q.notes,
      },
    };
  }

  async expireOverdue(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Quotation)
      .set({ status: QuotationStatus.EXPIRED })
      .where('status IN (:...statuses)', {
        statuses: [QuotationStatus.SENT, QuotationStatus.APPROVED],
      })
      .andWhere('validUntil IS NOT NULL')
      .andWhere('validUntil < CURDATE()')
      .execute();
    return result.affected ?? 0;
  }

  async remove(id: string): Promise<{ ok: true }> {
    const q = await this.repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    if (q.status !== QuotationStatus.DRAFT) {
      throw new ConflictException(
        'Solo se pueden eliminar cotizaciones en estado BORRADOR. Anulá o convertí.',
      );
    }
    try {
      await this.repo.remove(q);
      return { ok: true };
    } catch (err) {
      rethrowFkAsConflict(
        err,
        'No se puede eliminar: la cotización tiene registros asociados.',
      );
    }
  }

  // ---------------- helpers ----------------

  async getSettings(): Promise<CompanySettings> {
    const [first] = await this.settingsRepo.find({
      take: 1,
      order: { updatedAt: 'DESC' },
    });
    if (!first) {
      throw new NotFoundException(
        'CompanySettings no inicializado. Corré los seeds.',
      );
    }
    return first;
  }

  private async assertProductsExist(productIds: string[]): Promise<void> {
    const unique = Array.from(new Set(productIds));
    const found = await this.productRepo.find({
      where: unique.map((id) => ({ id })),
      select: { id: true },
    });
    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((p) => p.id));
      const missing = unique.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Producto(s) no encontrado(s): ${missing.join(', ')}`,
      );
    }
  }

  private assertNoCustomerConflict(dto: CreateQuotationDto): void {
    // Cliente catálogo y libre simultáneo: ambiguo. Cliente vacío SÍ es válido
    // (cliente sin especificar — flujo rápido para enviar al instante).
    if (dto.customerId && dto.customerNameSnapshot) {
      throw new BadRequestException(
        'No se pueden indicar customerId y customerNameSnapshot a la vez.',
      );
    }
  }

  /**
   * Persiste un email de contacto en el snapshot. Solo aplica si la cotización
   * usa cliente libre (customerId == null). Para clientes del catálogo, el
   * email vive en el catálogo; este método no lo toca.
   */
  async setSnapshotEmail(id: string, email: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Quotation) : this.repo;
    const q = await repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    if (q.customerId) return;
    q.customerEmailSnapshot = email;
    await repo.save(q);
  }

  async setSnapshotPhone(id: string, phone: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Quotation) : this.repo;
    const q = await repo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Cotización no encontrada');
    if (q.customerId) return;
    q.customerPhoneSnapshot = phone;
    await repo.save(q);
  }

  private async fetchItemsForQuotations(
    ids: string[],
  ): Promise<Map<string, QuotationItem[]>> {
    const items = await this.itemRepo
      .createQueryBuilder('it')
      .leftJoinAndSelect('it.product', 'product')
      .where('it.quotationId IN (:...ids)', { ids })
      .getMany();
    const map = new Map<string, QuotationItem[]>();
    for (const it of items) {
      const arr = map.get(it.quotationId) ?? [];
      arr.push(it);
      map.set(it.quotationId, arr);
    }
    return map;
  }

  toDto(q: Quotation, items: QuotationItem[]): QuotationDto {
    const view = buildCustomerView(q);
    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';

    const customerDto = q.customer
      ? {
          id: q.customer.id,
          name: q.customer.name,
          taxId: q.customer.taxId,
          email: q.customer.email,
          phone: q.customer.phone,
          addressStreet: q.customer.addressStreet,
          addressNumber: q.customer.addressNumber,
          communeId: q.customer.communeId,
          internalNotes: q.customer.internalNotes,
        }
      : null;

    const itemDtos: QuotationItemDto[] = items.map((it) => ({
      id: it.id,
      productId: it.productId,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discount: it.discount,
      discountPercent: it.discountPercent,
      subtotal: it.subtotal,
      product: it.product
        ? {
            id: it.product.id,
            sku: it.product.sku,
            name: it.product.name,
            partNumber: it.product.partNumber,
            universalCode: it.product.universalCode,
            description: it.product.description,
          }
        : undefined,
    }));

    return {
      id: q.id,
      number: q.number,
      customerId: q.customerId,
      customer: customerDto,
      customerNameSnapshot: q.customerNameSnapshot,
      customerPhoneSnapshot: q.customerPhoneSnapshot,
      customerEmailSnapshot: q.customerEmailSnapshot,
      customerTaxIdSnapshot: q.customerTaxIdSnapshot,
      customerView: view,
      date: q.date.toISOString(),
      validUntil: q.validUntil ? q.validUntil.toISOString() : null,
      status: q.status,
      subtotal: q.subtotal,
      taxAmount: q.taxAmount,
      total: q.total,
      notes: q.notes,
      publicToken: q.publicToken,
      publicUrl: `${baseUrl}/p/cotizacion/${q.publicToken}`,
      sentAt: q.sentAt ? q.sentAt.toISOString() : null,
      user: q.user
        ? { id: q.user.id, name: q.user.name, email: q.user.email }
        : undefined,
      items: itemDtos,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    };
  }
}

// ---------------- pure helpers ----------------

function buildCustomerView(q: Quotation): QuotationCustomerView {
  if (q.customerId && q.customer) {
    return {
      fromCatalog: true,
      name: q.customer.name,
      taxId: q.customer.taxId ?? null,
      email: q.customer.email,
      phone: q.customer.phone,
      customerId: q.customerId,
    };
  }
  return {
    fromCatalog: false,
    name: q.customerNameSnapshot ?? '',
    taxId: q.customerTaxIdSnapshot,
    email: q.customerEmailSnapshot,
    phone: q.customerPhoneSnapshot,
    customerId: null,
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

interface LineTotals {
  lineGross: string;
  discountAmount: string;
  subtotalNeto: string;
  tax: string;
}

interface AggregateTotals {
  subtotal: string;
  taxAmount: string;
  total: string;
  lines: LineTotals[];
}

function roundHalfUp(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.sign(n) * Math.round(Math.abs(n) * factor) / factor;
}

function fmt2(n: number): string {
  return roundHalfUp(n).toFixed(2);
}

export function computeTotals(
  items: CreateQuotationItemDto[],
  taxRate: number,
): AggregateTotals {
  const lines: LineTotals[] = [];
  let totalGross = 0;
  let totalNeto = 0;
  let totalTax = 0;

  for (const it of items) {
    const qty = it.qty;
    const unitPrice = parseFloat(it.unitPrice);
    let discountAmount: number;
    if (it.discountPercent != null && it.discountPercent !== '') {
      const pct = parseFloat(it.discountPercent);
      discountAmount = (qty * unitPrice * pct) / 100;
    } else if (it.discount != null && it.discount !== '') {
      discountAmount = parseFloat(it.discount);
    } else {
      discountAmount = 0;
    }
    discountAmount = roundHalfUp(discountAmount);

    const lineGrossNum = roundHalfUp(qty * unitPrice - discountAmount);
    const subtotalNetoNum = roundHalfUp(lineGrossNum / (1 + taxRate));
    const taxNum = roundHalfUp(lineGrossNum - subtotalNetoNum);

    lines.push({
      lineGross: fmt2(lineGrossNum),
      discountAmount: fmt2(discountAmount),
      subtotalNeto: fmt2(subtotalNetoNum),
      tax: fmt2(taxNum),
    });
    totalGross += lineGrossNum;
    totalNeto += subtotalNetoNum;
    totalTax += taxNum;
  }

  return {
    subtotal: fmt2(totalNeto),
    taxAmount: fmt2(totalTax),
    total: fmt2(totalGross),
    lines,
  };
}
