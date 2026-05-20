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
import { ListSupplierCreditsQueryDto, ManualSupplierCreditDto } from './dto';
import { SupplierCreditsService } from './supplier-credits.service';

@Controller('supplier-credits')
export class SupplierCreditsController {
  constructor(private readonly svc: SupplierCreditsService) {}

  @Get()
  list(@Query() query: ListSupplierCreditsQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Créditos ACTIVOS y con balance > 0 de un proveedor. Lo consume el form
   * de compra para mostrar la sección "Aplicar crédito disponible".
   */
  @Get('available/:supplierId')
  available(@Param('supplierId', new ParseUUIDPipe()) supplierId: string) {
    return this.svc.listAvailableForSupplier(supplierId);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  createManual(
    @Body() dto: ManualSupplierCreditDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.createManual(dto, user.sub);
  }

  @Post(':id/void')
  voidCredit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.voidCredit(id);
  }
}
