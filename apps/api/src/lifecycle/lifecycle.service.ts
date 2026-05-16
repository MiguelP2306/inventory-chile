import {
  HubspotSyncJobStatus,
  LeadEventType,
  LifecycleStatus,
  QuotationStatus,
} from '@inventory/shared';
import type {
  FollowUpListDto,
  FollowUpRowDto,
} from '@inventory/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import {
  CompanySettings,
  Customer,
  HubspotSyncJob,
  LeadEvent,
} from '../database/entities';
import { FollowUpQueryDto } from './dto';

/**
 * Servicio del lifecycle comercial (Fase 8.5). Único punto de mutación de
 * `Customer.lifecycleStatus`, `lastContactAt` y `nextFollowUpAt`. Cada
 * cambio inserta un `LeadEvent` (auditoría) y un `HubspotSyncJob`
 * (outbox para sync async).
 *
 * Convenciones de hooks:
 *
 *  - `applyQuotationCreated(manager, customerId, ...)` — disparado por
 *    `QuotationsService.create()` dentro de la MISMA transacción del create.
 *    No-op si `customerId` es null (cotización con cliente libre — el lead
 *    aún no existe en el catálogo, el operador puede registrarlo después).
 *
 *  - `applyQuotationSent(manager, customerId, ...)` — disparado por
 *    `QuotationsService.markSent()` para reagendar el follow-up tras el
 *    envío real del mensaje.
 *
 *  - `applySaleConfirmed(manager, customerId, ...)` — disparado por
 *    `SalesService.create()` dentro de la transacción de la venta. Cierra
 *    el ciclo del lead con WON y limpia `nextFollowUpAt`.
 *
 *  - `touch(customerId)` — endpoint manual "Marcar contacto" desde la
 *    bandeja. Si el cliente estaba en FOLLOW_UP, vuelve a QUOTED.
 *
 *  - `markLost(customerId, reason)` — endpoint manual "Marcar perdido".
 *    Único cambio manual de lifecycle permitido (excepto touch que es
 *    movimiento de timestamp).
 *
 *  - `markFollowUp(customerId)` — usado por el cron diario para mover los
 *    QUOTED vencidos a FOLLOW_UP.
 *
 * El sync a HubSpot es async vía outbox: cada hook que cambia algo relevante
 * inserta un `HubspotSyncJob(status=PENDING)`. El cron interno de HubSpot
 * procesa la outbox cada minuto.
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(LeadEvent)
    private readonly leadEvents: Repository<LeadEvent>,
    @InjectRepository(HubspotSyncJob)
    private readonly syncJobs: Repository<HubspotSyncJob>,
    @InjectRepository(CompanySettings)
    private readonly settingsRepo: Repository<CompanySettings>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // ---------- Hooks invocados desde otros services ----------

  async applyQuotationCreated(
    manager: EntityManager,
    customerId: string | null,
    quotationId: string,
    userId: string | null,
  ): Promise<void> {
    if (!customerId) return; // cotización con cliente libre
    const followUpHours = await this.followUpHours(manager);
    const now = new Date();
    const next = addHours(now, followUpHours);
    await manager.update(
      Customer,
      { id: customerId },
      {
        lifecycleStatus: LifecycleStatus.QUOTED,
        lastContactAt: now,
        nextFollowUpAt: next,
      },
    );
    await this.insertEvent(manager, {
      customerId,
      type: LeadEventType.QUOTATION_CREATED,
      refType: 'quotation',
      refId: quotationId,
      userId,
    });
    await this.enqueueHubspotSync(manager, customerId, now);
  }

  async applyQuotationSent(
    manager: EntityManager,
    customerId: string | null,
    quotationId: string,
    userId: string | null,
  ): Promise<void> {
    if (!customerId) return;
    const followUpHours = await this.followUpHours(manager);
    const now = new Date();
    const next = addHours(now, followUpHours);
    await manager.update(
      Customer,
      { id: customerId },
      {
        lastContactAt: now,
        nextFollowUpAt: next,
      },
    );
    await this.insertEvent(manager, {
      customerId,
      type: LeadEventType.QUOTATION_SENT,
      refType: 'quotation',
      refId: quotationId,
      userId,
    });
    await this.enqueueHubspotSync(manager, customerId, now);
  }

  async applySaleConfirmed(
    manager: EntityManager,
    customerId: string,
    saleId: string,
    userId: string | null,
  ): Promise<void> {
    const now = new Date();
    await manager.update(
      Customer,
      { id: customerId },
      {
        lifecycleStatus: LifecycleStatus.WON,
        lastContactAt: now,
        nextFollowUpAt: null,
        // Si estaba como LOST y vuelve a comprar, limpiamos el motivo.
        lostReason: null,
      },
    );
    await this.insertEvent(manager, {
      customerId,
      type: LeadEventType.SALE_CONFIRMED,
      refType: 'sale',
      refId: saleId,
      userId,
    });
    await this.enqueueHubspotSync(manager, customerId, now);
  }

  // ---------- Endpoints manuales ----------

  /** Marca contacto manual desde la bandeja `/seguimiento`. */
  async touch(customerId: string, userId: string | null): Promise<Customer> {
    return this.ds.transaction(async (manager) => {
      const c = await manager.findOne(Customer, { where: { id: customerId } });
      if (!c) throw new NotFoundException('Cliente no encontrado');
      const followUpHours = await this.followUpHours(manager);
      const now = new Date();
      const next = addHours(now, followUpHours);
      // Si estaba en FOLLOW_UP, volvemos a QUOTED (el operador retomó
      // contacto). Si estaba en NEW, lo subimos a QUOTED también — la
      // ÚNICA forma de tocar un NEW es desde la bandeja con cotización
      // existente, así que tiene sentido el upgrade.
      const next_status =
        c.lifecycleStatus === LifecycleStatus.FOLLOW_UP ||
        c.lifecycleStatus === LifecycleStatus.NEW
          ? LifecycleStatus.QUOTED
          : c.lifecycleStatus;
      await manager.update(
        Customer,
        { id: customerId },
        {
          lifecycleStatus: next_status,
          lastContactAt: now,
          nextFollowUpAt: next,
        },
      );
      await this.insertEvent(manager, {
        customerId,
        type: LeadEventType.MANUAL_CONTACT,
        refType: null,
        refId: null,
        userId,
      });
      await this.enqueueHubspotSync(manager, customerId, now);
      const refreshed = await manager.findOne(Customer, {
        where: { id: customerId },
      });
      return refreshed!;
    });
  }

  async markLost(
    customerId: string,
    reason: string,
    userId: string | null,
  ): Promise<Customer> {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException(
        'El motivo debe tener al menos 5 caracteres',
      );
    }
    return this.ds.transaction(async (manager) => {
      const c = await manager.findOne(Customer, { where: { id: customerId } });
      if (!c) throw new NotFoundException('Cliente no encontrado');
      const now = new Date();
      await manager.update(
        Customer,
        { id: customerId },
        {
          lifecycleStatus: LifecycleStatus.LOST,
          lostReason: trimmed,
          nextFollowUpAt: null,
        },
      );
      await this.insertEvent(manager, {
        customerId,
        type: LeadEventType.LOST_MARKED,
        refType: null,
        refId: null,
        userId,
      });
      await this.enqueueHubspotSync(manager, customerId, now);
      const refreshed = await manager.findOne(Customer, {
        where: { id: customerId },
      });
      return refreshed!;
    });
  }

  // ---------- Cron diario ----------

  /**
   * Marca como FOLLOW_UP a los clientes con `nextFollowUpAt < now` y
   * `lifecycleStatus = QUOTED`. Devuelve cuántos se movieron. Idempotente:
   * los que ya estaban en FOLLOW_UP se ignoran.
   */
  async markOverdueAsFollowUp(): Promise<number> {
    return this.ds.transaction(async (manager) => {
      const now = new Date();
      const overdue = await manager
        .createQueryBuilder(Customer, 'c')
        .where('c.lifecycleStatus = :status', {
          status: LifecycleStatus.QUOTED,
        })
        .andWhere('c.nextFollowUpAt IS NOT NULL')
        .andWhere('c.nextFollowUpAt < :now', { now })
        .getMany();

      for (const c of overdue) {
        await manager.update(
          Customer,
          { id: c.id },
          { lifecycleStatus: LifecycleStatus.FOLLOW_UP },
        );
        await this.insertEvent(manager, {
          customerId: c.id,
          type: LeadEventType.FOLLOW_UP_TRIGGERED,
          refType: null,
          refId: null,
          userId: null,
        });
        await this.enqueueHubspotSync(manager, c.id, now);
      }
      if (overdue.length > 0) {
        this.logger.log(
          `Lifecycle cron: ${overdue.length} clientes movidos a FOLLOW_UP`,
        );
      }
      return overdue.length;
    });
  }

  // ---------- Bandeja /seguimiento ----------

  /**
   * Lista de seguimiento por tab. Los 4 tabs comparten estructura — solo
   * varían los WHERE y ORDER:
   *
   *   - pendientes:  status IN (QUOTED, FOLLOW_UP) AND nextFollowUpAt > NOW
   *   - sin-respuesta: status = QUOTED AND lastContactAt < NOW - 24h AND nextFollowUpAt > NOW
   *   - vencidos:    status = FOLLOW_UP
   *   - ultimo-contacto: status IN (QUOTED, FOLLOW_UP) (sin filtro de fechas, orden por lastContactAt DESC)
   */
  async list(query: FollowUpQueryDto): Promise<FollowUpListDto> {
    const tab = query.tab ?? 'pendientes';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();

    const qb = this.customers
      .createQueryBuilder('c')
      .where('c.lifecycleStatus IN (:...statuses)', {
        statuses: [LifecycleStatus.QUOTED, LifecycleStatus.FOLLOW_UP],
      });

    if (tab === 'pendientes') {
      qb.andWhere('c.nextFollowUpAt IS NOT NULL').andWhere(
        'c.nextFollowUpAt > :now',
        { now },
      );
      qb.orderBy('c.nextFollowUpAt', 'ASC');
    } else if (tab === 'sin-respuesta') {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      qb.andWhere('c.lifecycleStatus = :st', { st: LifecycleStatus.QUOTED })
        .andWhere('c.lastContactAt < :cutoff', { cutoff })
        .andWhere('c.nextFollowUpAt > :now', { now });
      qb.orderBy('c.lastContactAt', 'ASC');
    } else if (tab === 'vencidos') {
      qb.andWhere('c.lifecycleStatus = :st', {
        st: LifecycleStatus.FOLLOW_UP,
      });
      qb.orderBy('c.nextFollowUpAt', 'ASC');
    } else {
      // ultimo-contacto: ordenar por lastContactAt DESC
      qb.orderBy('c.lastContactAt', 'DESC');
    }

    if (query.q) {
      const search = `%${query.q}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('c.name LIKE :s', { s: search })
            .orWhere('c.taxId LIKE :s', { s: search })
            .orWhere('c.email LIKE :s', { s: search })
            .orWhere('c.phone LIKE :s', { s: search })
            .orWhere('c.whatsappPhone LIKE :s', { s: search });
        }),
      );
    }

    qb.take(pageSize).skip((page - 1) * pageSize);
    const [customers, total] = await qb.getManyAndCount();

    // Hidratamos la última cotización abierta de cada cliente en 1 sola
    // query. Si no tiene cotizaciones abiertas, queda null.
    const customerIds = customers.map((c) => c.id);
    const latestQuotations = customerIds.length
      ? await this.ds
          .createQueryBuilder()
          .select([
            'q.customerId AS customerId',
            'q.id AS id',
            'q.number AS number',
            'q.total AS total',
            'q.publicToken AS publicToken',
          ])
          .from('quotations', 'q')
          .where('q.customerId IN (:...ids)', { ids: customerIds })
          .andWhere('q.status IN (:...openStatuses)', {
            openStatuses: [
              QuotationStatus.DRAFT,
              QuotationStatus.SENT,
              QuotationStatus.APPROVED,
            ],
          })
          .orderBy('q.createdAt', 'DESC')
          .getRawMany()
      : ([] as Array<{
          customerId: string;
          id: string;
          number: string;
          total: string;
          publicToken: string;
        }>);

    const latestByCustomer = new Map<
      string,
      { id: string; number: string; total: string; publicToken: string }
    >();
    for (const row of latestQuotations) {
      if (!latestByCustomer.has(row.customerId)) {
        latestByCustomer.set(row.customerId, {
          id: row.id,
          number: row.number,
          total: row.total,
          publicToken: row.publicToken,
        });
      }
    }

    const items: FollowUpRowDto[] = customers.map((c) => ({
      customerId: c.id,
      customerName: c.name,
      customerTaxId: c.taxId,
      whatsappPhone: c.whatsappPhone,
      phone: c.phone,
      email: c.email,
      lifecycleStatus: c.lifecycleStatus,
      lastContactAt: c.lastContactAt?.toISOString() ?? null,
      nextFollowUpAt: c.nextFollowUpAt?.toISOString() ?? null,
      latestQuotation: latestByCustomer.get(c.id) ?? null,
    }));

    return { items, total, page, pageSize };
  }

  // ---------- helpers privados ----------

  private async followUpHours(manager: EntityManager): Promise<number> {
    const settings = await manager.find(CompanySettings, { take: 1 });
    return settings[0]?.followUpHoursDefault ?? 48;
  }

  private async insertEvent(
    manager: EntityManager,
    input: {
      customerId: string;
      type: LeadEventType;
      refType: string | null;
      refId: string | null;
      userId: string | null;
    },
  ): Promise<void> {
    const event = manager.create(LeadEvent, input);
    await manager.save(event);
  }

  private async enqueueHubspotSync(
    manager: EntityManager,
    customerId: string,
    scheduledAt: Date,
  ): Promise<void> {
    const job = manager.create(HubspotSyncJob, {
      customerId,
      status: HubspotSyncJobStatus.PENDING,
      attempts: 0,
      scheduledAt,
    });
    await manager.save(job);
  }
}

function addHours(date: Date, hours: number): Date {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}
