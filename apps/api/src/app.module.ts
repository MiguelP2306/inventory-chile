import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CashboxModule } from './cashbox/cashbox.module';
import { CategoriesModule } from './categories/categories.module';
import { CommunesModule } from './communes/communes.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { dataSourceOptions } from './database/data-source';
import { DispatchModule } from './dispatch/dispatch.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { ExpensesModule } from './expenses/expenses.module';
import { HealthController } from './health.controller';
import { HubspotModule } from './hubspot/hubspot.module';
import { ImportsModule } from './imports/imports.module';
import { InventoryModule } from './inventory/inventory.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProductsModule } from './products/products.module';
import { ProjectionModule } from './projection/projection.module';
import { PurchasesModule } from './purchases/purchases.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ReportsModule } from './reports/reports.module';
import { ReturnsModule } from './returns/returns.module';
import { SalesModule } from './sales/sales.module';
import { SettingsModule } from './settings/settings.module';
import { SupplierCreditsModule } from './supplier-credits/supplier-credits.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TransfersModule } from './transfers/transfers.module';
import { UPLOADS_ROOT } from './uploads/upload-config';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { WarrantiesModule } from './warranties/warranties.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(dataSourceOptions),
    // Sirve archivos subidos como estáticos bajo `/api/uploads/*` SOLO en el
    // driver local. Con `STORAGE_DRIVER=cloudinary` (Fase 12 / Railway) las
    // URLs ya son absolutas a Cloudinary y este static handler no se necesita.
    // Convención y validaciones: ver apps/api/src/uploads/upload-config.ts.
    ...((process.env.STORAGE_DRIVER ?? 'local').toLowerCase() === 'cloudinary'
      ? []
      : [
          ServeStaticModule.forRoot({
            rootPath: UPLOADS_ROOT,
            serveRoot: '/api/uploads',
            serveStaticOptions: { fallthrough: true, index: false },
          }),
        ]),
    AuthModule,
    CategoriesModule,
    BrandsModule,
    VehiclesModule,
    ProductsModule,
    SuppliersModule,
    SupplierCreditsModule,
    CustomersModule,
    CommunesModule,
    InventoryModule,
    PurchasesModule,
    UploadsModule,
    ExpenseCategoriesModule,
    ExpensesModule,
    CashboxModule,
    SettingsModule,
    NotificationsModule,
    QuotationsModule,
    SalesModule,
    WarehousesModule,
    TransfersModule,
    ReturnsModule,
    WarrantiesModule,
    DispatchModule,
    ProjectionModule,
    ReportsModule,
    LifecycleModule,
    HubspotModule,
    DashboardModule,
    ImportsModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
