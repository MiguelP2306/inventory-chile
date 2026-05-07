import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const DEFAULT_COUNTRY: CountryCode = 'CL';

/**
 * Normaliza un teléfono al formato E.164 (`+56912345678`). Si la entrada no
 * trae prefijo internacional, asume Chile (`+56`). Si no se puede parsear,
 * devuelve la entrada limpia sin garantías — el validador previo evita que
 * llegue acá con basura.
 */
export function normalizePhone(input: string, defaultCountry: CountryCode = DEFAULT_COUNTRY): string {
  if (!input) return input;
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (parsed && parsed.isValid()) return parsed.number; // E.164
  return input.trim();
}

export function isValidPhone(input: string, defaultCountry: CountryCode = DEFAULT_COUNTRY): boolean {
  if (typeof input !== 'string') return false;
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  return Boolean(parsed?.isValid());
}

/**
 * Decorador class-validator para campos de teléfono. Acepta números con o sin
 * prefijo internacional; si falta, asume Chile. La normalización al guardar
 * se hace en el service.
 */
export function IsValidPhone(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: 'isValidPhone',
      target: target.constructor,
      propertyName,
      constraints: [],
      options: {
        message: 'Teléfono inválido (ej: +56 9 1234 5678)',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidPhone(value);
        },
        defaultMessage(args?: ValidationArguments) {
          return (args?.constraints?.[0] as string) ??
            'Teléfono inválido (ej: +56 9 1234 5678)';
        },
      },
    });
  };
}
