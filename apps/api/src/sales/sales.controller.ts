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
import { Permission, UserRole } from '@inventory/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  redactSaleBreakdown,
  redactSaleBreakdownList,
  viewerHas,
} from '../common/redact';
import {
  fetchAllPages,
  MONEY_FMT,
  sendXlsx,
  stylizeSheet,
} from '../common/xlsx-export';
import { PdfService } from '../notifications/pdf.service';
import {
  CancelSaleDto,
  CreateSaleDto,
  GeneratePdfQueryDto,
  ListSalesQueryDto,
  SalesKpisQueryDto,
} from './dto';
import { SalesService } from './sales.service';

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CARD_DEBIT: 'Tarjeta débito',
  CARD_CREDIT: 'Tarjeta crédito',
  PAYMENT_LINK: 'Link de pago',
};

const SALE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  CANCELLED: 'Cancelada',
};

@Controller('sales')
export class SalesController {
  constructor(
    private readonly svc: SalesService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  async list(
    @CurrentUser() viewer: JwtPayload,
    @Query() query: ListSalesQueryDto,
  ) {
    const result = await this.svc.list(query);
    return {
      ...result,
      items: redactSaleBreakdownList(result.items, viewer),
    };
  }

  /**
   * Export XLSX — una fila por venta. Respeta filtros del listado e ignora
   * la paginación (batch interno).
   */
  @Get('export.xlsx')
  async exportXlsx(
    @CurrentUser() viewer: JwtPayload,
    @Query() query: ListSalesQueryDto,
    @Res() res: Response,
  ) {
    const canSeeBreakdown = viewerHas(
      viewer,
      Permission.SALE_VIEW_FINANCIAL_BREAKDOWN,
    );
    const items = await fetchAllPages((page, pageSize) =>
      this.svc.list({ ...query, page, pageSize }),
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Ventas');
    sheet.columns = [
      { header: 'Número', key: 'number', width: 16 },
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Cliente', key: 'customer', width: 30 },
      { header: 'RUT', key: 'taxId', width: 14 },
      { header: 'Bodega', key: 'warehouse', width: 18 },
      // Columnas de desglose financiero solo para usuarios con permiso.
      ...(canSeeBreakdown
        ? [
            { header: 'Método pago', key: 'paymentMethod', width: 16 },
          ]
        : []),
      { header: 'Items', key: 'itemsCount', width: 8 },
      ...(canSeeBreakdown
        ? [
            {
              header: 'Subtotal',
              key: 'subtotal',
              width: 14,
              style: { numFmt: MONEY_FMT },
            },
            {
              header: 'IVA',
              key: 'taxAmount',
              width: 14,
              style: { numFmt: MONEY_FMT },
            },
            {
              header: 'Comisión',
              key: 'commissionAmount',
              width: 14,
              style: { numFmt: MONEY_FMT },
            },
          ]
        : []),
      { header: 'Total', key: 'total', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Cotización origen', key: 'quotation', width: 18 },
      { header: 'Vendedor', key: 'user', width: 22 },
      { header: 'Cancelada', key: 'cancelledAt', width: 12 },
      { header: 'Motivo cancelación', key: 'cancelReason', width: 30 },
    ];

    for (const s of items) {
      sheet.addRow({
        number: s.number,
        date: s.date ? s.date.slice(0, 10) : '',
        status: SALE_STATUS_LABEL[s.status] ?? s.status,
        customer: s.customer?.name ?? '',
        taxId: s.customer?.taxId ?? '',
        warehouse: s.warehouse?.name ?? '',
        ...(canSeeBreakdown
          ? {
              paymentMethod: s.paymentMethod
                ? PAYMENT_METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod
                : '',
              subtotal: Number(s.subtotal ?? 0) || 0,
              taxAmount: Number(s.taxAmount ?? 0) || 0,
              commissionAmount: Number(s.commissionAmount ?? 0) || 0,
            }
          : {}),
        itemsCount: s.items?.length ?? 0,
        total: Number(s.total) || 0,
        quotation: s.quotation?.number ?? '',
        user: s.user?.name ?? '',
        cancelledAt: s.cancelledAt ? s.cancelledAt.slice(0, 10) : '',
        cancelReason: s.cancelReason ?? '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'ventas');
  }

  /**
   * Ronda 12 — KPIs de ventas (default = mes actual). Lo consume el
   * dashboard de `/ventas` arriba de la tabla.
   */
  @Get('kpis')
  kpis(@Query() query: SalesKpisQueryDto) {
    return this.svc.kpis(query);
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
  async getOne(
    @CurrentUser() viewer: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const sale = await this.svc.getOne(id);
    return redactSaleBreakdown(sale, viewer);
  }

  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub, user.role === UserRole.ADMIN);
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
    @CurrentUser() viewer: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GeneratePdfQueryDto,
    @Res() res: Response,
  ) {
    const rawSale = await this.svc.getOne(id);
    const sale = redactSaleBreakdown(rawSale, viewer);
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
