'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BrandMark, BRAND_NAME } from '@/components/brand';
import { api } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

type FormValues = z.infer<typeof schema>;

/**
 * /login — Rediseño UI (look de Login.tsx: card 2 columnas + carrusel).
 *
 * SOLO UI/UX. La lógica de autenticación es idéntica a la versión previa:
 *  · react-hook-form + zodResolver (email + password).
 *  · api.post('/auth/login', values) → router.replace('/') + refresh.
 *  · serverError + showPassword.
 *
 * Cambios visuales: card rounded-3xl de 2 columnas. Izquierda = formulario
 * (pill de marca, título, inputs estilizados, toggle "Recuérdame", botón
 * índigo). Derecha = hero oscuro con carrusel auto-rotativo y dots.
 *
 * NOTAS (controles del mock que NO existían en tu lógica):
 *  · "Recuérdame": estado local visual. NO altera el submit. Si querés que
 *    persista la sesión, conectalo a tu flujo de auth (marcado abajo).
 *  · "¿Olvidaste tu contraseña?" y "Google Sign In": stubs marcados con TODO.
 *    Los dejé porque son parte del diseño; conectá tus endpoints reales o
 *    eliminálos si no aplican. Un click hoy no dispara backend.
 *  · Imagen del hero: cada slide del carrusel tiene su foto en /public/login
 *    (taller.jpg, stock.jpg, punto-de-venta.jpg), renderizada con next/image
 *    (fill + sizes, priority en la primera) y crossfade entre slides. El
 *    gradiente del <div data-hero-bg> queda como fallback mientras cargan.
 */

const CAROUSEL_SLIDES = [
  {
    title: 'Potencia tu taller.',
    description:
      'Abastecimiento ágil e inmediato de repuestos automotrices, optimizando los tiempos de reparación.',
    image: '/login/taller.jpg',
  },
  {
    title: 'Control de stock milimétrico.',
    description:
      'Actualización en tiempo real del inventario en múltiples bodegas para que nunca te quedes sin repuestos.',
    image: '/login/stock.jpg',
  },
  {
    title: 'Punto de venta ultra veloz.',
    description:
      'Factura, vende y emite comprobantes electrónicos de forma instantánea con el ERP preferido para talleres en Chile.',
    image: '/login/punto-de-venta.jpg',
  },
];

