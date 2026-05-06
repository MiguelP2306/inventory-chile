import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { AdjustStockDto, ListMovementsQueryDto, ListStockQueryDto } from './dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Get('stock')
  listStock(@Query() query: ListStockQueryDto) {
    return this.svc.listStock(query);
  }

  @Get('movements')
  listMovements(@Query() query: ListMovementsQueryDto) {
    return this.svc.listMovements(query);
  }

  @Post('adjust')
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: JwtPayload) {
    return this.svc.adjust(dto, user.sub);
  }
}
