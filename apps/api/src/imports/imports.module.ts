import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Brand,
  Category,
  Commune,
  Customer,
  Product,
  ProductCode,
  Supplier,
} from '../database/entities';
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
    ]),
  ],
  controllers: [ImportsController],
  providers: [ImportsService, CustomersImportService, SuppliersImportService],
})
export class ImportsModule {}
