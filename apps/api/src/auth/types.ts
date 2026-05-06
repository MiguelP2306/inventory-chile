import type { UserRole } from '@inventory/shared';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
}

export interface RefreshJwtPayload {
  sub: string;
}
