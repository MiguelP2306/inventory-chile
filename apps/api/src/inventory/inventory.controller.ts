import { Body, Controller, Get, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { CategoriesService } from '../categories/categories.service';
import {
  fetchAllPages,
  MONEY_FMT,
  sendXlsx,
  stylizeSheet,
} from '../common/xlsx-export';
import { WarehousesService } from '../warehouses/warehouses.service';

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  PURCHASE_IN: 'Compra',
  SALE_OUT: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN_IN: 'Dev. cliente',
  RETURN_OUT: 'Dev. proveedor',
  RETURN_IN_DAMAGED: 'Dev. dañado',
  RETURN_DAMAGED_CANCELLED: 'Dev. dañado anulada',
  TRANSFER_OUT: 'Transf. salida',
  TRANSFER_IN: 'Transf. entrada',
  DISPATCH_OUT: 'Despacho',
  DISPATCH_VOIDED: 'Despacho anulado',
};
import {
  AdjustStockDto,
  ListMovementCardsQueryDto,
  ListMovementsQueryDto,
  ListStockQueryDto,
  SetLocationCodeDto,
} from './dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly svc: InventoryService,
    private readonly categories: CategoriesService,
    private readonly warehouses: WarehousesService,
  ) {}

  @Get('stock')
  listStock(@Query() query: ListStockQueryDto) {
    return this.svc.listStock(query);
  }

  /**
   * Ronda 10 — exporta el stock filtrado a Excel. Respeta los filtros
   * `q`, `status`, `warehouseId` pero **ignora** `page`/`pageSize` →
   * exporta todos los productos que matchean.
   */
  @Get('stock.xlsx')
  async exportStock(
    @Query() query: ListStockQueryDto,
    @Res() res: Response,
  ) {
    const rows = await this.svc.listStock({
      q: query.q,
      warehouseId: query.warehouseId,
      status: query.status,
    });
    const items = Array.isArray(rows) ? rows : rows.items;

    // Categorías con padre y warehouse para enriquecer columnas.
    const [categoriesPlain, warehouse] = await Promise.all([
      this.categories.list(),
      query.warehouseId
        ? this.warehouses.getOne(query.warehouseId).catch(() => null)
        : Promise.resolve(null),
    ]);
    const categoriesArr = Array.isArray(categoriesPlain)
      ? categoriesPlain
      : categoriesPlain.items;
    const categoryById = new Map(categoriesArr.map((c) => [c.id, c]));

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Inventory App';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Inventario');
    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 18 },
      { header: 'Nombre', key: 'name', width: 35 },
      { header: 'Categoría', key: 'category', width: 22 },
      { header: 'Subcategoría', key: 'subcategory', width: 22 },
      { header: 'Marca', key: 'brand', width: 18 },
      { header: 'Bodega', key: 'warehouse', width: 18 },
      { header: 'Ubicación', key: 'location', width: 16 },
      { header: 'Cantidad', key: 'qty', width: 10 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Costo unit.', key: 'cost', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Precio unit.', key: 'price', width: 14, style: { numFmt: MONEY_FMT } },
      {
        header: 'Valor inventario',
        key: 'inventoryValue',
        width: 18,
        style: { numFmt: MONEY_FMT },
      },
    ];

    for (const it of items) {
      const cat = it.product.category
        ? (categoryById.get(it.product.category.id) ?? null)
        : null;
      // Si la categoría tiene padre, "Categoría" = padre, "Subcategoría" = hija.
      // Si no tiene padre, "Categoría" = la categoría misma, sin subcategoría.
      const categoryName = cat?.parentName ?? cat?.name ?? '';
      const subcategoryName = cat?.parentName ? cat.name : '';
      const cost = parseFloat(it.product.cost ?? '0');
      const inventoryValue = it.quantity * cost;
      sheet.addRow({
        sku: it.product.sku ?? '',
        name: it.product.name,
        category: categoryName,
        subcategory: subcategoryName,
        brand: it.product.brand?.name ?? '',
        warehouse: warehouse?.name ?? '',
        location: it.locationCode ?? '',
        qty: it.quantity,
        status:
          it.status === 'ok'
            ? 'OK'
            : it.status === 'low'
              ? 'Bajo stock'
              : 'Crítico',
        cost,
        price: parseFloat(it.product.price ?? '0'),
        inventoryValue,
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, workbook, 'inventario');
  }

  @Get('movements')
  listMovements(@Query() query: ListMovementsQueryDto) {
    return this.svc.listMovements(query);
  }

  /**
   * Export del historial de movimientos a XLSX. Respeta `productId`,
   * `warehouseId`, `type`, `dateFrom/To`. Ignora paginación (batch interno).
   */
  @Get('movements.xlsx')
  async exportMovements(
    @Query() query: ListMovementsQueryDto,
    @Res() res: Response,
  ) {
    const items = await fetchAllPages((page, pageSize) =>
      this.svc.listMovements({ ...query, page, pageSize }),
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Movimientos');
    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Producto', key: 'product', width: 32 },
      { header: 'Bodega', key: 'warehouse', width: 18 },
      { header: 'Cantidad', key: 'qty', width: 10 },
      { header: 'Costo unit.', key: 'unitCost', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Referencia', key: 'reference', width: 14 },
      { header: 'Ref ID', key: 'refId', width: 16 },
      { header: 'Usuario', key: 'user', width: 22 },
    ];

    for (const m of items) {
      sheet.addRow({
        date: m.createdAt
          ? new Date(m.createdAt).toISOString().slice(0, 10)
          : '',
        type: MOVEMENT_TYPE_LABEL[m.type] ?? m.type,
        sku: m.product?.sku ?? '',
        product: m.product?.name ?? '',
        warehouse: m.warehouse?.name ?? '',
        qty: m.qty,
        unitCost: m.unitCost != null ? Number(m.unitCost) : '',
        reference: m.reference ?? '',
        refId: m.refId ?? '',
        user: m.user?.name ?? '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'movimientos');
  }

  // Ronda 13 — listado de movimientos agrupados por transacción para la vista
  // de cards en /inventario/movimientos. Cada item del response es una "card"
  // ya joineada con su entidad padre (venta, compra, devolución, etc.).
  @Get('movements/cards')
  listMovementCards(@Query() query: ListMovementCardsQueryDto) {
    return this.svc.listMovementCards(query);
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
