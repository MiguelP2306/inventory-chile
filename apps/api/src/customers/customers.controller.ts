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
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto';

const LIFECYCLE_LABEL: Record<string, string> = {
  NEW: 'Nuevo',
  QUOTED: 'Cotizado',
  FOLLOW_UP: 'Seguimiento',
  WON: 'Ganado',
  LOST: 'Perdido',
};

const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  PHONE: 'Teléfono',
  IN_PERSON: 'Mostrador',
  OTHER: 'Otro',
};

@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Exporta el listado de clientes a XLSX respetando el filtro `q` (búsqueda
   * libre por nombre/RUT/email/teléfono). Ignora paginación → exporta todos
   * los matches.
   */
  @Get('export.xlsx')
  async exportXlsx(
    @Query() query: ListCustomersQueryDto,
    @Res() res: Response,
  ) {
    // Pedimos sin paginar — el service devuelve array completo.
    const result = await this.svc.list({ q: query.q });
    const items = Array.isArray(result) ? result : result.items;

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Clientes');
    sheet.columns = [
      { header: 'RUT', key: 'taxId', width: 14 },
      { header: 'Nombre', key: 'name', width: 32 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Teléfono', key: 'phone', width: 18 },
      { header: 'WhatsApp', key: 'whatsapp', width: 18 },
      { header: 'Dirección', key: 'street', width: 28 },
      { header: 'Número', key: 'number', width: 10 },
      { header: 'Comuna', key: 'commune', width: 22 },
      { header: 'Región', key: 'region', width: 22 },
      { header: 'Origen', key: 'source', width: 14 },
      { header: 'Lifecycle', key: 'lifecycle', width: 14 },
      { header: 'Último contacto', key: 'lastContact', width: 18 },
      { header: 'Notas internas', key: 'notes', width: 40 },
      { header: 'Creado', key: 'createdAt', width: 12 },
    ];

    for (const c of items) {
      sheet.addRow({
        taxId: c.taxId ?? '',
        name: c.name,
        email: c.email ?? '',
        phone: c.phone ?? '',
        whatsapp: c.whatsappPhone ?? '',
        street: c.addressStreet ?? '',
        number: c.addressNumber ?? '',
        commune: c.commune?.name ?? '',
        region: c.commune?.region ?? '',
        source: SOURCE_LABEL[c.source] ?? c.source ?? '',
        lifecycle: LIFECYCLE_LABEL[c.lifecycleStatus] ?? c.lifecycleStatus ?? '',
        lastContact: c.lastContactAt
          ? new Date(c.lastContactAt).toISOString().slice(0, 10)
          : '',
        notes: c.internalNotes ?? '',
        createdAt: c.createdAt
          ? new Date(c.createdAt).toISOString().slice(0, 10)
          : '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'clientes');
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
