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
  CreateSupplierDto,
  ListSupplierPurchasesQueryDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  @Get()
  list(@Query() query: ListSuppliersQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Get(':id/purchases')
  listPurchases(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListSupplierPurchasesQueryDto,
  ) {
    return this.svc.listPurchases(id, query);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
