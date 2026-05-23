import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  fetchAllPages,
  MONEY_FMT,
  sendXlsx,
  stylizeSheet,
} from '../common/xlsx-export';
import {
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDto,
} from './dto';
import { ExpensesService } from './expenses.service';

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CARD_DEBIT: 'Tarjeta débito',
  CARD_CREDIT: 'Tarjeta crédito',
  PAYMENT_LINK: 'Link de pago',
};

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get()
  list(@Query() query: ListExpensesQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Export de gastos a XLSX. Respeta `categoryId`, `paymentMethod`,
   * `dateFrom/To`, `q`, `includeVoided`. Ignora paginación (batch interno).
   */
  @Get('export.xlsx')
  async exportXlsx(
    @Query() query: ListExpensesQueryDto,
    @Res() res: Response,
  ) {
    const items = await fetchAllPages((page, pageSize) =>
      this.svc.list({ ...query, page, pageSize }),
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Gastos');
    sheet.columns = [
      { header: 'Número', key: 'number', width: 16 },
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Categoría', key: 'category', width: 22 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Método pago', key: 'paymentMethod', width: 16 },
      { header: 'Monto', key: 'amount', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Anulado', key: 'voided', width: 10 },
      { header: 'Anulado el', key: 'voidedAt', width: 12 },
      { header: 'Cargado por', key: 'user', width: 22 },
      { header: 'Comprobante', key: 'receiptUrl', width: 40 },
    ];

    for (const e of items) {
      sheet.addRow({
        number: e.number,
        date: e.date ? new Date(e.date).toISOString().slice(0, 10) : '',
        category: e.category?.name ?? '',
        description: e.description ?? '',
        paymentMethod: PAYMENT_LABEL[e.paymentMethod] ?? e.paymentMethod,
        amount: Number(e.amount) || 0,
        voided: e.voidedAt ? 'Sí' : 'No',
        voidedAt: e.voidedAt
          ? new Date(e.voidedAt).toISOString().slice(0, 10)
          : '',
        user: e.user?.name ?? '',
        receiptUrl: e.receiptUrl ?? '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'gastos');
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub);
  }

  @Post(':id/void')
  voidOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.voidOne(id, user.sub);
  }
}
