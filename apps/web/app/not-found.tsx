/*
 * not-found — página 404 global (App Router).
 *
 * Se renderiza dentro del root layout (con el ThemeProvider), así que respeta
 * el tema claro/oscuro y NO arrastra el sidebar del dashboard. Estilo 100%
 * alineado al sistema visual de la web (acento #2F6BFF, paleta slate,
 * rounded-3xl, marca con caja azul).
 */

import { ArrowLeft, Boxes, Compass, LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/server-api';

const ACCENT = '#2F6BFF';

export default async function NotFound() {
  // El Centro de ayuda vive detrás del login: solo ofrecemos el acceso cuando
  // hay una sesión activa. Sin usuario, mostramos únicamente "Volver al inicio".
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-8 text-center shadow-sm sm:p-12 dark:border-slate-800 dark:bg-[#0F131A]"
        style={{
          backgroundImage:
            'radial-gradient(120% 90% at 50% 0%, rgba(47,107,255,0.10) 0%, rgba(47,107,255,0) 55%)',
        }}
      >
        {/* Marca */}
        <Link
          href="/"
          className="mx-auto inline-flex items-center gap-2.5"
          aria-label="Ir al inicio"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-lg"
            style={{ backgroundColor: ACCENT, boxShadow: '0 10px 22px -8px rgba(47,107,255,0.5)' }}
          >
            <Boxes className="h-5 w-5" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
            Inventario{' '}
            <span style={{ color: ACCENT }} className="font-extrabold dark:brightness-125">
              PYME
            </span>
          </span>
        </Link>

        {/* Ilustración / código */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(47,107,255,0.1)', color: ACCENT }}
          >
            <Compass className="h-7 w-7" />
          </span>
          <span
            className="text-5xl font-extrabold tracking-tighter sm:text-6xl"
            style={{ color: ACCENT }}
          >
            404
          </span>
        </div>

        <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Página no encontrada
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-slate-600 dark:text-slate-300">
          La página que buscas no existe, cambió de lugar o el enlace está roto.
          No te preocupes: desde acá vuelves a tu sistema en un clic.
        </p>

        {/* Acciones */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-bold text-white transition-opacity hover:opacity-90 sm:w-auto"
            style={{ backgroundColor: ACCENT, boxShadow: '0 10px 22px -8px rgba(47,107,255,0.45)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          {user && (
            <Link
              href="/ayuda"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-[13px] font-bold text-slate-700 transition-colors hover:border-[#2F6BFF]/40 hover:text-[#2F6BFF] sm:w-auto dark:border-slate-700 dark:text-slate-200 dark:hover:text-blue-400"
            >
              <LifeBuoy className="h-4 w-4" />
              Ir al Centro de ayuda
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
