import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashboxModule } from '../cashbox/cashbox.module';
import { CountersModule } from '../common/counters.module';
import {
  CashTransaction,
  Product,
  PurchaseEntry,
  PurchaseEntryItem,
  Return,
  ReturnItem,
  ReturnReplacementItem,
  Sale,
  SaleItem,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { SupplierCreditsModule } from '../supplier-credits/supplier-credits.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Return,
      ReturnItem,
      ReturnReplacementItem,
      Sale,
      SaleItem,
      PurchaseEntry,
      PurchaseEntryItem,
      Product,
      Warehouse,
      CashTransaction,
    ]),
    CountersModule,
    InventoryModule,
    CashboxModule,
    SupplierCreditsModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
