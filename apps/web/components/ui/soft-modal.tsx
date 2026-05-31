'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * SoftModal — shell de modal "Soft Card" replicando el look del modal de
 * /almacenes (Nueva Bodega):
 *  · Overlay oscuro con blur.
 *  · Contenedor rounded-3xl, borde suave, sombra.
 *  · Header con franja bg-slate-50/50, título font-black + subtítulo + X.
 *  · Acento azul #2F6BFF.
 *
 * Está construido sobre @radix-ui/react-dialog para conservar accesibilidad
 * (focus-trap, Esc para cerrar, scroll-lock). Solo cambia lo VISUAL respecto
 * a los dialogs previos; la lógica (open/onOpenChange) es la misma de Radix.
 *
 * El `children` controla su propio padding (usar `p-5`). Para forms, las
 * constantes `softLabelClass` / `softInputClass` / `softPrimaryButtonClass`
 * replican el estilo de los campos y el botón de acción de la referencia.
 */

const SIZE: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl',
  '3xl': 'max-w-4xl',
  '4xl': 'max-w-5xl',
};

export type SoftModalSize = keyof typeof SIZE;

export const softLabelClass =
  'text-[10px] font-extrabold uppercase tracking-wider text-slate-400';

export const softInputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:border-slate-800 dark:bg-slate-900 dark:text-white';

export const softPrimaryButtonClass =
  'w-full rounded-2xl bg-[#2F6BFF] py-3.5 text-center text-xs font-black text-white shadow-md transition-colors hover:bg-opacity-95 disabled:cursor-not-allowed disabled:opacity-50';

export const softSecondaryButtonClass =
  'rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900';

export const softDestructiveButtonClass =
  'rounded-2xl bg-rose-600 px-4 py-2.5 text-center text-xs font-black text-white shadow-md transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Aplica el look soft (rounded-xl + bg-slate-50 + acento azul al focus) a
 * TODOS los campos descendientes de un contenedor, sin tocar los componentes
 * de form compartidos. Pensado para envolver un form dentro de un modal: como
 * Radix portaliza los dropdowns de Select/Popover fuera del contenedor, solo
 * se restylean los campos in-place (inputs de texto/número/fecha, textareas y
 * el trigger de Select), nunca los menús ni las páginas full-screen que usan
 * el mismo form sin este wrapper.
 */
export const softFormFieldsClass =
  '[&_input:not([type=checkbox]):not([type=radio])]:rounded-xl [&_input:not([type=checkbox]):not([type=radio])]:border-slate-200 [&_input:not([type=checkbox]):not([type=radio])]:bg-slate-50 [&_input:not([type=checkbox]):not([type=radio])]:focus-visible:border-[#2F6BFF] [&_input:not([type=checkbox]):not([type=radio])]:focus-visible:ring-[#2F6BFF]/15 dark:[&_input:not([type=checkbox]):not([type=radio])]:border-slate-800 dark:[&_input:not([type=checkbox]):not([type=radio])]:bg-slate-900 ' +
  '[&_textarea]:rounded-xl [&_textarea]:border-slate-200 [&_textarea]:bg-slate-50 [&_textarea]:focus-visible:border-[#2F6BFF] [&_textarea]:focus-visible:ring-[#2F6BFF]/15 dark:[&_textarea]:border-slate-800 dark:[&_textarea]:bg-slate-900 ' +
  '[&_[role=combobox]]:rounded-xl [&_[role=combobox]]:border-slate-200 [&_[role=combobox]]:bg-slate-50 dark:[&_[role=combobox]]:border-slate-800 dark:[&_[role=combobox]]:bg-slate-900';

interface SoftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Ícono opcional a la izquierda del título (lucide). */
  icon?: ReactNode;
  size?: SoftModalSize;
  children: ReactNode;
  /** Clases extra para el contenedor del Content. */
  contentClassName?: string;
  /** Oculta el botón X del header. */
  hideClose?: boolean;
}

export function SoftModal({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  size = 'md',
  children,
  contentClassName,
  hideClose,
}: SoftModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={subtitle ? undefined : undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 dark:border-slate-800 dark:bg-[#11151C]',
            SIZE[size],
            contentClassName,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/10">
            <div className="flex min-w-0 items-center gap-3">
              {icon && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2F6BFF]/10 text-[#2F6BFF] dark:bg-[#2F6BFF]/15">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate text-sm font-black text-slate-900 dark:text-white">
                  {title}
                </DialogPrimitive.Title>
                {subtitle && (
                  <DialogPrimitive.Description className="truncate text-[11px] text-slate-400">
                    {subtitle}
                  </DialogPrimitive.Description>
                )}
              </div>
            </div>
            {!hideClose && (
              <DialogPrimitive.Close className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
                <span className="sr-only">Cerrar</span>
              </DialogPrimitive.Close>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
