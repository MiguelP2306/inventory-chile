import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import {
  Customer,
  DispatchNote,
  InventoryMovement,
  Product,
  PurchaseEntry,
  PurchaseEntryItem,
  PurchaseInvoice,
  Return,
  ReturnItem,
  Sale,
  SaleItem,
  Stock,
  Supplier,
  Transfer,
  TransferItem,
  Warehouse,
} from '../database/entities';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Warehouse,
      Stock,
      InventoryMovement,
      // Ronda 13 — `listMovementCards` joinea con las entidades padre para
      // devolver cards enriquecidas (cliente, proveedor, totales, etc.).
      Sale,
      SaleItem,
      Customer,
      PurchaseEntry,
      PurchaseEntryItem,
      PurchaseInvoice,
      Supplier,
      Return,
      ReturnItem,
      Transfer,
      TransferItem,
      DispatchNote,
    ]),
    CategoriesModule,
    WarehousesModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
