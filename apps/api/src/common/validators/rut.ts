import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Normaliza un RUT chileno al formato canónico `12345678-9`:
 * - sin puntos
 * - con guión separador
 * - dígito verificador en mayúscula (K, no k)
 * - sin espacios
 *
 * Si la entrada no parece un RUT, devuelve el string limpio sin tocar más.
 */
export function normalizeRut(input: string): string {
  if (!input) return input;
  const cleaned = input.replace(/[.\s]/g, '').toUpperCase();
  if (!cleaned.includes('-') && cleaned.length >= 2) {
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    return `${body}-${dv}`;
  }
  return cleaned;
}

/**
 * Calcula el dígito verificador esperado para un cuerpo de RUT (solo dígitos).
 * Devuelve '0'..'9' o 'K'.
 */
export function computeRutDv(body: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  if (mod === 11) return '0';
  if (mod === 10) return 'K';
  return String(mod);
}

/**
 * Valida un RUT chileno: formato + dígito verificador (módulo 11).
 * Acepta el RUT con o sin puntos, con guión obligatorio.
 */
export function isValidRut(input: string): boolean {
  if (typeof input !== 'string') return false;
  const normalized = normalizeRut(input);
  // Cuerpo entre 7 y 8 dígitos, DV un dígito o K
  const match = /^(\d{7,8})-([0-9K])$/.exec(normalized);
  if (!match) return false;
  const [, body, dv] = match;
  return computeRutDv(body!) === dv;
}

/**
 * Decorador class-validator para campos RUT. Acepta tanto formato con puntos
 * como sin puntos. La normalización al guardar es responsabilidad del
 * service (se llama `normalizeRut()` antes de persistir).
 */
export function IsValidRut(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isValidRut',
      target: target.constructor,
      propertyName,
      constraints: [],
      options: {
        message: 'RUT inválido (formato esperado: 12345678-9)',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidRut(value);
        },
        defaultMessage(args?: ValidationArguments) {
          return (args?.constraints?.[0] as string) ??
            'RUT inválido (formato esperado: 12345678-9)';
        },
      },
    });
  };
}
