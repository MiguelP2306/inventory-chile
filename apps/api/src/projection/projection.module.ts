import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CompanySettings,
  InventoryMovement,
  Product,
  Stock,
  Warehouse,
} from '../database/entities';
import { ProjectionController } from './projection.controller';
import { ProjectionService } from './projection.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      InventoryMovement,
      Stock,
      Warehouse,
      CompanySettings,
    ]),
  ],
  controllers: [ProjectionController],
  providers: [ProjectionService],
})
export class ProjectionModule {}
