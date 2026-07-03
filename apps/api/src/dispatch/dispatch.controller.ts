import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { PdfService } from '../notifications/pdf.service';
import { SettingsService } from '../settings/settings.service';
import { DispatchService } from './dispatch.service';
import {
  CreateDispatchNoteDto,
  CreateIndependentDispatchNoteDto,
  ListDispatchNotesQueryDto,
  VoidDispatchNoteDto,
} from './dto';

@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly svc: DispatchService,
    private readonly pdf: PdfService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  list(@Query() query: ListDispatchNotesQueryDto) {
    return this.svc.list(query);
  }

  @Get('recent-carriers')
  recentCarriers() {
    return this.svc.recentCarriers();
  }

  /**
   * Devuelve la guía ACTIVA de una venta (o null). Lo usa el frontend para
   * decidir si pintar "Generar guía" o "Ver guía existente" en /ventas/[id].
   */
  @Get('by-sale/:saleId/active')
  findActiveBySale(@Param('saleId', new ParseUUIDPipe()) saleId: string) {
    return this.svc.findActiveBySale(saleId);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  /**
   * Prefill para convertir una guía INDEPENDIENTE en venta. Devuelve cliente +
   * items con el precio actual del producto. No crea nada — el frontend abre
   * "Nueva venta" precargada y la venta linkea la guía al confirmarse.
   */
  @Get(':id/convert')
  convert(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.convert(id);
  }

  @Post()
  create(
    @Body() dto: CreateDispatchNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(dto, user.sub);
  }

  /** Crea una guía de despacho independiente (sin venta previa). */
  @Post('independent')
  createIndependent(
    @Body() dto: CreateIndependentDispatchNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createIndependent(dto, user.sub);
  }

  @Post(':id/void')
  voidNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VoidDispatchNoteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.voidNote(id, dto, user.sub);
  }

  @Get(':id/pdf')
  async getPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('format') format: 'letter' | 'thermal80' | undefined,
    @Res() res: Response,
  ) {
    const note = await this.svc.getOne(id);
    const settings = await this.settings.get();
    const buffer = await this.pdf.generateDispatch(
      this.pdf.fromDispatchNoteDto(note, settings),
      format ?? 'letter',
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${note.number}.pdf"`,
    );
    res.send(buffer);
  }
}
