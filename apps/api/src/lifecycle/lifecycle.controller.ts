import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { FollowUpQueryDto, MarkLostDto, TouchCustomerDto } from './dto';
import { LifecycleService } from './lifecycle.service';

/**
 * Endpoints de seguimiento comercial (Fase 8.5).
 *
 * - `GET /follow-ups` — lista paginada por tab.
 * - `POST /customers/:id/touch` — marcar contacto manual (mueve lastContactAt).
 * - `POST /customers/:id/mark-lost` — marcar cliente como perdido con motivo.
 */
@Controller()
export class LifecycleController {
  constructor(private readonly svc: LifecycleService) {}

  @Get('follow-ups')
  list(@Query() query: FollowUpQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Ronda 7 — histórico de eventos de un cliente (bitácora `lead_events`).
   * Lo usa la tab "Histórico" del detalle de cliente para mostrar la
   * timeline de creación de cotizaciones, envíos, marcado como perdido,
   * confirmación de venta, etc.
   */
  @Get('customers/:id/events')
  events(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.listEvents(id);
  }

  @Post('customers/:id/touch')
  async touch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() _dto: TouchCustomerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.touch(id, user.sub);
  }

  @Post('customers/:id/mark-lost')
  async markLost(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MarkLostDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.markLost(id, dto.reason, user.sub);
  }
}
