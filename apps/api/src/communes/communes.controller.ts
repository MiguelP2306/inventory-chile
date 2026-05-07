import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CommunesService } from './communes.service';

@Controller('communes')
export class CommunesController {
  constructor(private readonly svc: CommunesService) {}

  @Get()
  list(@Query('region') region?: string) {
    return this.svc.list(region);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }
}
