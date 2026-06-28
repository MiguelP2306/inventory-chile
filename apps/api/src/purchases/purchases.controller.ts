import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@inventory/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  fetchAllPages,
  MONEY_FMT,
  sendXlsx,
  stylizeSheet,
} from '../common/xlsx-export';
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
   * Export XLSX — una fila por compra. Respeta filtros del listado e ignora
   * paginación (batch interno).
   */
  @Get('export.xlsx')
  async exportXlsx(
    @Query() query: ListPurchasesQueryDto,
    @Res() res: Response,
  ) {
    const items = await fetchAllPages((page, pageSize) =>
      this.svc.list({ ...query, page, pageSize }),
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Compras');
    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Proveedor', key: 'supplier', width: 30 },
      { header: 'RUT proveedor', key: 'supplierTaxId', width: 14 },
      { header: 'Bodega destino', key: 'warehouse', width: 18 },
      { header: 'Items', key: 'itemsCount', width: 8 },
      { header: 'Subtotal', key: 'subtotal', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'IVA', key: 'taxAmount', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Total', key: 'total', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Facturas adjuntas', key: 'invoicesCount', width: 14 },
      { header: 'Notas', key: 'notes', width: 30 },
      { header: 'Cargado por', key: 'user', width: 22 },
    ];

    for (const p of items) {
      // `purchases.service.list()` devuelve la entidad cruda (no el DTO), así
      // que `date` viene como `Date`. Lo normalizamos a ISO short.
      const dateStr = p.date
        ? new Date(p.date).toISOString().slice(0, 10)
        : '';
      sheet.addRow({
        date: dateStr,
        supplier: p.supplier?.name ?? '',
        supplierTaxId: p.supplier?.taxId ?? '',
        warehouse: p.warehouse?.name ?? '',
        itemsCount: p.items?.length ?? 0,
        subtotal: Number(p.subtotal) || 0,
        taxAmount: Number(p.taxAmount) || 0,
        total: Number(p.total) || 0,
        invoicesCount: p.invoices?.length ?? 0,
        notes: p.notes ?? '',
        user: p.user?.name ?? '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'compras');
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
    return this.svc.create(dto, user.sub, user.role === UserRole.ADMIN);
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
