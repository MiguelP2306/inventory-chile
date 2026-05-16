import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LifecycleService } from './lifecycle.service';

/**
 * Cron diario que marca como FOLLOW_UP a los clientes con `nextFollowUpAt`
 * vencido. Corre a las 00:30 hora local (Chile). El timezone se fija
 * explícitamente para que el corte de día coincida con la operación local
 * del cliente, sin importar el TZ del server.
 *
 * Idempotente: corre todas las noches sin importar si el día anterior se
 * ejecutó. Si no hay nada que mover, log silencioso.
 */
@Injectable()
export class LifecycleCronService {
  private readonly logger = new Logger(LifecycleCronService.name);

  constructor(private readonly lifecycle: LifecycleService) {}

  @Cron('30 0 * * *', { timeZone: 'America/Santiago' })
  async handleDailyFollowUpSweep(): Promise<void> {
    try {
      const moved = await this.lifecycle.markOverdueAsFollowUp();
      if (moved > 0) {
        this.logger.log(`Marcados ${moved} clientes a FOLLOW_UP por timeout`);
      }
    } catch (err) {
      this.logger.error(
        'Falla en cron de FOLLOW_UP',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
