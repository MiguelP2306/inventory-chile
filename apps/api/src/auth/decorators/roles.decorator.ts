import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@inventory/shared';

export const ROLES_KEY = 'roles';

/**
 * Decorator para restringir un endpoint a uno o más roles.
 * Uso: `@Roles('ADMIN')` o `@Roles('ADMIN', 'USER')`.
 * El `RolesGuard` lee este metadata y compara contra `req.user.role`.
 * Si no se aplica el decorator, el endpoint queda accesible para
 * cualquier rol autenticado.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
