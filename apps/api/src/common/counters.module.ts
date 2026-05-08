import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Counter } from '../database/entities';
import { CountersService } from './counters.service';

@Module({
  imports: [TypeOrmModule.forFeature([Counter])],
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
