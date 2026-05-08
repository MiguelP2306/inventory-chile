'use client';

import { Mail, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidPhone } from '@/lib/validators/phone';

type Channel = 'email' | 'whatsapp';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: Channel;
  defaultValue?: string;
  busy?: boolean;
  onConfirm: (to: string) => void | Promise<unknown>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SendContactDialog({
  open,
  onOpenChange,
  channel,
  defaultValue = '',
  busy = false,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }, [open, defaultValue]);

  const isEmail = channel === 'email';
  const title = isEmail ? 'Email del cliente' : 'Teléfono del cliente';
  const description = isEmail
    ? 'Ingresá el email donde querés enviar la cotización.'
    : 'Ingresá el teléfono para abrir WhatsApp con el mensaje listo.';
  const label = isEmail ? 'Email' : 'Teléfono';
  const placeholder = isEmail ? 'cliente@correo.cl' : '+56 9 1234 5678';
  const inputType = isEmail ? 'email' : 'tel';
  const Icon = isEmail ? Mail : MessageCircle;

  function validate(v: string): string | null {
    const trimmed = v.trim();
    if (!trimmed) return isEmail ? 'Ingresá un email' : 'Ingresá un teléfono';
    if (isEmail) {
      if (!EMAIL_RE.test(trimmed)) return 'Email inválido';
      return null;
    }
    if (!isValidPhone(trimmed)) {
      return 'Teléfono inválido (ej: +56 9 1234 5678)';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate(value);
    if (err) {
      setError(err);
      return;
    }
    await onConfirm(value.trim());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="space-y-2">
            <Label>{label}</Label>
            <Input
              autoFocus
              type={inputType}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={placeholder}
              disabled={busy}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
