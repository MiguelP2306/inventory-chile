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
import { ImportsService } from './imports.service';

const MAX_XLSX_BYTES = 5 * 1024 * 1024; // 5 MB
const XLSX_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // algunos browsers no setean el mime real
];

/**
 * Fase 10 — Endpoints de carga masiva. Multer en memoria (no se persiste el
 * .xlsx en disco): el archivo se procesa y se descarta. El operador puede
 * re-subir si necesita corregir.
 */
@Controller('imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @Post('products/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_XLSX_BYTES },
    }),
  )
  preview(@UploadedFile() file?: Express.Multer.File) {
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
  confirm(@UploadedFile() file?: Express.Multer.File) {
    validateXlsx(file);
    return this.svc.confirm(file!.buffer);
  }

  @Get('products/template.xlsx')
  async template(@Res() res: Response) {
    const buf = await this.svc.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla-productos.xlsx"',
    );
    res.send(buf);
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
