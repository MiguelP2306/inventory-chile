import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { CustomersImportService } from './customers-import.service';
import { ImportsService } from './imports.service';
import { SuppliersImportService } from './suppliers-import.service';

const MAX_XLSX_BYTES = 5 * 1024 * 1024; // 5 MB
const XLSX_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // algunos browsers no setean el mime real
];

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Fase 10 — Endpoints de carga masiva. Multer en memoria (no se persiste el
 * .xlsx en disco): el archivo se procesa y se descarta. El operador puede
 * re-subir si necesita corregir.
 *
 * Polish Mayo 2026: mismo patrón de productos extendido a clientes y
 * proveedores (UPSERT por RUT con partial success).
 */
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly svc: ImportsService,
    private readonly customers: CustomersImportService,
    private readonly suppliers: SuppliersImportService,
  ) {}

  // ============= Productos =============

  @Post('products/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XLSX_BYTES },
    }),
  )
  previewProducts(@UploadedFile() file?: Express.Multer.File) {
    validateXlsx(file);
    return this.svc.preview(file!.buffer);
  }

  @Post('products/confirm')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XLSX_BYTES },
    }),
  )
  confirmProducts(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    validateXlsx(file);
    return this.svc.confirm(file!.buffer, user.sub);
  }

  @Get('products/template.xlsx')
  async productsTemplate(@Res() res: Response) {
    const buf = await this.svc.generateTemplate();
    sendTemplate(res, buf, 'plantilla-productos.xlsx');
  }

  // ============= Clientes =============

  @Post('customers/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XLSX_BYTES },
    }),
  )
  previewCustomers(@UploadedFile() file?: Express.Multer.File) {
    validateXlsx(file);
    return this.customers.preview(file!.buffer);
  }

  @Post('customers/confirm')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XLSX_BYTES },
    }),
  )
  confirmCustomers(@UploadedFile() file?: Express.Multer.File) {
    validateXlsx(file);
    return this.customers.confirm(file!.buffer);
  }

  @Get('customers/template.xlsx')
  async customersTemplate(@Res() res: Response) {
    const buf = await this.customers.generateTemplate();
    sendTemplate(res, buf, 'plantilla-clientes.xlsx');
  }

  // ============= Proveedores =============

  @Post('suppliers/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XLSX_BYTES },
    }),
  )
  previewSuppliers(@UploadedFile() file?: Express.Multer.File) {
    validateXlsx(file);
    return this.suppliers.preview(file!.buffer);
  }

  @Post('suppliers/confirm')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XLSX_BYTES },
    }),
  )
  confirmSuppliers(@UploadedFile() file?: Express.Multer.File) {
    validateXlsx(file);
    return this.suppliers.confirm(file!.buffer);
  }

  @Get('suppliers/template.xlsx')
  async suppliersTemplate(@Res() res: Response) {
    const buf = await this.suppliers.generateTemplate();
    sendTemplate(res, buf, 'plantilla-proveedores.xlsx');
  }
}

function validateXlsx(file?: Express.Multer.File): void {
  if (!file) throw new BadRequestException('Archivo requerido (campo "file")');
  if (file.size === 0) throw new BadRequestException('Archivo vacío');
  if (!XLSX_MIMES.includes(file.mimetype)) {
    throw new BadRequestException(
      `Tipo de archivo no permitido (${file.mimetype}). Solo .xlsx.`,
    );
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException(
      'El archivo debe tener extensión .xlsx (Excel moderno).',
    );
  }
}

function sendTemplate(res: Response, buf: Buffer, filename: string): void {
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}
