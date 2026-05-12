import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountersModule } from '../common/counters.module';
import { SaleItem, WarrantyClaim } from '../database/entities';
import { WarrantiesController } from './warranties.controller';
import { WarrantiesService } from './warranties.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WarrantyClaim, SaleItem]),
    CountersModule,
  ],
  controllers: [WarrantiesController],
  providers: [WarrantiesService],
  exports: [WarrantiesService],
})
export class WarrantiesModule {}
