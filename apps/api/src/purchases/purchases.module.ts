import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashboxModule } from '../cashbox/cashbox.module';
import {
  CompanySettings,
  PurchaseEntry,
  PurchaseEntryItem,
  PurchaseInvoice,
  Return,
  Supplier,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { SupplierCreditsModule } from '../supplier-credits/supplier-credits.module';
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
      Return,
    ]),
    InventoryModule,
    CashboxModule,
    SupplierCreditsModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
