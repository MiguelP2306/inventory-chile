import {
  CashTransactionSource,
  CashTransactionType,
  InventoryMovementType,
  PaymentMethod,
} from '@inventory/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CashboxService } from '../cashbox/cashbox.service';
import { dayRange } from '../common/date-range';
import { InventoryService } from '../inventory/inventory.service';
import {
  CompanySettings,
  PurchaseEntry,
  PurchaseEntryItem,
  PurchaseInvoice,
  Supplier,
  Warehouse,
} from '../database/entities';
import {
  CreatePurchaseEntryDto,
  ListPurchasesQueryDto,
} from './dto';

export interface InvoiceFileInput {
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseEntry)
    private readonly entries: Repository<PurchaseEntry>,
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectRepository(Warehouse)
    private readonly warehouses: Repository<Warehouse>,
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectRepository(PurchaseInvoice)
    private readonly invoiceRepo: Repository<PurchaseInvoice>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventory: InventoryService,
    private readonly cashbox: CashboxService,
  ) {}

  async list(query: ListPurchasesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    // QueryBuilder en lugar de findAndCount para soportar filtros de
    // rango (totalMin/totalMax) sobre el campo decimal. Mantenemos joins
    // con supplier/user/warehouse y `invoices` (lo usa el detalle, y para
    // mostrar el icono "tiene factura" en el listado).
    const qb = this.entries
      .createQueryBuilder('pe')
      .leftJoinAndSelect('pe.supplier', 'supplier')
      .leftJoinAndSelect('pe.user', 'user')
      .leftJoinAndSelect('pe.warehouse', 'warehouse')
      .leftJoinAndSelect('pe.invoices', 'invoices');

    if (query.supplierId)
      qb.andWhere('pe.supplierId = :sid', { sid: query.supplierId });
    if (query.warehouseId)
      qb.andWhere('pe.warehouseId = :wid', { wid: query.warehouseId });
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('pe.date BETWEEN :from AND :to', { from, to });
    }
    if (query.totalMin !== undefined && query.totalMin !== '') {
      qb.andWhere('pe.total >= :tmin', { tmin: query.totalMin });
    }
    if (query.totalMax !== undefined && query.totalMax !== '') {
      qb.andWhere('pe.total <= :tmax', { tmax: query.totalMax });
    }

    qb.orderBy('pe.date', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async getOne(id: string) {
    const entry = await this.entries.findOne({
      where: { id },
      relations: {
        supplier: true,
        user: true,
        warehouse: true,
        items: { product: true },
        invoices: true,
      },
    });
    if (!entry) throw new NotFoundException('Compra no encontrada');
    return entry;
  }

  /**
   * Crea PurchaseEntry + items + movimientos de inventario PURCHASE_IN +
   * transacción de caja (EXPENSE, source=PURCHASE) + 0..N facturas en
   * una transacción atómica.
   *
   * IVA: los `unitCost` que llegan son BRUTO (incluyen IVA, igual que `product.cost`).
   * - `total` = suma de los items.
   * - `taxAmount` = `total - total / (1 + taxRate)` (auto), o sobreescrito por
   *   el operador si la factura tiene un redondeo distinto.
   * - `subtotal` = `total - taxAmount`.
   *
   * Multi-factura (Ronda 7): `dto.invoiceUrls` son las URLs relativas
   * devueltas por POST /uploads/purchase-invoice (puede ser una sola call
   * por archivo). Por cada URL se inserta una fila en `purchase_invoices`.
   * Los metadatos (originalName, mimeType, size) acá quedan derivados de la
   * URL — los reales se conservan cuando el frontend usa el endpoint
   * dedicado `POST /purchases/:id/invoices` con multipart.
   *
   * Si falla cualquier paso, rollbackea todo.
   */
  async create(dto: CreatePurchaseEntryDto, userId: string) {
    const supplier = await this.suppliers.findOne({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const warehouseId =
      dto.warehouseId ?? (await this.firstWarehouseId());

    const settings = await this.settingsRepo.find({ take: 1 });
    const taxRate = settings[0]?.taxRate ?? '0.19';

    const entryId = await this.dataSource.transaction(async (manager) => {
      const total = dto.items
        .reduce((acc, it) => acc + Number(it.unitCost) * it.qty, 0)
        .toFixed(2);

      const totalNum = Number(total);
      const rate = Number(taxRate);
      const autoTax = totalNum - totalNum / (1 + rate);
      const taxAmount = (
        dto.taxAmountOverride !== undefined
          ? Number(dto.taxAmountOverride)
          : autoTax
      ).toFixed(2);
      const subtotal = (totalNum - Number(taxAmount)).toFixed(2);

      const entry = manager.create(PurchaseEntry, {
        supplierId: dto.supplierId,
        warehouseId,
        date: dto.date ? new Date(dto.date) : new Date(),
        total,
        subtotal,
        taxAmount,
        notes: dto.notes ?? null,
        userId,
      });
      await manager.save(entry);

      for (const it of dto.items) {
        const itemSubtotal = (Number(it.unitCost) * it.qty).toFixed(2);
        const item = manager.create(PurchaseEntryItem, {
          entryId: entry.id,
          productId: it.productId,
          qty: it.qty,
          unitCost: it.unitCost,
          subtotal: itemSubtotal,
        });
        await manager.save(item);

        await this.inventory.applyMovement(manager, {
          productId: it.productId,
          warehouseId,
          type: InventoryMovementType.PURCHASE_IN,
          qty: it.qty,
          unitCost: it.unitCost,
          reference: 'PurchaseEntry',
          refId: entry.id,
          userId,
        });
      }

      // Facturas (Ronda 7) — si el frontend ya subió archivos antes de
      // confirmar la compra, los URLs llegan acá y los persistimos como
      // rows en `purchase_invoices`.
      if (dto.invoiceUrls && dto.invoiceUrls.length > 0) {
        for (const url of dto.invoiceUrls) {
          const inv = manager.create(PurchaseInvoice, {
            purchaseEntryId: entry.id,
            url,
            filename: deriveFilenameFromUrl(url),
            originalName: deriveFilenameFromUrl(url),
            mimeType: deriveMimeFromUrl(url),
            size: 0,
          });
          await manager.save(inv);
        }
      }

      // Egreso de caja por el TOTAL bruto. El IVA queda registrado en la
      // compra (no se duplica en caja) — se usa para el reporte de IVA crédito.
      await this.cashbox.recordTransaction(
        {
          date: entry.date,
          type: CashTransactionType.EXPENSE,
          source: CashTransactionSource.PURCHASE,
          sourceId: entry.id,
          description: `Compra a ${supplier.name}`,
          amount: total,
          // Default a TRANSFER (lo más usual con proveedores). Próximamente:
          // hacer el método configurable en el formulario de compra.
          paymentMethod: PaymentMethod.TRANSFER,
          expenseCategoryId: null,
          userId,
        },
        manager,
      );

      return entry.id;
    });

    return this.getOne(entryId);
  }

  /**
   * Agrega archivos de factura a una compra existente (Ronda 7). El frontend
   * llama POST /uploads/purchase-invoice por cada archivo y después POST
   * /purchases/:id/invoices con la lista de metadatos.
   */
  async addInvoices(
    purchaseId: string,
    files: InvoiceFileInput[],
  ): Promise<PurchaseInvoice[]> {
    if (!files.length) {
      throw new BadRequestException('Debe enviarse al menos 1 archivo.');
    }
    const entry = await this.entries.findOne({ where: { id: purchaseId } });
    if (!entry) throw new NotFoundException('Compra no encontrada');

    const created: PurchaseInvoice[] = [];
    for (const f of files) {
      const inv = this.invoiceRepo.create({
        purchaseEntryId: purchaseId,
        url: f.url,
        filename: f.filename,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
      });
      await this.invoiceRepo.save(inv);
      created.push(inv);
    }
    return created;
  }

  async removeInvoice(purchaseId: string, invoiceId: string): Promise<void> {
    const inv = await this.invoiceRepo.findOne({
      where: { id: invoiceId, purchaseEntryId: purchaseId },
    });
    if (!inv) throw new NotFoundException('Archivo no encontrado en esta compra.');
    await this.invoiceRepo.delete({ id: inv.id });
  }

  /**
   * Bodega por defecto cuando el DTO no especifica una. Filtramos activas y
   * preferimos "Principal" explícitamente — antes el orden alfabético hacía
   * que "Mercado Libre Full" ganara contra "Principal" y las compras
   * quedaban en la bodega equivocada (bug reportado en Ronda 5 + Ronda 7).
   */
  private async firstWarehouseId(): Promise<string> {
    const rows = await this.warehouses
      .createQueryBuilder('w')
      .where('w.isActive = TRUE')
      .orderBy(`(w.name = 'Principal')`, 'DESC')
      .addOrderBy('w.name', 'ASC')
      .limit(1)
      .getMany();
    const w = rows[0];
    if (!w) {
      throw new NotFoundException(
        'No hay ningún almacén activo configurado.',
      );
    }
    return w.id;
  }
}

function deriveFilenameFromUrl(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] ?? url;
}

function deriveMimeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}
