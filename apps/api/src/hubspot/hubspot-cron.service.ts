import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HubspotService } from './hubspot.service';

/**
 * Cron interno que drena la outbox `hubspot_sync_jobs` cada 1 minuto.
 * Si HubSpot está deshabilitado (`hubspotEnabled=false` o falta API key),
 * los jobs se marcan como SKIPPED sin llamar a la API.
 */
@Injectable()
export class HubspotCronService {
  private readonly logger = new Logger(HubspotCronService.name);

  constructor(private readonly hubspot: HubspotService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async drainOutbox(): Promise<void> {
    try {
      await this.hubspot.drainOutbox(25);
    } catch (err) {
      this.logger.error(
        'Falla drainando outbox de HubSpot',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
