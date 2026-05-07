// Espejo del validador del backend. La librería `libphonenumber-js` corre
// igual en browser y en node — usamos la versión "min" (~150 KB) que sigue
// validando todos los países pero no incluye metadata extendida.

import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

const DEFAULT_COUNTRY: CountryCode = 'CL';

export function normalizePhone(
  input: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string {
  if (!input) return input;
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (parsed && parsed.isValid()) return parsed.number; // E.164
  return input.trim();
}

export function isValidPhone(
  input: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): boolean {
  if (typeof input !== 'string') return false;
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  return Boolean(parsed?.isValid());
}

/** Formato internacional para mostrar: `+56 9 1234 5678`. */
export function formatPhonePretty(
  input: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string {
  if (!input) return '';
  const parsed = parsePhoneNumberFromString(input, defaultCountry);
  if (parsed && parsed.isValid()) return parsed.formatInternational();
  return input;
}
