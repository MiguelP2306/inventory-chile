import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateVehicleMakeDto,
  CreateVehicleModelDto,
  UpdateVehicleMakeDto,
  UpdateVehicleModelDto,
} from './dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly svc: VehiclesService) {}

  // -------- makes --------
  @Get('makes')
  listMakes() {
    return this.svc.listMakes();
  }

  @Post('makes')
  createMake(@Body() dto: CreateVehicleMakeDto) {
    return this.svc.createMake(dto);
  }

  @Patch('makes/:id')
  updateMake(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVehicleMakeDto,
  ) {
    return this.svc.updateMake(id, dto);
  }

  @Delete('makes/:id')
  removeMake(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.removeMake(id);
  }

  // -------- models --------
  @Get('models')
  listModels(@Query('makeId') makeId?: string) {
    return this.svc.listModels(makeId);
  }

  @Post('models')
  createModel(@Body() dto: CreateVehicleModelDto) {
    return this.svc.createModel(dto);
  }

  @Patch('models/:id')
  updateModel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateVehicleModelDto,
  ) {
    return this.svc.updateModel(id, dto);
  }

  @Delete('models/:id')
  removeModel(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.removeModel(id);
  }
}
