import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountersModule } from '../common/counters.module';
import {
  Product,
  Transfer,
  TransferItem,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer, TransferItem, Warehouse, Product]),
    CountersModule,
    InventoryModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
