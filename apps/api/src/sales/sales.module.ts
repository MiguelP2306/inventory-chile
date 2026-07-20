import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashboxModule } from '../cashbox/cashbox.module';
import { CountersModule } from '../common/counters.module';
import {
  CashTransaction,
  CompanySettings,
  Customer,
  ExpenseCategory,
  Product,
  Quotation,
  Sale,
  SaleDraft,
  SaleDraftItem,
  SaleItem,
  Stock,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SaleDraftsController } from './sale-drafts.controller';
import { SaleDraftsService } from './sale-drafts.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      SaleDraft,
      SaleDraftItem,
      Customer,
      Warehouse,
      Product,
      Stock,
      CashTransaction,
      CompanySettings,
      ExpenseCategory,
      Quotation,
    ]),
    CountersModule,
    InventoryModule,
    CashboxModule,
    NotificationsModule,
    LifecycleModule,
  ],
  controllers: [SalesController, SaleDraftsController],
  providers: [SalesService, SaleDraftsService],
  exports: [SalesService, SaleDraftsService],
})
export class SalesModule {}
