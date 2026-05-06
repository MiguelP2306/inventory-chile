import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca un endpoint como accesible sin JWT. El JwtAuthGuard global lo detecta
// vía Reflector y omite la validación.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
