import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { PdfService } from '../notifications/pdf.service';
import {
  CancelSaleDto,
  CreateSaleDto,
  GeneratePdfQueryDto,
  ListSalesQueryDto,
} from './dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly svc: SalesService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  list(@Query() query: ListSalesQueryDto) {
    return this.svc.list(query);
  }

  @Get('available-stock')
  availableStock(
    @Query('productIds') productIds: string | undefined,
    @Query('warehouseId') warehouseId?: string,
    @Query('aggregate') aggregate?: string,
  ) {
    const ids = (productIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // `aggregate=1` suma stock de todas las bodegas activas (Ronda 7, usado
    // por el QuotationForm). Sin el flag, mantiene el comportamiento previo
    // de devolver el stock de una bodega específica.
    return this.svc.availableStock(ids, warehouseId, aggregate === '1');
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.cancel(id, dto, user.sub);
  }

  @Get(':id/pdf')
  async getPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GeneratePdfQueryDto,
    @Res() res: Response,
  ) {
    const sale = await this.svc.getOne(id);
    const settings = await this.svc.getSettings();
    const buffer = await this.pdf.generate(
      this.pdf.fromSaleDto(sale, settings),
      query.format ?? 'letter',
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sale.number}.pdf"`,
    );
    res.send(buffer);
  }
}
