import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { CommunesModule } from './communes/communes.module';
import { CustomersModule } from './customers/customers.module';
import { dataSourceOptions } from './database/data-source';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { ProductsModule } from './products/products.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UPLOADS_ROOT } from './uploads/upload-config';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    // Sirve archivos subidos como estáticos bajo `/api/uploads/*` (mismo
    // prefix que la API). Convención y validaciones: ver
    // apps/api/src/uploads/upload-config.ts.
    ServeStaticModule.forRoot({
      rootPath: UPLOADS_ROOT,
      serveRoot: '/api/uploads',
      serveStaticOptions: { fallthrough: true, index: false },
    }),
    AuthModule,
    CategoriesModule,
    BrandsModule,
    VehiclesModule,
    ProductsModule,
    SuppliersModule,
    CustomersModule,
    CommunesModule,
    InventoryModule,
    PurchasesModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