const ACCENT = '#2F6BFF';

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true); // visual-only (ver NOTAS)
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
      // TODO (opcional): si "Recuérdame" debe persistir sesión, pasá
      // rememberMe a tu endpoint/almacenamiento aquí.
      await api.post('/auth/login', values);
      router.replace('/');
      router.refresh();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No pudimos iniciar sesión. Reintentá.';
      setServerError(message);
    }
  };

  const inputCls =
    'w-full text-xs font-semibold px-4 py-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-[#2F6BFF] transition-all';

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#F3F4F6] p-3 font-sans dark:bg-[#0B0E14] sm:p-6">
      <div className="flex min-h-[600px] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl dark:border-slate-800/80 dark:bg-[#121620] md:flex-row">
        {/* ============================================================
            LEFT — FORM
            ============================================================ */}
        <div className="flex w-full flex-col justify-between bg-white p-8 dark:bg-[#121620] sm:p-12 md:w-1/2">
          {/* Marca — logo + título centrados, uno debajo del otro */}
          <div className="mb-10 flex flex-col items-center gap-1 md:mb-0">
            <BrandMark height={92} priority />
            {/* <span className="text-center text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {BRAND_NAME}
            </span> */}
          </div>

          {/* Form */}
          <div className="my-auto mx-auto w-full max-w-sm py-4">
            <h1 className="mb-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              ¡Bienvenido de vuelta!
            </h1>
            <p className="mb-8 text-xs font-medium text-slate-400 dark:text-slate-500">
              Ingresa con tu cuenta comercial para administrar el inventario.
            </p>

            {serverError && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-semibold text-rose-600 animate-in fade-in slide-in-from-top-1 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className='text-[11px]'>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="ej: admin@inventory.local"
                  className={inputCls}
                  style={{
                    ['--tw-ring-color' as string]: `${ACCENT}1a`,
                  }}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-[11px] font-bold text-rose-500">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Escriba su contraseña"
                    className={`${inputCls} pr-10 font-mono`}
                    style={{ ['--tw-ring-color' as string]: `${ACCENT}1a` }}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer p-0.5 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] font-bold text-rose-500">{errors.password.message}</p>
                )}
              </div>

              {/* Recuérdame + olvidé contraseña */}
              <div className="flex items-center justify-between pt-1 text-xs font-bold">
                <label className="flex cursor-pointer select-none items-center gap-2 text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className="h-[18px] w-8 rounded-full p-0.5 transition-colors duration-200"
                    style={{ backgroundColor: rememberMe ? ACCENT : undefined }}
                  >
                    <div
                      className={`h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
                        rememberMe ? 'translate-x-3.5' : 'translate-x-0'
                      } ${rememberMe ? '' : 'bg-white'}`}
                    />
                  </div>
                  <span className={rememberMe ? '' : 'text-slate-600 dark:text-slate-400'}>Recuérdame</span>
                  {!rememberMe && <span className="hidden" />}
                </label>
                {/* TODO: conectá tu flujo real de recuperación de contraseña. */}
                <button
                  type="button"
                  onClick={() =>
                    setServerError(
                      'Para restablecer tu contraseña, contactá al administrador de TI.',
                    )
                  }
                  className="cursor-pointer hover:underline"
                  style={{ color: ACCENT }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Botón Ingresar */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-4 flex w-full cursor-pointer select-none items-center justify-center gap-2 rounded-xl py-3 text-center text-xs font-black text-white shadow-md transition-all hover:shadow-lg active:scale-[0.99] disabled:opacity-70"
                style={{ backgroundColor: ACCENT }}
              >
                {isSubmitting ? 'Procesando ingreso…' : 'Ingresar →'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-10 select-none text-center md:mt-0">
            <span className="block text-[11px] font-bold leading-relaxed text-slate-400 dark:text-slate-500">
              Acceso restringido · Solo personal comercial autorizado
            </span>
          </div>
        </div>

        {/* ============================================================
            RIGHT — HERO + CARRUSEL
            ============================================================ */}
        <div
          data-hero-bg
          className="relative flex h-[380px] w-full flex-col justify-end overflow-hidden bg-slate-950 p-8 dark:bg-black sm:p-10 md:h-auto md:w-1/2"
          style={{
            backgroundImage:
              'radial-gradient(120% 80% at 80% 0%, rgba(47,107,255,0.35), transparent 60%), radial-gradient(100% 90% at 0% 100%, rgba(40,40,60,0.6), transparent 60%), linear-gradient(160deg, #131a2e 0%, #0b0e14 100%)',
            backgroundSize: 'cover',
          }}
        >
          {/* Imágenes del carrusel — optimizadas con next/image (fill + sizes).
              Crossfade: la del slide activo en opacity-100, el resto en 0. */}
          {CAROUSEL_SLIDES.map((slide, idx) => (
            <Image
              key={slide.image}
              src={slide.image}
              alt=""
              fill
              priority={idx === 0}
              sizes="(min-width: 768px) 50vw, 100vw"
              className={`object-cover transition-opacity duration-700 ${
                activeSlide === idx ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ))}
          {/* Overlay para legibilidad del texto sobre la foto */}
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/50 to-slate-950/20" />

          <div className="relative z-20 space-y-4">
            <div className="flex min-h-[140px] flex-col justify-end">
              <div key={activeSlide} className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-700">
                <h2 className="text-2xl font-extrabold leading-none tracking-tight text-white drop-shadow-md sm:text-3xl">
                  {CAROUSEL_SLIDES[activeSlide]?.title}
                </h2>
                <p className="max-w-sm font-sans text-xs font-semibold leading-relaxed text-slate-300 drop-shadow-sm sm:text-sm">
                  {CAROUSEL_SLIDES[activeSlide]?.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-4">
              {CAROUSEL_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveSlide(idx)}
                  title={`Ver diapositiva ${idx + 1}`}
                  className="h-2 cursor-pointer rounded-full transition-all duration-300"
                  style={{
                    width: activeSlide === idx ? 28 : 8,
                    backgroundColor: activeSlide === idx ? ACCENT : 'rgba(255,255,255,0.4)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
