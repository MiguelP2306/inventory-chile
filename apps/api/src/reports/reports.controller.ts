import { Controller, Get, Query, Res } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import type { Response } from 'express';
import { NoMovementQueryDto, ReportDateRangeQueryDto } from './dto';
import { ReportsService } from './reports.service';

/**
 * Reportes contables — Fase 8. Tres reportes core: ventas, IVA, flujo de caja.
 * Cada uno expone JSON (`GET /reports/<name>`) y CSV (`GET /reports/<name>.csv`)
 * con BOM UTF-8 para que Excel detecte acentos correctamente.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  // ---------- Ventas ----------

  @Get('sales')
  async sales(@Query() query: ReportDateRangeQueryDto) {
    return this.svc.sales_report(query);
  }

  @Get('sales.csv')
  async salesCsv(
    @Query() query: ReportDateRangeQueryDto,
    @Res() res: Response,
  ) {
    const data = await this.svc.sales_report(query);
    const csv = stringify(
      data.rows.map((r): Record<string, string> => ({
        Numero: r.number,
        Fecha: r.date.slice(0, 10),
        Cliente: r.customerName,
        RUT: r.customerTaxId ?? '',
        'Metodo pago': r.paymentMethod,
        Estado: r.status,
        Subtotal: r.subtotal,
        IVA: r.taxAmount,
        Total: r.total,
      })),
      { header: true, bom: true, quoted_string: true },
    );
    sendCsv(res, csv, `ventas-${rangeSlug(query)}.csv`);
  }

  // ---------- IVA ----------

  @Get('iva')
  async iva(@Query() query: ReportDateRangeQueryDto) {
    return this.svc.iva(query);
  }

  @Get('iva.csv')
  async ivaCsv(
    @Query() query: ReportDateRangeQueryDto,
    @Res() res: Response,
  ) {
    const data = await this.svc.iva(query);
    // CSV combinado: una sección de ventas (débito) + una de compras (crédito).
    // Ambas tienen las mismas 8 columnas para que Excel las renderice juntas.
    const sales = data.salesRows.map((r): Record<string, string> => ({
      Tipo: 'VENTA',
      Documento: r.number,
      Fecha: r.date.slice(0, 10),
      Contraparte: r.customerName,
      RUT: r.customerTaxId ?? '',
      Subtotal: r.subtotal,
      IVA: r.taxAmount,
      Total: r.total,
    }));
    const purchases = data.purchaseRows.map((r): Record<string, string> => ({
      Tipo: 'COMPRA',
      Documento: r.id.slice(0, 8),
      Fecha: r.date.slice(0, 10),
      Contraparte: r.supplierName,
      RUT: r.supplierTaxId ?? '',
      Subtotal: r.subtotal,
      IVA: r.taxAmount,
      Total: r.total,
    }));
    const csv = stringify([...sales, ...purchases], {
      header: true,
      bom: true,
      quoted_string: true,
    });
    sendCsv(res, csv, `iva-${rangeSlug(query)}.csv`);
  }

  // ---------- Sin movimiento (Fase 9) ----------

  @Get('no-movement')
  async noMovement(@Query() query: NoMovementQueryDto) {
    return this.svc.noMovement(query.days ?? 30);
  }

  @Get('no-movement.csv')
  async noMovementCsv(
    @Query() query: NoMovementQueryDto,
    @Res() res: Response,
  ) {
    const days = query.days ?? 30;
    const data = await this.svc.noMovement(days);
    const csv = stringify(
      data.rows.map((r): Record<string, string> => ({
        SKU: r.sku,
        Producto: r.name,
        Categoria: r.categoryName ?? '',
        Marca: r.brandName ?? '',
        'Stock total': String(r.totalStock),
        'Valor inventario': r.inventoryValue,
        'Ultimo movimiento': r.lastMovementAt
          ? r.lastMovementAt.slice(0, 10)
          : 'Nunca',
        'Dias sin movimiento':
          r.daysSinceLastMovement !== null
            ? String(r.daysSinceLastMovement)
            : 'N/A',
      })),
      { header: true, bom: true, quoted_string: true },
    );
    sendCsv(res, csv, `sin-movimiento-${days}d.csv`);
  }

  // ---------- Flujo de caja ----------

  @Get('cash-flow')
  async cashFlow(@Query() query: ReportDateRangeQueryDto) {
    return this.svc.cashFlow(query);
  }

  @Get('cash-flow.csv')
  async cashFlowCsv(
    @Query() query: ReportDateRangeQueryDto,
    @Res() res: Response,
  ) {
    const data = await this.svc.cashFlow(query);
    const csv = stringify(
      data.rows.map((r): Record<string, string> => ({
        Fecha: r.date.slice(0, 10),
        Tipo: r.type,
        Origen: r.source,
        'Metodo pago': r.paymentMethod,
        Descripcion: r.description,
        Monto: r.amount,
        Anulada: r.isVoided ? 'SI' : 'NO',
      })),
      { header: true, bom: true, quoted_string: true },
    );
    sendCsv(res, csv, `flujo-caja-${rangeSlug(query)}.csv`);
  }
}

function sendCsv(res: Response, csv: string, filename: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function rangeSlug(q: ReportDateRangeQueryDto): string {
  const from = q.dateFrom ?? 'inicio';
  const to = q.dateTo ?? new Date().toISOString().slice(0, 10);
  return `${from}_${to}`;
}
