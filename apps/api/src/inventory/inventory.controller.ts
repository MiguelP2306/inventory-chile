import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  AdjustStockDto,
  ListMovementsQueryDto,
  ListStockQueryDto,
  SetLocationCodeDto,
} from './dto';
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

  /**
   * Setea el `locationCode` de un producto en una bodega (Fase 7.5). Si no
   * existe la fila Stock, se crea con qty=0 y el code. Útil para la edición
   * inline de "Ubicación" en /inventario.
   */
  @Patch('stock/location')
  setLocation(@Body() dto: SetLocationCodeDto) {
    return this.svc.setLocationCode(
      dto.productId,
      dto.warehouseId,
      dto.locationCode ?? null,
    );
  }
}
