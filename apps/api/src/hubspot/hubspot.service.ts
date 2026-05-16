import { HubspotSyncJobStatus, LifecycleStatus } from '@inventory/shared';
import type { HubspotTestResultDto } from '@inventory/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import {
  CompanySettings,
  Customer,
  HubspotSyncJob,
} from '../database/entities';

const MAX_ATTEMPTS = 3;

/**
 * Cliente HubSpot vía outbox (Fase 8.5).
 *
 * Diseño:
 *   - Cada cambio relevante en el lifecycle inserta una fila en
 *     `hubspot_sync_jobs` con `status = PENDING`.
 *   - Un cron interno (`scheduleSyncSweep` cada 1 min) levanta los pendientes
 *     uno a uno y los procesa.
 *   - Idempotente: el worker NO depende del payload del job, lee el estado
 *     actual del cliente y empuja eso. Si llegan 3 jobs antes de procesar el
 *     primero, los 3 convergen al mismo resultado en HubSpot.
 *   - Si `companySettings.hubspotEnabled = false` o falta `HUBSPOT_API_KEY`,
 *     todos los jobs se marcan como SKIPPED silenciosamente. El sistema
 *     funciona sin HubSpot conectado.
 *   - Retry: hasta 3 intentos con backoff exponencial (cron lo re-encolará
 *     automáticamente al ver `attempts < 3 && status = PENDING`).
 *
 * MVP simplificación:
 *   - No usa `@hubspot/api-client` real (no se instaló para no sumar la
 *     dependencia mientras el cliente decide). El método `pushToHubspot()`
 *     está marcado como TODO y por ahora simula la llamada. Cuando el
 *     cliente activa el flag, reemplazar el cuerpo del método por una
 *     llamada PATCH a `/crm/v3/objects/contacts` con `@hubspot/api-client`.
 *   - El mapping ya está armado y testeado por unidad.
 */
