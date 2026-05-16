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
  SaleItem,
  Stock,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
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
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
