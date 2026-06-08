import {
  CashTransactionSource,
  CashTransactionType,
  InventoryMovementType,
  PaymentMethod,
  QuotationStatus,
  SaleDto,
  SaleItemDto,
  SaleStatus,
  SalesKpisDto,
  SalesTopCustomerDto,
  SalesTopProductDto,
} from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Brackets,
  DataSource,
  EntityManager,
  In,
  Repository,
} from 'typeorm';
import { CashboxService } from '../cashbox/cashbox.service';
import { CountersService } from '../common/counters.service';
import { dayRange } from '../common/date-range';
import {
  businessNoonToday,
  businessTodayStr,
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
  startOfBusinessMonth,
} from '../common/timezone';
import {
  CashTransaction,
  CompanySettings,
  Customer,
  ExpenseCategory,
  Product,
  Quotation,
  Sale,
  SaleItem,
  Stock,
  Warehouse,
} from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { CancelSaleDto, CreateSaleDto, ListSalesQueryDto } from './dto';

const COUNTER_KIND = 'SALE';
const NUMBER_PREFIX = 'VTA';
const PAGE_SIZE_DEFAULT = 20;
const CARD_COMMISSION_CATEGORY_NAME = 'Comisión Tarjeta';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sale) private readonly repo: Repository<Sale>,
    @InjectRepository(SaleItem) private readonly itemRepo: Repository<SaleItem>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectRepository(ExpenseCategory)
    private readonly categoryRepo: Repository<ExpenseCategory>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly counters: CountersService,
    private readonly inventory: InventoryService,
    private readonly cashbox: CashboxService,
    private readonly lifecycle: LifecycleService,
  ) {}

  // ---------------- reads ----------------

  async list(query: ListSalesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;

    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.customer', 'customer')
      .leftJoinAndSelect('s.warehouse', 'warehouse')
      .leftJoinAndSelect('s.user', 'user')
      .leftJoinAndSelect('s.quotation', 'quotation');

    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.paymentMethod)
      qb.andWhere('s.paymentMethod = :pm', { pm: query.paymentMethod });
    if (query.customerId)
      qb.andWhere('s.customerId = :cid', { cid: query.customerId });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('s.date BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('s.number LIKE :q', { q: `%${query.q}%` })
            .orWhere('customer.name LIKE :q')
            .orWhere('customer.taxId LIKE :q');
        }),
      );
    }

    qb.orderBy('s.date', 'DESC').addOrderBy('s.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);
    const [items, total] = await qb.getManyAndCount();

    // Cargar items en batch para que el listado pueda mostrar la cantidad sin
    // un N+1.
    const ids = items.map((s) => s.id);
    const itemsBySale = await this.fetchItemsForSales(ids);

    return {
      items: items.map((s) =>
        this.toDto(s, itemsBySale.get(s.id) ?? []),
      ),
      total,
      page,
      pageSize,
    };
  }

  async getOne(id: string): Promise<SaleDto> {
    const s = await this.repo.findOne({
      where: { id },
      relations: {
        customer: true,
        warehouse: true,
        user: true,
        cancelledBy: true,
        quotation: true,
      },
    });
    if (!s) throw new NotFoundException('Venta no encontrada');
    const items = (await this.fetchItemsForSales([s.id])).get(s.id) ?? [];
    return this.toDto(s, items);
  }

  // ---------------- create ----------------

  async create(dto: CreateSaleDto, userId: string): Promise<SaleDto> {
    // Validación liviana fuera de la transacción (evita locks innecesarios).
    if (dto.items.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un item');
    }

    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    // Ronda 9 — los clientes "lite" (sólo WhatsApp, sin RUT) pueden recibir
    // cotizaciones pero NO ventas formales. Si llegamos a facturar, el RUT
    // es obligatorio porque queda en el documento de venta.
    if (!customer.taxId || customer.taxId.trim() === '') {
      throw new ConflictException(
        'Este cliente no tiene RUT cargado. Completalo en el perfil del cliente antes de facturar la venta.',
      );
    }

    const warehouseId = dto.warehouseId ?? (await this.defaultWarehouseId());

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.productRepo.find({
      where: { id: In(productIds) },
    });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException('Algún producto no existe');
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    // Detección temprana de duplicados (mismo productId dos veces). Sumarlos
    // hace que la validación de stock por línea sea inconsistente.
    if (productIds.length !== new Set(productIds).size) {
      throw new BadRequestException(
        'Hay items duplicados. Sumá las cantidades en una sola línea.',
      );
    }

    const settings = await this.getSettings();
    const taxRate = parseFloat(settings.taxRate);
    // Ronda 9 — la comisión se calcula según el método: débito, crédito o
    // link de pago. Cada uno tiene su propia tasa en CompanySettings.
    const commissionRate = commissionRateFor(dto.paymentMethod, settings);

    const date = dto.date ? parseBusinessDate(dto.date) : businessNoonToday();
    const year = date.getFullYear();

    const chargesCommission = commissionRate > 0;
    const cardCategory = chargesCommission
      ? await this.categoryRepo.findOne({
          where: { name: CARD_COMMISSION_CATEGORY_NAME },
        })
      : null;
    if (chargesCommission && !cardCategory) {
      throw new ConflictException(
        'Falta la categoría "Comisión Tarjeta" en el seed. Ejecutá db:seed.',
      );
    }

    const id = await this.ds.transaction(async (manager) => {
      // Calculo de totales y comisión.
      const totals = computeSaleTotals(dto.items, taxRate);

      const commissionAmount = chargesCommission
        ? roundHalfUp(parseFloat(totals.total) * commissionRate)
        : 0;

      const seq = await this.counters.nextNumber(COUNTER_KIND, year, manager);
      const number = CountersService.format(NUMBER_PREFIX, year, seq);

      const sale = manager.getRepository(Sale).create({
        number,
        customerId: dto.customerId,
        warehouseId,
        date,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        commissionAmount: commissionAmount.toFixed(2),
        total: totals.total,
        paymentMethod: dto.paymentMethod,
        status: SaleStatus.PAID,
        notes: dto.notes ?? null,
        quotationId: dto.quotationId ?? null,
        userId,
      });
      const savedSale = await manager.getRepository(Sale).save(sale);

      // Persistimos los items con `unitCost` CONGELADO (costo actual del
      // producto al momento de la venta). Eso permite reportes históricos
      // de rentabilidad correctos aunque el costo del producto cambie luego.
      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i]!;
        const line = totals.lines[i]!;
        const product = productById.get(it.productId)!;
        const item = manager.getRepository(SaleItem).create({
          saleId: savedSale.id,
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discount: line.discountAmount,
          discountPercent: it.discountPercent ?? null,
          subtotal: line.lineGross,
          unitCost: product.cost,
        });
        await manager.getRepository(SaleItem).save(item);

        // Aplicar el movimiento de stock. applyMovement valida que no quede
        // negativo y tira ConflictException si pasa.
        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId,
          type: InventoryMovementType.SALE_OUT,
          qty: -it.qty, // signado: salida
          unitCost: product.cost,
          reference: number,
          refId: savedSale.id,
          userId,
        });
      }

      // Caja: ingreso por el total bruto.
      await this.cashbox.recordTransaction(
        {
          date,
          type: CashTransactionType.INCOME,
          source: CashTransactionSource.SALE,
          sourceId: savedSale.id,
          description: `Venta ${number}`,
          amount: totals.total,
          paymentMethod: dto.paymentMethod,
          expenseCategoryId: null,
          userId,
        },
        manager,
      );

      // Ronda 9 — egreso automático por comisión (débito, crédito o link).
      // Se aplica cuando el método cobra comisión (chargesCommission). La
      // comisión se imputa con el mismo paymentMethod que la venta para que
      // los reportes de caja por método sigan cuadrando.
      if (chargesCommission && commissionAmount > 0) {
        await this.cashbox.recordTransaction(
          {
            date,
            type: CashTransactionType.EXPENSE,
            source: CashTransactionSource.SALE,
            sourceId: savedSale.id,
            description: `Comisión ${labelForPaymentMethod(dto.paymentMethod)} · Venta ${number}`,
            amount: commissionAmount.toFixed(2),
            paymentMethod: dto.paymentMethod,
            expenseCategoryId: cardCategory!.id,
            userId,
          },
          manager,
        );
      }

      // Si proviene de una cotización, la marcamos CONVERTED en la misma
      // transacción. Validamos que la cotización no esté ya cerrada.
      if (dto.quotationId) {
        const qRepo = manager.getRepository(Quotation);
        const q = await qRepo.findOne({ where: { id: dto.quotationId } });
        if (!q) {
          throw new NotFoundException('Cotización origen no encontrada');
        }
        if (
          q.status === QuotationStatus.CONVERTED ||
          q.status === QuotationStatus.EXPIRED ||
          q.status === QuotationStatus.REJECTED
        ) {
          throw new ConflictException(
            'La cotización origen no puede convertirse en este estado.',
          );
        }
        q.status = QuotationStatus.CONVERTED;
        // Si la cotización venía con cliente libre (snapshot) y la venta se
        // confirmó contra un cliente del catálogo (recién registrado o no),
        // linkeamos la cotización al cliente real para que reportes futuros
        // por cliente la encuentren. Los snapshots se mantienen intactos como
        // histórico de cómo se le envió originalmente al cliente.
        if (!q.customerId) {
          q.customerId = dto.customerId;
        }
        await qRepo.save(q);
      }

      // Fase 8.5 — mover el lifecycle del cliente a WON dentro de la
      // MISMA transacción del create. El cliente sale del embudo de
      // seguimiento, se limpia su nextFollowUpAt.
      await this.lifecycle.applySaleConfirmed(
        manager,
        dto.customerId,
        savedSale.id,
        userId,
      );

      return savedSale.id;
    });

    return this.getOne(id);
  }

  // ---------------- cancel ----------------

  async cancel(
    id: string,
    dto: CancelSaleDto,
    userId: string,
  ): Promise<SaleDto> {
    const existing = await this.repo.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!existing) throw new NotFoundException('Venta no encontrada');
    if (existing.status === SaleStatus.CANCELLED) {
      throw new ConflictException('La venta ya está cancelada');
    }

    await this.ds.transaction(async (manager) => {
      // 1. Revertir el stock de cada item (RETURN_IN +qty).
      const items = await manager.getRepository(SaleItem).find({
        where: { saleId: id },
      });
      for (const it of items) {
        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId: existing.warehouseId,
          type: InventoryMovementType.RETURN_IN,
          qty: +it.qty,
          unitCost: it.unitCost,
          reference: existing.number,
          refId: existing.id,
          userId,
        });
      }

      // 2. Anular las transacciones de caja vinculadas (income + comisión
      // si existió). voidTransaction marca isVoided=true y crea la
      // compensación con el monto opuesto.
      const txRepo = manager.getRepository(CashTransaction);
      const cashTxs = await txRepo.find({
        where: {
          source: CashTransactionSource.SALE,
          sourceId: existing.id,
          isVoided: false,
        },
      });
      for (const tx of cashTxs) {
        await this.cashbox.voidTransaction(tx.id, userId, manager);
      }

      // 3. Anular en cascada la guía de despacho activa (si existe). Es
      // raw SQL para evitar un import circular SalesModule ↔ DispatchModule.
      // El motivo queda registrado y la guía pasa a status='VOIDED'.
      await manager.query(
        `UPDATE \`dispatch_notes\`
         SET \`status\` = 'VOIDED',
             \`voidedAt\` = NOW(6),
             \`voidReason\` = ?,
             \`voidedById\` = ?
         WHERE \`saleId\` = ? AND \`status\` = 'ACTIVE'`,
        [`Venta cancelada · ${dto.reason.trim()}`, userId, existing.id],
      );

      // 4. Marcar la venta como CANCELLED con auditoría.
      existing.status = SaleStatus.CANCELLED;
      existing.cancelledAt = new Date();
      existing.cancelReason = dto.reason.trim();
      existing.cancelledById = userId;
      await manager.getRepository(Sale).save(existing);
    });

    return this.getOne(id);
  }

  // ---------------- helpers ----------------

  private async defaultWarehouseId(): Promise<string> {
    // Filtra activas + prefiere "Principal" explícitamente. Ver
    // InventoryService.defaultWarehouseId() para la justificación (Ronda 5/7).
    const rows = await this.warehouseRepo
      .createQueryBuilder('w')
      .where('w.isActive = TRUE')
      .orderBy(`(w.name = 'Principal')`, 'DESC')
      .addOrderBy('w.name', 'ASC')
      .limit(1)
      .getMany();
    const w = rows[0];
    if (!w) {
      throw new NotFoundException(
        'No hay bodegas activas. El seed inicial crea "Principal".',
      );
    }
    return w.id;
  }

  async getSettings(): Promise<CompanySettings> {
    const s = await this.settingsRepo.findOne({ where: {}, order: { id: 'ASC' } });
    if (!s) {
      throw new NotFoundException(
        'CompanySettings no inicializado. Ejecutá db:seed.',
      );
    }
    return s;
  }

  private async fetchItemsForSales(
    saleIds: string[],
  ): Promise<Map<string, SaleItem[]>> {
    const map = new Map<string, SaleItem[]>();
    if (saleIds.length === 0) return map;
    const items = await this.itemRepo.find({
      where: { saleId: In(saleIds) },
      relations: { product: true },
      order: { id: 'ASC' },
    });
    for (const it of items) {
      const arr = map.get(it.saleId) ?? [];
      arr.push(it);
      map.set(it.saleId, arr);
    }
    return map;
  }

  /**
   * Stock disponible en la bodega para los products listados. Lo usa el
   * frontend para mostrar "stock disponible" al armar la venta y bloquear
   * el botón "Confirmar" si excede.
   */
  /**
   * Ronda 12 — KPIs de ventas para el dashboard de `/ventas`. Análogo a
   * `PurchasesService.kpis` pero con dos tablas top:
   *  - Top 5 productos vendidos (por unidades).
   *  - Top 5 clientes (por monto vendido).
   *
   * Excluye SIEMPRE ventas canceladas. Las card "Ventas del día" se
   * calculan sobre el día actual (no sobre el período custom, así el
   * operador puede ver el día corriente aunque el período sea otro).
   */
  async kpis(query: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<SalesKpisDto> {
    // Período pedido (default = mes actual).
    let from: Date;
    let to: Date;
    if (query.dateFrom || query.dateTo) {
      const range = dayRange(query.dateFrom, query.dateTo);
      from = range.from;
      to = range.to;
    } else {
      // Mes actual en hora Chile.
      from = startOfBusinessMonth();
      const ymd = businessTodayStr(); // YYYY-MM-DD
      const [yy, mm] = ymd.split('-').map(Number);
      const lastDay = new Date(Date.UTC(yy!, mm!, 0)).getUTCDate();
      to = endOfBusinessDay(
        `${ymd.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
      );
    }

    // Día actual (independiente del período), en hora Chile.
    const todayStr = businessTodayStr();
    const todayStart = startOfBusinessDay(todayStr);
    const todayEnd = endOfBusinessDay(todayStr);

    // Ventas del período (excluye canceladas).
    const sales = await this.repo.find({
      where: {
        date: Between(from, to),
        status: SaleStatus.PAID,
      },
      select: ['id', 'total', 'customerId', 'date'],
    });
    const count = sales.length;
    const totalAmount = sales.reduce((acc, s) => acc + parseFloat(s.total), 0);
    const averageAmount = count > 0 ? totalAmount / count : 0;

    // Ventas del día actual.
    const todaySales = await this.repo.find({
      where: {
        date: Between(todayStart, todayEnd),
        status: SaleStatus.PAID,
      },
      select: ['id', 'total'],
    });
    const todayAmount = todaySales.reduce(
      (acc, s) => acc + parseFloat(s.total),
      0,
    );

    // Última venta confirmada (cualquier período).
    const last = await this.repo.findOne({
      where: { status: SaleStatus.PAID },
      relations: { customer: true },
      order: { date: 'DESC' },
    });

    // Top 5 productos por unidades vendidas en el período. Usa SaleItem
    // joineado a Sale para filtrar por fecha + status.
    const productRows: Array<{
      productId: string;
      qty: string;
      totalAmount: string;
      sku: string | null;
      name: string;
    }> = await this.itemRepo
      .createQueryBuilder('si')
      .innerJoin('si.sale', 's')
      .innerJoin('si.product', 'p')
      .select('si.productId', 'productId')
      .addSelect('SUM(si.qty)', 'qty')
      .addSelect('SUM(si.subtotal)', 'totalAmount')
      .addSelect('p.sku', 'sku')
      .addSelect('p.name', 'name')
      .where('s.status = :paid', { paid: SaleStatus.PAID })
      .andWhere('s.date BETWEEN :from AND :to', { from, to })
      .groupBy('si.productId')
      .addGroupBy('p.sku')
      .addGroupBy('p.name')
      .orderBy('SUM(si.qty)', 'DESC')
      .limit(5)
      .getRawMany();
    const topProducts: SalesTopProductDto[] = productRows.map((r) => ({
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      qty: Number(r.qty),
      totalAmount: Number(r.totalAmount).toFixed(2),
    }));

    // Top 5 clientes por monto vendido en el período.
    const customerRows: Array<{
      customerId: string;
      salesCount: string;
      totalAmount: string;
      customerName: string;
      customerTaxId: string | null;
    }> = await this.repo
      .createQueryBuilder('s')
      .innerJoin('s.customer', 'c')
      .select('s.customerId', 'customerId')
      .addSelect('COUNT(s.id)', 'salesCount')
      .addSelect('SUM(s.total)', 'totalAmount')
      .addSelect('c.name', 'customerName')
      .addSelect('c.taxId', 'customerTaxId')
      .where('s.status = :paid', { paid: SaleStatus.PAID })
      .andWhere('s.date BETWEEN :from AND :to', { from, to })
      .groupBy('s.customerId')
      .addGroupBy('c.name')
      .addGroupBy('c.taxId')
      .orderBy('SUM(s.total)', 'DESC')
      .limit(5)
      .getRawMany();
    const topCustomers: SalesTopCustomerDto[] = customerRows.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      customerTaxId: r.customerTaxId,
      salesCount: Number(r.salesCount),
      totalAmount: Number(r.totalAmount).toFixed(2),
    }));

    return {
      totalAmount: totalAmount.toFixed(2),
      count,
      averageAmount: averageAmount.toFixed(2),
      todayAmount: todayAmount.toFixed(2),
      todayCount: todaySales.length,
      lastSale: last
        ? {
            id: last.id,
            number: last.number,
            date: last.date.toISOString(),
            total: last.total,
            customerName: last.customer?.name ?? '',
          }
        : null,
      topProducts,
      topCustomers,
      periodFrom: from.toISOString(),
      periodTo: to.toISOString(),
    };
  }

  async availableStock(
    productIds: string[],
    warehouseId?: string,
    aggregate?: boolean,
  ): Promise<Array<{ productId: string; warehouseId: string; quantity: number }>> {
    if (productIds.length === 0) return [];

    // Ronda 7 — modo aggregate: suma stock de TODAS las bodegas activas. Usado
    // por el QuotationForm porque las cotizaciones no se atan a una bodega
    // específica; la conversión a venta es la que elige bodega. Mostrar el
    // stock global le permite al operador decidir antes de cotizar si hay
    // unidades en el sistema sin importar dónde.
    if (aggregate) {
      const rows = await this.ds
        .getRepository(Stock)
        .createQueryBuilder('s')
        .select('s.productId', 'productId')
        .addSelect('SUM(s.quantity)', 'quantity')
        .where('s.productId IN (:...ids)', { ids: productIds })
        .groupBy('s.productId')
        .getRawMany<{ productId: string; quantity: string }>();
      const byId = new Map(rows.map((r) => [r.productId, Number(r.quantity)]));
      return productIds.map((pid) => ({
        productId: pid,
        warehouseId: 'aggregate',
        quantity: byId.get(pid) ?? 0,
      }));
    }

    const wid = warehouseId ?? (await this.defaultWarehouseId());
    const rows = await this.ds.getRepository(Stock).find({
      where: { productId: In(productIds), warehouseId: wid },
    });
    const byId = new Map(rows.map((r) => [r.productId, r.quantity]));
    return productIds.map((pid) => ({
      productId: pid,
      warehouseId: wid,
      quantity: byId.get(pid) ?? 0,
    }));
  }

  private toDto(s: Sale, items: SaleItem[]): SaleDto {
    return {
      id: s.id,
      number: s.number,
      customerId: s.customerId,
      customer: s.customer
        ? {
            id: s.customer.id,
            name: s.customer.name,
            isDraft: s.customer.isDraft,
            taxId: s.customer.taxId,
            email: s.customer.email,
            phone: s.customer.phone,
            addressStreet: s.customer.addressStreet,
            addressNumber: s.customer.addressNumber,
            communeId: s.customer.communeId,
            internalNotes: s.customer.internalNotes,
            source: s.customer.source,
            whatsappPhone: s.customer.whatsappPhone,
            lifecycleStatus: s.customer.lifecycleStatus,
            lastContactAt: s.customer.lastContactAt
              ? s.customer.lastContactAt.toISOString()
              : null,
            nextFollowUpAt: s.customer.nextFollowUpAt
              ? s.customer.nextFollowUpAt.toISOString()
              : null,
            lostReason: s.customer.lostReason,
            hubspotContactId: s.customer.hubspotContactId,
          }
        : undefined,
      warehouseId: s.warehouseId,
      warehouse: s.warehouse
        ? { id: s.warehouse.id, name: s.warehouse.name }
        : undefined,
      date: s.date.toISOString(),
      subtotal: s.subtotal,
      taxAmount: s.taxAmount,
      commissionAmount: s.commissionAmount,
      total: s.total,
      paymentMethod: s.paymentMethod,
      status: s.status,
      notes: s.notes,
      quotationId: s.quotationId,
      quotation: s.quotation
        ? { id: s.quotation.id, number: s.quotation.number }
        : null,
      cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
      cancelReason: s.cancelReason,
      cancelledBy: s.cancelledBy
        ? {
            id: s.cancelledBy.id,
            name: s.cancelledBy.name,
            email: s.cancelledBy.email,
          }
        : null,
      user: s.user
        ? { id: s.user.id, name: s.user.name, email: s.user.email }
        : undefined,
      items: items.map(
        (it): SaleItemDto => ({
          id: it.id,
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discount: it.discount,
          discountPercent: it.discountPercent,
          subtotal: it.subtotal,
          unitCost: it.unitCost,
          product: it.product
            ? {
                id: it.product.id,
                sku: it.product.sku,
                name: it.product.name,
                partNumber: it.product.partNumber,
              }
            : undefined,
        }),
      ),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}

// ---------------- pure helpers ----------------

/** Etiqueta legible para descripciones de transacciones de caja. */
export function labelForPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case PaymentMethod.CASH:
      return 'efectivo';
    case PaymentMethod.TRANSFER:
      return 'transferencia';
    case PaymentMethod.CARD_DEBIT:
      return 'débito';
    case PaymentMethod.CARD_CREDIT:
      return 'crédito';
    case PaymentMethod.PAYMENT_LINK:
      return 'link de pago';
    default:
      return method;
  }
}

/**
 * Ronda 9 — devuelve la tasa de comisión configurada en CompanySettings
 * según el método de pago. CASH/TRANSFER no pagan comisión (devuelve 0).
 */
export function commissionRateFor(
  method: PaymentMethod,
  settings: {
    cardCommissionRate: string;
    cardDebitCommissionRate: string;
    cardCreditCommissionRate: string;
    paymentLinkCommissionRate: string;
  },
): number {
  switch (method) {
    case PaymentMethod.CARD_DEBIT:
      return parseFloat(settings.cardDebitCommissionRate);
    case PaymentMethod.CARD_CREDIT:
      return parseFloat(settings.cardCreditCommissionRate);
    case PaymentMethod.PAYMENT_LINK:
      return parseFloat(settings.paymentLinkCommissionRate);
    default:
      return 0;
  }
}

function roundHalfUp(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return (Math.sign(n) * Math.round(Math.abs(n) * factor)) / factor;
}

function fmt2(n: number): string {
  return roundHalfUp(n).toFixed(2);
}

interface LineTotals {
  lineGross: string;
  discountAmount: string;
}

interface SaleTotals {
  subtotal: string;
  taxAmount: string;
  total: string;
  lines: LineTotals[];
}

/**
 * Misma lógica que `computeTotals` de quotations: descompone bruto → neto + IVA.
 * Replicado acá para evitar acoplamiento entre módulos. Si se duplica más,
 * extraer a un helper compartido.
 */
function computeSaleTotals(
  items: { qty: number; unitPrice: string; discount?: string; discountPercent?: string | null }[],
  taxRate: number,
): SaleTotals {
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
