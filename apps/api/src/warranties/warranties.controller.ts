import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  CreateWarrantyClaimDto,
  ListWarrantyClaimsQueryDto,
  UpdateWarrantyClaimStatusDto,
} from './dto';
import { WarrantiesService } from './warranties.service';

@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly svc: WarrantiesService) {}

  @Get()
  list(@Query() query: ListWarrantyClaimsQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateWarrantyClaimDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.create(dto, user.sub);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWarrantyClaimStatusDto,
  ) {
    return this.svc.updateStatus(id, dto);
  }

  @Post(':id/link-return/:returnId')
  linkReturn(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('returnId', new ParseUUIDPipe()) returnId: string,
  ) {
    return this.svc.linkReturn(id, returnId);
  }
}
