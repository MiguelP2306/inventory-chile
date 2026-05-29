import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Brand,
  Category,
  Commune,
  Customer,
  Product,
  ProductCode,
  Stock,
  Supplier,
  VehicleFitment,
  VehicleMake,
  VehicleModel,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersImportService } from './customers-import.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { SuppliersImportService } from './suppliers-import.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Category,
      Brand,
      ProductCode,
      Customer,
      Commune,
      Supplier,
      Warehouse,
      Stock,
      VehicleMake,
      VehicleModel,
      VehicleFitment,
    ]),
    InventoryModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService, CustomersImportService, SuppliersImportService],
})
export class ImportsModule {}
