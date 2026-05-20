import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  AddInvoicesDto,
  CreatePurchaseEntryDto,
  ListPurchasesQueryDto,
  PurchasesKpisQueryDto,
} from './dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  @Get()
  list(@Query() query: ListPurchasesQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Ronda 9 — KPIs de compras (mes actual por default). Lo consume el
   * dashboard de `/compras` arriba de la tabla.
   */
  @Get('kpis')
  kpis(@Query() query: PurchasesKpisQueryDto) {
    return this.svc.kpis(query);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreatePurchaseEntryDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  /**
   * Ronda 7 — agregar facturas a una compra existente. Cada item del body
   * es el resultado de POST /uploads/purchase-invoice (la metadata real
   * del archivo, no derivada).
   */
  @Post(':id/invoices')
  addInvoices(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddInvoicesDto,
  ) {
    return this.svc.addInvoices(id, dto.files);
  }

  @Delete(':id/invoices/:invoiceId')
  removeInvoice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
  ) {
    return this.svc.removeInvoice(id, invoiceId);
  }
}
