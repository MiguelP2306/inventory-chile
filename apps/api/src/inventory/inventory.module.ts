import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import {
  InventoryMovement,
  Product,
  Stock,
  Warehouse,
} from '../database/entities';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Warehouse, Stock, InventoryMovement]),
    CategoriesModule,
    WarehousesModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
