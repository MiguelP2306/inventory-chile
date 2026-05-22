import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashboxModule } from '../cashbox/cashbox.module';
import {
  Customer,
  Expense,
  InventoryMovement,
  Product,
  ProductImage,
  Quotation,
  Sale,
  SaleItem,
  Stock,
} from '../database/entities';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      Quotation,
      Customer,
      Expense,
      Stock,
      Product,
      ProductImage,
      InventoryMovement,
    ]),
    CashboxModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
