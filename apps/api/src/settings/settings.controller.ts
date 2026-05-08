import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateCompanySettingsDto } from './dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get('company')
  get() {
    return this.svc.get();
  }

  @Patch('company')
  update(@Body() dto: UpdateCompanySettingsDto) {
    return this.svc.update(dto);
  }
}
