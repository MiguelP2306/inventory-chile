import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsValidRut } from '../common/validators/rut';

export class UpdateCompanySettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  // RUT de la empresa. Opcional, pero si viene debe ser un RUT chileno válido
  // (formato + DV). El service normaliza al guardar.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @IsValidRut()
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  quotationFooter?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  defaultValidityDays?: number;

  // Tasa decimal entre 0 y 1, hasta 4 decimales (formato 0.1900).
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  taxRate?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  cardCommissionRate?: string;

  // Ronda 9 — Comisiones desdobladas por método de pago. Cada uno se descuenta
  // automáticamente como egreso de caja al confirmar la venta con el método
  // correspondiente. `cardCommissionRate` arriba es legacy y se mantiene en
  // schema pero la UI nueva no la edita más.
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  cardDebitCommissionRate?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  cardCreditCommissionRate?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false })
  paymentLinkCommissionRate?: string;

  // Lead time default (Fase 8). Días de cobertura por debajo de los cuales un
  // producto se marca crítico en /proyeccion.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  defaultLeadTimeDays?: number;

  // ---------- Fase 8.5 ----------

  // Horas para agendar el primer follow-up tras una cotización.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  followUpHoursDefault?: number;

  // Toggle global del sync a HubSpot.
  @IsOptional()
  @IsBoolean()
  hubspotEnabled?: boolean;

  // Owner ID en HubSpot al que se asignan los contactos nuevos.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  hubspotDefaultOwnerId?: string | null;

  // Plantilla de mensaje WhatsApp usada en `/seguimiento`. Soporta tokens
  // {cliente}, {cotizacion}, {total}, {link}.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  whatsappFollowUpTemplate?: string | null;
}
