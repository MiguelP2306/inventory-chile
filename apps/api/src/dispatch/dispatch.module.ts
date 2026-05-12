import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountersModule } from '../common/counters.module';
import {
  Commune,
  Customer,
  DispatchNote,
  Sale,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DispatchNote, Sale, Customer, Commune]),
    CountersModule,
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
