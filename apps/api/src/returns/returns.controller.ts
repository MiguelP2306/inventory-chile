import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  CancelReturnDto,
  CreateReturnDto,
  ListReturnsQueryDto,
} from './dto';
import { ReturnsService } from './returns.service';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly svc: ReturnsService) {}

  @Get()
  list(@Query() query: ListReturnsQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Cantidad acumulada ya devuelta de cada saleItem de una venta. Lo consume
   * el form de nueva devolución para limitar la qty máxima por línea.
   */
  @Get('by-sale/:saleId/returned-qty')
  returnedQtyBySale(@Param('saleId', new ParseUUIDPipe()) saleId: string) {
    return this.svc.returnedQtyBySale(saleId);
  }

  /**
   * Ronda 11 — análogo para devoluciones a proveedor. Devuelve qty
   * acumulada por `purchaseEntryItemId`.
   */
  @Get('by-purchase/:purchaseEntryId/returned-qty')
  returnedQtyByPurchase(
    @Param('purchaseEntryId', new ParseUUIDPipe()) purchaseEntryId: string,
  ) {
    return this.svc.returnedQtyByPurchase(purchaseEntryId);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelReturnDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.cancel(id, dto, user.sub);
  }
}
