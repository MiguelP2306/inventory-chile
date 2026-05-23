import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandsModule } from '../brands/brands.module';
import { CategoriesModule } from '../categories/categories.module';
import { CountersModule } from '../common/counters.module';
import {
  Product,
  ProductCode,
  ProductImage,
  Stock,
  VehicleFitment,
  VehicleModel,
} from '../database/entities';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { LabelService } from './label.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductCode,
      ProductImage,
      Stock, // Fase 11 — LabelService lee Stock.locationCode para el footer.
      VehicleFitment,
      VehicleModel,
    ]),
    CountersModule,
    CategoriesModule,
    BrandsModule,
    NotificationsModule,
    SettingsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, LabelService],
  exports: [ProductsService],
})
export class ProductsModule {}
