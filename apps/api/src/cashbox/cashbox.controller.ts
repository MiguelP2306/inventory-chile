import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  fetchAllPages,
  MONEY_FMT,
  sendXlsx,
  stylizeSheet,
} from '../common/xlsx-export';
import { CashboxService } from './cashbox.service';
import { ListCashTransactionsQueryDto } from './dto';

const TYPE_LABEL: Record<string, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
};

const SOURCE_LABEL: Record<string, string> = {
  SALE: 'Venta',
  PURCHASE: 'Compra',
  MANUAL: 'Manual',
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  CARD_DEBIT: 'Tarjeta débito',
  CARD_CREDIT: 'Tarjeta crédito',
  PAYMENT_LINK: 'Link de pago',
};

@Controller('cashbox')
export class CashboxController {
  constructor(private readonly svc: CashboxService) {}

  @Get('transactions')
  list(@Query() query: ListCashTransactionsQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Export del libro de caja a XLSX. Respeta los filtros del listado
   * (`type`, `source`, `paymentMethod`, `expenseCategoryId`, `dateFrom/To`,
   * `q`, `includeVoided`). Ignora paginación (batch interno).
   */
  @Get('transactions.xlsx')
  async exportTransactions(
    @Query() query: ListCashTransactionsQueryDto,
    @Res() res: Response,
  ) {
    const items = await fetchAllPages((page, pageSize) =>
      this.svc.list({ ...query, page, pageSize }),
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Caja');
    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Tipo', key: 'type', width: 10 },
      { header: 'Origen', key: 'source', width: 12 },
      { header: 'Método pago', key: 'paymentMethod', width: 16 },
      { header: 'Categoría', key: 'category', width: 22 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Monto', key: 'amount', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Anulada', key: 'isVoided', width: 10 },
      { header: 'Usuario', key: 'user', width: 22 },
    ];

    for (const tx of items) {
      sheet.addRow({
        date: tx.date
          ? new Date(tx.date).toISOString().slice(0, 10)
          : '',
        type: TYPE_LABEL[tx.type] ?? tx.type,
        source: SOURCE_LABEL[tx.source] ?? tx.source,
        paymentMethod: PAYMENT_LABEL[tx.paymentMethod] ?? tx.paymentMethod,
        category: tx.expenseCategory?.name ?? '',
        description: tx.description ?? '',
        amount: Number(tx.amount) || 0,
        isVoided: tx.isVoided ? 'Sí' : 'No',
        user: tx.user?.name ?? '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'caja');
  }

  @Get('balance')
  balance() {
    return this.svc.balance();
  }
}
