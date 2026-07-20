import { SaleDraftDto, SaleDraftItemDto } from '@inventory/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { computeDocumentTotals } from '../common/document-totals';
import {
  CompanySettings,
  SaleDraft,
  SaleDraftItem,
} from '../database/entities';
import { SaveSaleDraftDto } from './dto';

/**
 * Ventas "parkeadas": el operador deja una venta a medias y la retoma después.
 *
 * Deliberadamente NO reusa nada del create de ventas: un borrador no descuenta
 * stock, no registra caja, no congela costos, no consume correlativo y no
 * marca cotizaciones como convertidas. Todo eso pasa recién al confirmar.
 *
 * Los borradores son del negocio, no del vendedor: `list` devuelve todos y
 * cualquiera puede retomar o descartar uno. `userId`/`updatedById` son
 * autoría, no permiso.
 */
@Injectable()
export class SaleDraftsService {
  constructor(
    @InjectRepository(SaleDraft)
    private readonly repo: Repository<SaleDraft>,
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async list(): Promise<SaleDraftDto[]> {
    const drafts = await this.repo.find({
      relations: { customer: true, warehouse: true, user: true, updatedBy: true },
      order: { updatedAt: 'DESC' },
    });
    // El listado no necesita los ítems (solo el total, que ya está guardado).
    return drafts.map((d) => this.toDto(d));
  }

  async getOne(id: string): Promise<SaleDraftDto> {
    const draft = await this.repo.findOne({
      where: { id },
      relations: {
        customer: true,
        warehouse: true,
        user: true,
        updatedBy: true,
        items: { product: true },
      },
    });
    if (!draft) throw new NotFoundException('Borrador no encontrado');
    return this.toDto(draft);
  }

  async create(dto: SaveSaleDraftDto, userId: string): Promise<SaleDraftDto> {
    const total = await this.estimateTotal(dto);

    const id = await this.ds.transaction(async (manager) => {
      const draft = manager.getRepository(SaleDraft).create({
        ...this.headerFields(dto, false),
        total,
        userId,
        updatedById: userId,
      });
      const saved = await manager.getRepository(SaleDraft).save(draft);
      await this.replaceItems(manager, saved.id, dto);
      return saved.id;
    });

    return this.getOne(id);
  }

  async update(
    id: string,
    dto: SaveSaleDraftDto,
    userId: string,
  ): Promise<SaleDraftDto> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Borrador no encontrado');

    const total = await this.estimateTotal(dto);

    await this.ds.transaction(async (manager) => {
      await manager.getRepository(SaleDraft).update(id, {
        ...this.headerFields(dto, true),
        total,
        updatedById: userId,
      });
      // Reemplazo completo, igual que en cotizaciones: es más simple y seguro
      // que hacer diff de líneas, y el volumen por borrador es chico.
      await manager.getRepository(SaleDraftItem).delete({ draftId: id });
      await this.replaceItems(manager, id, dto);
    });

    return this.getOne(id);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Borrador no encontrado');
    // Las líneas se van por FK ON DELETE CASCADE.
    await this.repo.delete(id);
  }

  /**
   * Borra el borrador dentro de la transacción de la venta que lo confirma.
   * Silencioso si ya no existe: que el borrador haya desaparecido no puede
   * hacer fallar una venta que ya se registró.
   */
  async removeWithinTransaction(
    manager: EntityManager,
    id: string,
  ): Promise<void> {
    await manager.getRepository(SaleDraft).delete(id);
  }

  /**
   * Campos de cabecera a escribir.
   *
   * En `create` se aplican todos (con sus defaults). En `update` la semántica
   * es PARCIAL de verdad: solo se tocan las claves que vinieron en el body, y
   * `undefined` significa "no lo cambies". Mandar `null` explícito sí limpia
   * el campo. Sin esto, un PATCH que no repitiera `label` lo borraba — que es
   * justo lo que uno NO espera de un PATCH.
   */
  private headerFields(dto: SaveSaleDraftDto, partial: boolean) {
    const all = {
      label: dto.label?.trim() || null,
      customerId: dto.customerId ?? null,
      warehouseId: dto.warehouseId ?? null,
      paymentMethod: dto.paymentMethod ?? null,
      vatExempt: dto.vatExempt ?? false,
      notes: dto.notes?.trim() || null,
      discount: dto.discount ?? '0',
      discountPercent: dto.discountPercent ?? null,
      quotationId: dto.quotationId ?? null,
      dispatchNoteId: dto.dispatchNoteId ?? null,
    };
    if (!partial) return all;

    const present: Partial<typeof all> = {};
    for (const key of Object.keys(all) as (keyof typeof all)[]) {
      if (dto[key as keyof SaveSaleDraftDto] !== undefined) {
        present[key] = all[key] as never;
      }
    }
    return present;
  }

  private async replaceItems(
    manager: EntityManager,
    draftId: string,
    dto: SaveSaleDraftDto,
  ): Promise<void> {
    for (let i = 0; i < dto.items.length; i++) {
      const it = dto.items[i]!;
      const item = manager.getRepository(SaleDraftItem).create({
        draftId,
        productId: it.productId,
        qty: it.qty,
        unitPrice: it.unitPrice,
        discount: it.discount ?? '0',
        discountPercent: it.discountPercent ?? null,
        observation: it.observation?.trim() || null,
        sortOrder: i,
      });
      await manager.getRepository(SaleDraftItem).save(item);
    }
  }

  /**
   * Total bruto estimado, solo para mostrarlo en el listado sin tener que
   * cargar los ítems. La venta real se recalcula entera al confirmar, así que
   * si acá quedara desactualizado no afecta a ninguna cifra contable.
   */
  private async estimateTotal(dto: SaveSaleDraftDto): Promise<string> {
    const settings = await this.settingsRepo.find({ take: 1 });
    const taxRate = settings[0] ? parseFloat(settings[0].taxRate) : 0.19;
    const effectiveTaxRate = dto.vatExempt ? 0 : taxRate;

    const totals = computeDocumentTotals(dto.items, effectiveTaxRate, {
      amount: dto.discount,
      percent: dto.discountPercent,
    });
    return totals.total;
  }

  private toDto(d: SaleDraft): SaleDraftDto {
    return {
      id: d.id,
      label: d.label,
      customerId: d.customerId,
      customer: d.customer
        ? { id: d.customer.id, name: d.customer.name, taxId: d.customer.taxId }
        : null,
      warehouseId: d.warehouseId,
      warehouse: d.warehouse
        ? { id: d.warehouse.id, name: d.warehouse.name }
        : null,
      paymentMethod: d.paymentMethod,
      vatExempt: d.vatExempt,
      notes: d.notes,
      discount: d.discount,
      discountPercent: d.discountPercent,
      total: d.total,
      quotationId: d.quotationId,
      dispatchNoteId: d.dispatchNoteId,
      user: d.user
        ? { id: d.user.id, name: d.user.name, email: d.user.email }
        : undefined,
      updatedBy: d.updatedBy
        ? {
            id: d.updatedBy.id,
            name: d.updatedBy.name,
            email: d.updatedBy.email,
          }
        : null,
      items: d.items
        ? [...d.items]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((it): SaleDraftItemDto => ({
              id: it.id,
              productId: it.productId,
              qty: it.qty,
              unitPrice: it.unitPrice,
              discount: it.discount,
              discountPercent: it.discountPercent,
              observation: it.observation,
              product: it.product
                ? {
                    id: it.product.id,
                    sku: it.product.sku,
                    name: it.product.name,
                    partNumber: it.product.partNumber,
                  }
                : undefined,
            }))
        : undefined,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
