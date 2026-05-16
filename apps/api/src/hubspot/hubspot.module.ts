import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CompanySettings,
  Customer,
  HubspotSyncJob,
} from '../database/entities';
import { HubspotController } from './hubspot.controller';
import { HubspotCronService } from './hubspot-cron.service';
import { HubspotService } from './hubspot.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HubspotSyncJob, Customer, CompanySettings]),
  ],
  controllers: [HubspotController],
  providers: [HubspotService, HubspotCronService],
  exports: [HubspotService],
})
export class HubspotModule {}
