import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashboxModule } from '../cashbox/cashbox.module';
import {
  Customer,
  Expense,
  InventoryMovement,
  Product,
  Quotation,
  Sale,
  Stock,
} from '../database/entities';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      Quotation,
      Customer,
      Expense,
      Stock,
      Product,
      InventoryMovement,
    ]),
    CashboxModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
