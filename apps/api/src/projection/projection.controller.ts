import { Controller, Get, Query, Res } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import type { Response } from 'express';
import { ProjectionQueryDto } from './dto';
import { ProjectionService } from './projection.service';

@Controller('projection')
export class ProjectionController {
  constructor(private readonly svc: ProjectionService) {}

  /**
   * Proyección JSON. Default `onlyCritical=true` (lo que el cliente realmente
   * mira). El operador puede pedir `?all=1` para ver el catálogo completo
   * proyectado.
   */
  @Get()
  async list(
    @Query() query: ProjectionQueryDto,
    @Query('all') all?: string,
  ) {
    return this.svc.compute({
      leadTimeDays: query.leadTimeDays,
      onlyCritical: all !== '1',
    });
  }

  /**
   * CSV de la lista de críticos (o todos si `?all=1`). Pensado para abrir en
   * Excel directamente — separador coma, encabezados en español, comillas
   * cuando hace falta. Encoding UTF-8 con BOM para que Excel detecte acentos.
   */
  @Get('export.csv')
  async exportCsv(
    @Query() query: ProjectionQueryDto,
    @Query('all') all: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.svc.compute({
      leadTimeDays: query.leadTimeDays,
      onlyCritical: all !== '1',
    });

    const csv = stringify(
      data.rows.map((r): Record<string, string | number> => ({
        SKU: r.sku ?? '',
        Producto: r.name,
        'Stock total': r.totalStock,
        'Consumo diario': r.dailyConsumption,
        'Dias cobertura': r.coverageDays ?? '',
        'Fecha quiebre': r.stockoutDate
          ? r.stockoutDate.slice(0, 10)
          : '',
        'Sugerencia pedido': r.suggestedOrder,
        Critico: r.isCritical ? 'SI' : 'NO',
      })),
      {
        header: true,
        bom: true,
        quoted_string: true,
      },
    );

    const today = new Date().toISOString().slice(0, 10);
    const filename = `proyeccion-criticos-${today}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(csv);
  }
}
