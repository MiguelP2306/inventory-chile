import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@inventory/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../types';

/**
 * Bloquea el acceso al handler si `req.user.role` no está en la lista
 * declarada con `@Roles(...)`. Si no hay `@Roles`, permite el acceso
 * (control fino solo se aplica donde explícitamente se restringe).
 *
 * Debe registrarse DESPUÉS de `JwtAuthGuard` para que `req.user` exista.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('No autenticado');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('No tenés permisos para esta acción');
    }
    return true;
  }
}
