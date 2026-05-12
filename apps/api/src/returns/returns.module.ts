import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashboxModule } from '../cashbox/cashbox.module';
import { CountersModule } from '../common/counters.module';
import {
  CashTransaction,
  PurchaseEntry,
  PurchaseEntryItem,
  Return,
  ReturnItem,
  Sale,
  SaleItem,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Return,
      ReturnItem,
      Sale,
      SaleItem,
      PurchaseEntry,
      PurchaseEntryItem,
      Warehouse,
      CashTransaction,
    ]),
    CountersModule,
    InventoryModule,
    CashboxModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
