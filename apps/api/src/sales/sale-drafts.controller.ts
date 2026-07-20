import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import { SaveSaleDraftDto } from './dto';
import { SaleDraftsService } from './sale-drafts.service';

/**
 * Ventas parkeadas. Ruta propia (`/sale-drafts`) y no `/sales/drafts` para no
 * competir con `GET /sales/:id`, que tiene un ParseUUIDPipe y rechazaría el
 * literal "drafts" con un 400 confuso.
 *
 * Sin chequeos de autoría: los borradores son del negocio y cualquier
 * vendedor puede retomarlos o descartarlos.
 */
@Controller('sale-drafts')
export class SaleDraftsController {
  constructor(private readonly svc: SaleDraftsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: SaveSaleDraftDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SaveSaleDraftDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.svc.remove(id);
  }
}
