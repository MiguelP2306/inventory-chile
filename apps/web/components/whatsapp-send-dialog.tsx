'use client';

import { MessageCircle, Phone, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  SoftModal,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Número registrado del cliente (E.164) o null si no tiene. */
  registeredPhone: string | null;
  busy?: boolean;
  /**
   * Dispara el envío. `choose=true` abre WhatsApp SIN número (el usuario elige
   * el contacto). `to` envía a un número puntual escrito a mano. Sin nada, usa
   * el número registrado.
   */
  onSend: (opts: { to?: string; choose?: boolean }) => void;
}

/**
 * Fase 12 — selector de destino de WhatsApp. El usuario elige entre:
 *   1. Enviar al número registrado del cliente (si tiene).
 *   2. Elegir el contacto en WhatsApp (abre WhatsApp sin número).
 *   3. Escribir otro número a mano.
 */
export function WhatsappSendDialog({
  open,
  onOpenChange,
  registeredPhone,
  busy,
  onSend,
}: Props) {
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (open) setCustom('');
  }, [open]);

  const optionClass =
    'flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-[#25D366]/50 hover:bg-[#25D366]/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900';

  return (
    <SoftModal
      open={open}
      onOpenChange={onOpenChange}
      title="Enviar por WhatsApp"
      subtitle="Elegí a dónde mandar el mensaje"
      icon={<MessageCircle className="h-5 w-5" />}
    >
      <div className="space-y-3 p-5">
        {registeredPhone && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSend({})}
            className={optionClass}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#128C7E]">
              <Phone className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Enviar al número del cliente
              </span>
              <span className="block font-mono text-xs text-slate-500 dark:text-slate-400">
                {registeredPhone}
              </span>
            </span>
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => onSend({ choose: true })}
          className={optionClass}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Users className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Elegir contacto en WhatsApp
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Abre WhatsApp con el mensaje listo y vos elegís a quién enviarlo.
            </span>
          </span>
        </button>

        {/* Número manual */}
        <div className="rounded-xl border border-dashed border-slate-200 p-3 dark:border-slate-800">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            …o enviar a otro número
          </label>
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="+56 9 1234 5678"
              className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#25D366] dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              disabled={busy || custom.trim() === ''}
              onClick={() => onSend({ to: custom.trim() })}
              className="rounded-lg bg-[#128C7E] px-3 text-xs font-bold text-white transition-colors hover:bg-[#0e6b60] disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className={softSecondaryButtonClass}
          >
            Cancelar
          </button>
        </div>
      </div>
    </SoftModal>
  );
}