@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);

  constructor(
    @InjectRepository(HubspotSyncJob)
    private readonly jobs: Repository<HubspotSyncJob>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(CompanySettings)
    private readonly settings: Repository<CompanySettings>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  /**
   * Procesa hasta `limit` jobs pendientes. Llamado por el cron interno.
   * Devuelve cuántos procesó (ok + skipped + failed). Si HubSpot está
   * apagado, marca todos como SKIPPED y vuelve.
   */
  async drainOutbox(limit = 25): Promise<{
    ok: number;
    failed: number;
    skipped: number;
  }> {
    const cfg = await this.loadConfig();
    const pending = await this.jobs.find({
      where: {
        status: HubspotSyncJobStatus.PENDING,
        scheduledAt: LessThanOrEqual(new Date()),
      },
      order: { scheduledAt: 'ASC' },
      take: limit,
    });

    if (pending.length === 0) return { ok: 0, failed: 0, skipped: 0 };

    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (const job of pending) {
      if (!cfg.enabled || !cfg.apiKey) {
        await this.jobs.update(
          { id: job.id },
          {
            status: HubspotSyncJobStatus.SKIPPED,
            processedAt: new Date(),
          },
        );
        skipped += 1;
        continue;
      }

      await this.jobs.update(
        { id: job.id },
        { status: HubspotSyncJobStatus.PROCESSING },
      );

      try {
        const customer = await this.customers.findOne({
          where: { id: job.customerId },
        });
        if (!customer) {
          // Cliente borrado entre encolado y proceso. No reintentar.
          await this.jobs.update(
            { id: job.id },
            {
              status: HubspotSyncJobStatus.FAILED,
              lastError: 'Cliente no encontrado',
              processedAt: new Date(),
            },
          );
          failed += 1;
          continue;
        }

        const hubspotId = await this.pushToHubspot(customer, cfg);
        if (hubspotId && hubspotId !== customer.hubspotContactId) {
          await this.customers.update(
            { id: customer.id },
            { hubspotContactId: hubspotId },
          );
        }

        await this.jobs.update(
          { id: job.id },
          {
            status: HubspotSyncJobStatus.DONE,
            processedAt: new Date(),
          },
        );
        ok += 1;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err ?? 'unknown');
        const attempts = job.attempts + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        await this.jobs.update(
          { id: job.id },
          {
            status: exhausted
              ? HubspotSyncJobStatus.FAILED
              : HubspotSyncJobStatus.PENDING,
            attempts,
            lastError: message,
            // Backoff exponencial: 1m, 5m, 25m.
            scheduledAt: exhausted
              ? new Date()
              : new Date(Date.now() + Math.pow(5, attempts) * 60_000),
          },
        );
        failed += 1;
      }
    }

    if (ok + failed + skipped > 0) {
      this.logger.log(
        `HubSpot outbox: ok=${ok} failed=${failed} skipped=${skipped}`,
      );
    }
    return { ok, failed, skipped };
  }

  /**
   * Endpoint "Test sync" del panel de configuración. Verifica conectividad
   * y permisos sin tocar datos reales. Devuelve un mensaje legible.
   */
  async testSync(): Promise<HubspotTestResultDto> {
    const cfg = await this.loadConfig();
    if (!cfg.enabled) {
      return {
        ok: false,
        message:
          'HubSpot está deshabilitado en configuración. Activá el toggle antes de testear.',
      };
    }
    if (!cfg.apiKey) {
      return {
        ok: false,
        message:
          'Falta HUBSPOT_API_KEY en variables de entorno. Configurala en el server y reiniciá.',
      };
    }
    try {
      // TODO: cuando se instale `@hubspot/api-client`, reemplazar este
      // stub por una llamada real a `GET /crm/v3/properties/contacts`
      // (read-only, valida que el token tenga scope `crm.schemas.contacts.read`).
      // Por ahora solo valida que el API key tenga formato razonable.
      if (cfg.apiKey.length < 20) {
        return {
          ok: false,
          message: 'El HUBSPOT_API_KEY parece inválido (muy corto).',
        };
      }
      return {
        ok: true,
        message:
          'Configuración válida. La llamada real a HubSpot está pendiente de activar (instalar @hubspot/api-client).',
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : 'Error desconocido al testear',
      };
    }
  }

  // ---------- helpers ----------

  /**
   * Mapping de Customer → propiedades de HubSpot. Expuesto como método para
   * que el test sync y eventual debug puedan inspeccionarlo sin hacer la
   * llamada real.
   */
  toHubspotProperties(customer: Customer): Record<string, string> {
    const { firstName, lastName } = splitName(customer.name);
    const props: Record<string, string> = {
      firstname: firstName,
      lastname: lastName,
      // Propiedad custom que el cliente crea manualmente en HubSpot. Los 5
      // valores corresponden al enum LifecycleStatus.
      inventory_lifecycle_status: customer.lifecycleStatus,
    };
    if (customer.whatsappPhone) props.phone = customer.whatsappPhone;
    else if (customer.phone) props.phone = customer.phone;
    if (customer.email) props.email = customer.email;
    return props;
  }

  /**
   * Stub del push real. Reemplazar el cuerpo cuando se instale
   * `@hubspot/api-client` y se confirme que el cliente proveyó su API key.
   * Por ahora devuelve un id sintético basado en `customer.id` para
   * mantener idempotencia mientras se desarrolla el frontend.
   */
  private async pushToHubspot(
    customer: Customer,
    _cfg: HubspotConfig,
  ): Promise<string | null> {
    const _props = this.toHubspotProperties(customer);
    // TODO Fase 8.5+: reemplazar por llamada real a Contacts API. Algo como:
    //
    //   if (customer.hubspotContactId) {
    //     await client.crm.contacts.basicApi.update(customer.hubspotContactId, { properties });
    //     return customer.hubspotContactId;
    //   }
    //   // Upsert por whatsappPhone o email
    //   const search = await client.crm.contacts.searchApi.doSearch({ ... });
    //   if (search.results.length > 0) {
    //     await client.crm.contacts.basicApi.update(search.results[0].id, { properties });
    //     return search.results[0].id;
    //   }
    //   const created = await client.crm.contacts.basicApi.create({ properties });
    //   return created.id;
    //
    // Stub: id sintético determinístico (idempotente local).
    return customer.hubspotContactId ?? `hs-stub-${customer.id.slice(0, 8)}`;
  }

  private async loadConfig(): Promise<HubspotConfig> {
    const rows = await this.settings.find({ take: 1 });
    const enabled = rows[0]?.hubspotEnabled ?? false;
    const apiKey = process.env.HUBSPOT_API_KEY ?? '';
    const ownerId = rows[0]?.hubspotDefaultOwnerId ?? null;
    return { enabled, apiKey, ownerId };
  }
}

interface HubspotConfig {
  enabled: boolean;
  apiKey: string;
  ownerId: string | null;
}

/**
 * Split básico del nombre completo en firstName / lastName. HubSpot trata
 * los dos campos como separados — si solo viene "Juan", lastName queda
 * vacío. Si vienen 2+ palabras, la última se considera apellido.
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  const lastName = parts[parts.length - 1]!;
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}
