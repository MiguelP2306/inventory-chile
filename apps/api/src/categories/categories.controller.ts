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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  GetCategoryQueryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly svc: CategoriesService) {}

  @Get()
  list(@Query() query: ListCategoriesQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GetCategoryQueryDto,
  ) {
    return this.svc.getOne(id, query.withStats === true);
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
