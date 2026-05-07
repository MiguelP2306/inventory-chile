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
import { BrandsService } from './brands.service';
import { CreateBrandDto, ListBrandsQueryDto, UpdateBrandDto } from './dto';

@Controller('brands')
export class BrandsController {
  constructor(private readonly svc: BrandsService) {}

  @Get()
  list(@Query() query: ListBrandsQueryDto) {
    return this.svc.list(query);
  }

  @Post()
  create(@Body() dto: CreateBrandDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateBrandDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
