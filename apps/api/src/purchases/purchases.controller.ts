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
import { CreatePurchaseEntryDto, ListPurchasesQueryDto } from './dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly svc: PurchasesService) {}

  @Get()
  list(@Query() query: ListPurchasesQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreatePurchaseEntryDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }
}
