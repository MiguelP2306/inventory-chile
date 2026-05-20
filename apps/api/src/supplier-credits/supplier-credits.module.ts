import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PurchaseCreditApplication,
  Supplier,
  SupplierCredit,
} from '../database/entities';
import { SupplierCreditsController } from './supplier-credits.controller';
import { SupplierCreditsService } from './supplier-credits.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierCredit,
      PurchaseCreditApplication,
      Supplier,
    ]),
  ],
  controllers: [SupplierCreditsController],
  providers: [SupplierCreditsService],
  // Exportamos el service para que PurchasesService y ReturnsService puedan
  // inyectarlo y registrar aplicaciones / créditos dentro de sus propias
  // transacciones atómicas.
  exports: [SupplierCreditsService],
})
export class SupplierCreditsModule {}
