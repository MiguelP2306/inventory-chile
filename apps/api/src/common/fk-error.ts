import { ConflictException } from '@nestjs/common';

const FK_CODES = new Set([
  'ER_ROW_IS_REFERENCED_2',
  'ER_ROW_IS_REFERENCED',
  '23503', // postgres
]);

/**
 * Si `err` es una violación de clave foránea de MySQL (delete que falla por
 * registros dependientes), lanza una `ConflictException` con un mensaje claro.
 * Si no, re-lanza el error original.
 */
export function rethrowFkAsConflict(err: unknown, message: string): never {
  const code = (err as { code?: string }).code;
  if (code && FK_CODES.has(code)) {
    throw new ConflictException(message);
  }
  throw err as Error;
}
