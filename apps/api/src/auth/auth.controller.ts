import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { AuthService, LoginResult } from './auth.service';
import type { JwtPayload, RefreshJwtPayload } from './types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() refreshPayload: RefreshJwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.refreshFor(refreshPayload.sub);
    this.setAuthCookies(res, result);
    return { user: result.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: JwtPayload) {
    return this.auth.getProfile(user.sub);
  }

  private setAuthCookies(res: Response, result: LoginResult) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    // En producción frontend (Vercel) y backend (Railway) viven en dominios
    // distintos → las cookies necesitan `SameSite=None; Secure` para sobrevivir
    // un request cross-site. En dev seguimos con `lax` (ambos en localhost).
    const base: CookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    };
    res.cookie('access_token', result.accessToken, {
      ...base,
      maxAge: 15 * 60 * 1000, // 15 min
      path: '/',
    });
    res.cookie('refresh_token', result.refreshToken, {
      ...base,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      path: '/api/auth',
    });
  }

  private clearAuthCookies(res: Response) {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    // En producción frontend (Vercel) y backend (Railway) viven en dominios
    // distintos → las cookies necesitan `SameSite=None; Secure` para sobrevivir
    // un request cross-site. En dev seguimos con `lax` (ambos en localhost).
    const base: CookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    };
    res.clearCookie('access_token', { ...base, path: '/' });
    res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
  }
}
