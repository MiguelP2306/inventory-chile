import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { sendXlsx, stylizeSheet } from '../common/xlsx-export';
import {
  CreateSupplierDto,
  ListSupplierPurchasesQueryDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  list(@Query() query: ListSuppliersQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Exporta el listado de proveedores a XLSX respetando el filtro `q`. Ignora
   * paginación → exporta todos los matches.
   */
  @Get('export.xlsx')
  async exportXlsx(
    @Query() query: ListSuppliersQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.svc.list({ q: query.q });
    const items = Array.isArray(result) ? result : result.items;

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Proveedores');
    sheet.columns = [
      { header: 'RUT', key: 'taxId', width: 14 },
      { header: 'Nombre comercial', key: 'name', width: 32 },
      { header: 'Razón social', key: 'legalName', width: 32 },
      { header: 'Persona de contacto', key: 'contactPerson', width: 24 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Teléfono', key: 'phone', width: 18 },
      { header: 'Dirección', key: 'address', width: 36 },
      { header: 'Notas', key: 'notes', width: 40 },
      { header: 'Creado', key: 'createdAt', width: 12 },
    ];

    for (const s of items) {
      sheet.addRow({
        taxId: s.taxId ?? '',
        name: s.name,
        legalName: s.legalName ?? '',
        contactPerson: s.contactPerson ?? '',
        email: s.email ?? '',
        phone: s.phone ?? '',
        address: s.address ?? '',
        notes: s.notes ?? '',
        createdAt: s.createdAt
          ? new Date(s.createdAt).toISOString().slice(0, 10)
          : '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'proveedores');
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Get(':id/purchases')
  listPurchases(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListSupplierPurchasesQueryDto,
  ) {
    return this.svc.listPurchases(id, query);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
