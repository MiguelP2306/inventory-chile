/* ============================================================================
 *  Brand — marca oficial "Autopartes Gran Pacífico".
 *
 *  Centraliza el logo (variantes claro/oscuro) y el título de la marca para
 *  reusarlos en todo el chrome de la app (sidebar, mobile nav, ayuda, login,
 *  404) y en la cara pública (cotización). Así, si el logo o el nombre
 *  cambian, se tocan en un solo lugar.
 *
 *  Activos en `public/`:
 *   · logo_sin_fondo.png         → lockup oscuro, fondo transparente (modo claro)
 *   · logo_sin_fondo_blanco.png  → lockup blanco,  fondo transparente (modo oscuro)
 * ========================================================================== */

import Image from 'next/image';
import { cn } from '@/lib/utils';

export const BRAND_NAME = 'Autopartes Gran Pacífico';

/** Relación de aspecto (ancho/alto) del lockup. */
const LOGO_RATIO = 1.42;

/**
 * Emblema del logo. Muestra la variante oscura en modo claro y la blanca en
 * modo oscuro (toggle por clases Tailwind, sin JS). `height` en px; el ancho
 * se deriva de la relación de aspecto.
 *
 * Si `forceLight` es true (p. ej. la vista pública que siempre va en claro),
 * fija la variante oscura del lockup sin atender al tema.
 */
export function BrandMark({
  height = 36,
  className,
  priority,
  forceLight,
  onDarkSurface,
}: {
  height?: number;
  className?: string;
  priority?: boolean;
  forceLight?: boolean;
  /**
   * El lockup va sobre una superficie oscura o de color en AMBOS temas (el
   * sidebar, que en claro es azul de marca). Fija la variante blanca: acá el
   * toggle por tema no sirve, porque en modo claro elegiría el lockup oscuro
   * y quedaría ilegible sobre el azul.
   */
  onDarkSurface?: boolean;
}) {
  const width = Math.round(height * LOGO_RATIO);

  if (onDarkSurface) {
    return (
      <span
        className={cn('relative inline-flex shrink-0', className)}
        style={{ width, height }}
      >
        <Image
          src="/logo_sin_fondo_blanco.png"
          alt={BRAND_NAME}
          fill
          sizes={`${width}px`}
          priority={priority}
          className="object-contain"
        />
      </span>
    );
  }

  if (forceLight) {
    return (
      <span
        className={cn('relative inline-flex shrink-0', className)}
        style={{ width, height }}
      >
        <Image
          src="/logo_sin_fondo.png"
          alt={BRAND_NAME}
          fill
          sizes={`${width}px`}
          priority={priority}
          className="object-contain"
        />
      </span>
    );
  }

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width, height }}
    >
      <Image
        src="/logo_sin_fondo.png"
        alt={BRAND_NAME}
        fill
        sizes={`${width}px`}
        priority={priority}
        className="object-contain dark:hidden"
      />
      <Image
        src="/logo_sin_fondo_blanco.png"
        alt=""
        aria-hidden
        fill
        sizes={`${width}px`}
        priority={priority}
        className="hidden object-contain dark:block"
      />
    </span>
  );
}

/**
 * Marca compacta = emblema + título (y subtítulo opcional). Reemplaza el patrón
 * "caja de ícono + nombre" del chrome. Usá `<BrandMark>` directo cuando quieras
 * solo el logo (contextos grandes donde el lockup ya es legible).
 */
export function Brand({
  subtitle,
  height = 34,
  priority,
  className,
  onDarkSurface,
}: {
  subtitle?: string;
  height?: number;
  priority?: boolean;
  className?: string;
  /**
   * Sobre superficie oscura/de color (sidebar). El texto pasa a heredar el
   * color del contenedor en vez de fijarlo, así Brand no necesita conocer los
   * tokens `--sidebar*` y sirve para cualquier superficie futura.
   */
  onDarkSurface?: boolean;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark
        height={height}
        priority={priority}
        onDarkSurface={onDarkSurface}
      />
      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            'block text-[13.5px] font-bold leading-tight tracking-tight',
            onDarkSurface
              ? 'text-current'
              : 'text-slate-900 dark:text-white',
          )}
        >
          {BRAND_NAME}
        </span>
        {subtitle && (
          <span
            className={cn(
              'block truncate text-[10px] font-medium',
              onDarkSurface
                ? 'text-current opacity-70'
                : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
