import { UserRole } from '@inventory/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/types';
import {
  ChangeOwnPasswordDto,
  CreateUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateUserDto,
} from './dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  // Cambiar mi propia contraseña — accesible para ambos roles. Va arriba de
  // los handlers @Roles('ADMIN') para que el guard global no lo bloquee.
  @Patch('me/password')
  @HttpCode(200)
  changeOwnPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangeOwnPasswordDto,
  ) {
    return this.svc.changeOwnPassword(user.sub, dto);
  }

  // --- A partir de acá: solo ADMIN ---

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query() query: ListUsersQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @CurrentUser() actor: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.svc.update(id, dto, actor.sub);
  }

  @Patch(':id/password')
  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.svc.resetPassword(id, dto);
  }
}
