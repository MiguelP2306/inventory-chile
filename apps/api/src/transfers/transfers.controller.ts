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
import {
  CancelTransferDto,
  CreateTransferDto,
  ListTransfersQueryDto,
} from './dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly svc: TransfersService) {}

  @Get()
  list(@Query() query: ListTransfersQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateTransferDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.cancel(id, dto, user.sub);
  }
}
