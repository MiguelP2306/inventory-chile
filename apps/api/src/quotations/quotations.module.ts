import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountersModule } from '../common/counters.module';
import {
  CompanySettings,
  Customer,
  Product,
  Quotation,
  QuotationItem,
} from '../database/entities';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicQuotationsController } from './public.controller';
import { QuotationsController } from './quotations.controller';
import { QuotationsCronService } from './quotations-cron.service';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quotation,
      QuotationItem,
      Customer,
      Product,
      CompanySettings,
    ]),
    CountersModule,
    NotificationsModule,
    LifecycleModule,
  ],
  controllers: [QuotationsController, PublicQuotationsController],
  providers: [QuotationsService, QuotationsCronService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
