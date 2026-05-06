import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { dataSourceOptions } from './database/data-source';
import { HealthController } from './health.controller';
import { ProductsModule } from './products/products.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    AuthModule,
    CategoriesModule,
    BrandsModule,
    VehiclesModule,
    ProductsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
