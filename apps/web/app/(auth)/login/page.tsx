'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type FormValues = z.infer<typeof schema>;

// Grano sutil — SVG noise inline para no depender de assets externos.
const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")";

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await api.post('/auth/login', values);
      router.replace('/');
      router.refresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'No pudimos iniciar sesión. Reintentá.';
      setServerError(message);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f6f5f1] px-4 py-8 text-neutral-900">
      {/* Aurora mesh — gradientes radiales muy desaturados */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(60% 50% at 12% 18%, rgba(180,200,230,0.55), transparent 70%)',
            'radial-gradient(45% 38% at 88% 12%, rgba(255,222,200,0.55), transparent 70%)',
            'radial-gradient(55% 55% at 78% 92%, rgba(220,200,230,0.45), transparent 70%)',
            'radial-gradient(40% 40% at 28% 95%, rgba(210,230,215,0.45), transparent 70%)',
          ].join(','),
        }}
      />
      {/* Grano */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 mix-blend-multiply"
        style={{ backgroundImage: NOISE }}
      />

      {/* Píldora de estado */}
      {/* <div className="absolute right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/60 px-2.5 py-1 pl-2 text-[11px] font-medium text-neutral-600 backdrop-blur">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-0 inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-35" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
        </span>
        Todos los sistemas operativos
      </div> */}

      {/* Card glass */}
      <div className="relative z-10 w-full max-w-md">
        <div className="relative overflow-hidden rounded-[20px] border border-white/65 bg-white/60 p-8 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(11,11,12,0.04),0_18px_40px_-16px_rgba(11,11,12,0.14),0_36px_80px_-28px_rgba(11,11,12,0.16)] backdrop-blur-2xl backdrop-saturate-150">
          {/* Brillo superior del borde (gradient stroke) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[20px]"
            style={{
              padding: 1,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0))',
              WebkitMask:
                'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />

          {/* Marca */}
          <div className="mb-7 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-neutral-900 to-neutral-700 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_6px_14px_-6px_rgba(11,11,12,0.4)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="4" stroke="#fff" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="3.2" stroke="#fff" strokeWidth="1.8" />
                <path
                  d="M12 6.5V3M12 21v-3.5M6.5 12H3M21 12h-3.5"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="text-[15px] font-semibold tracking-tight">
              Inventario{' '}
              <span className="font-normal text-neutral-500">· Repuestos</span>
            </div>
          </div>

          {/* Título */}
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            Bienvenido de vuelta
          </h1>
          <p className="mb-7 text-sm leading-relaxed text-neutral-600">
            Ingresá con tu cuenta de administrador para continuar.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-neutral-900">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="vos@empresa.cl"
                className={cn(
                  'h-11 rounded-xl border-neutral-200/80 bg-white/60 px-3.5 text-sm text-neutral-900 placeholder:text-neutral-400',
                  'transition-colors hover:border-neutral-300',
                  'focus-visible:border-neutral-700 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-neutral-900/[0.06]',
                  errors.email &&
                  'border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/15',
                )}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-[12px] text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-neutral-900">
                  Contraseña
                </Label>
                {/* <a
                  href="#"
                  className="text-[12px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 hover:underline hover:underline-offset-[3px]"
                >
                  ¿Olvidaste tu contraseña?
                </a> */}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(
                    'h-11 rounded-xl border-neutral-200/80 bg-white/60 px-3.5 pr-11 text-sm text-neutral-900 placeholder:text-neutral-400',
                    'transition-colors hover:border-neutral-300',
                    'focus-visible:border-neutral-700 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-neutral-900/[0.06]',
                    errors.password &&
                    'border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/15',
                  )}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-black/[0.04] hover:text-neutral-900"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-[12px] text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                {serverError}
              </p>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'group mt-5 h-[46px] w-full gap-2 rounded-xl bg-neutral-900 text-sm font-medium text-white',
                'shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_1px_2px_rgba(11,11,12,0.2),0_12px_28px_-10px_rgba(11,11,12,0.5)]',
                'transition-all hover:bg-neutral-800 hover:text-white hover:shadow-[0_1px_0_rgba(255,255,255,0.2)_inset,0_2px_4px_rgba(11,11,12,0.22),0_18px_36px_-10px_rgba(11,11,12,0.55)]',
                'active:translate-y-px',
                'disabled:opacity-70',
              )}
            >
              {isSubmitting ? (
                'Ingresando…'
              ) : (
                <>
                  <span>Ingresar</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </form>

          {/* Footer del card */}
          <div className="mt-5 flex items-center justify-center gap-2 text-[11.5px] text-neutral-500">
            <span>Acceso restringido · personal autorizado</span>
            <span className="h-[3px] w-[3px] rounded-full bg-current opacity-50" />
            <a
              href="#"
              className="text-neutral-600 transition-colors hover:text-neutral-900"
            >
              Soporte
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
