import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashboxModule } from '../cashbox/cashbox.module';
import {
  CompanySettings,
  PurchaseEntry,
  PurchaseEntryItem,
  PurchaseInvoice,
  Supplier,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseEntry,
      PurchaseEntryItem,
      PurchaseInvoice,
      Supplier,
      Warehouse,
      CompanySettings,
    ]),
    InventoryModule,
    CashboxModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
