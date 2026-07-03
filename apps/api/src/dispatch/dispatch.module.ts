import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountersModule } from '../common/counters.module';
import {
  Commune,
  Customer,
  DispatchNote,
  DispatchNoteItem,
  Product,
  Sale,
  SaleItem,
  Warehouse,
} from '../database/entities';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DispatchNote,
      DispatchNoteItem,
      Sale,
      SaleItem,
      Customer,
      Product,
      Commune,
      Warehouse,
    ]),
    CountersModule,
    InventoryModule,
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [DispatchController],
  providers: [DispatchService],
  // Exportamos el service para que SalesModule pueda inyectarlo en
  // SalesService.cancel y anular la guía en cascada.
  exports: [DispatchService],
})
export class DispatchModule {}
