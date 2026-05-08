import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QuotationsService } from './quotations.service';

@Injectable()
export class QuotationsCronService {
  private readonly logger = new Logger(QuotationsCronService.name);

  constructor(private readonly svc: QuotationsService) {}

  /**
   * Diario a las 03:00 — marca como EXPIRED las cotizaciones SENT/APPROVED
   * con `validUntil` anterior a hoy. No envía nada al cliente; el badge
   * "Vencida" se muestra en el frontend a partir del nuevo status.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'expire-quotations',
  })
  async run(): Promise<void> {
    try {
      const affected = await this.svc.expireOverdue();
      if (affected > 0) {
        this.logger.log(`Expiradas ${affected} cotización(es) vencidas.`);
      }
    } catch (err) {
      this.logger.error(
        `Error expirando cotizaciones: ${(err as Error).message}`,
      );
    }
  }
}
