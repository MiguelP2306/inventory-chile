import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CompanySettings,
  Customer,
  HubspotSyncJob,
  LeadEvent,
} from '../database/entities';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleCronService } from './lifecycle-cron.service';
import { LifecycleService } from './lifecycle.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      LeadEvent,
      HubspotSyncJob,
      CompanySettings,
    ]),
  ],
  controllers: [LifecycleController],
  providers: [LifecycleService, LifecycleCronService],
  // Otros módulos (QuotationsModule, SalesModule) usan LifecycleService para
  // disparar los hooks dentro de sus transacciones.
  exports: [LifecycleService],
})
export class LifecycleModule {}
