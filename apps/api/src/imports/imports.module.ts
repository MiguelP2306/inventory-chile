import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Brand,
  Category,
  Product,
  ProductCode,
} from '../database/entities';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category, Brand, ProductCode])],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
