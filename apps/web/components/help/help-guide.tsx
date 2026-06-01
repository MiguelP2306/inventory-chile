'use client';

/* ============================================================================
 *  HelpGuide — guía no técnica de TODA la web + preguntas frecuentes.
 *
 *  Estructura (estilo "blog/documentación"):
 *   · Hero con buscador en vivo.
 *   · "El sistema en 1 minuto": el flujo diario del negocio.
 *   · Módulos agrupados igual que el sidebar (Catálogo, Operación, Caja,
 *     Reportes, Administración), cada uno con: qué es, para qué sirve,
 *     qué podés hacer y un consejo. Cada tarjeta enlaza al módulo real.
 *   · Preguntas frecuentes (acordeón).
 *   · Menú lateral derecho STICKY con scroll-spy en desktop (≥lg). En mobile
 *     la navegación vive en el header como menú hamburguesa (HelpMobileNav).
 *
 *  El contenido (módulos, flujo y FAQ) vive en `help-content.tsx` para
 *  compartirse con el menú mobile sin duplicar texto.
 * ========================================================================== */

import {
  ArrowRight,
  ChevronDown,
  HelpCircle,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FAQS, FLOW, GROUPS, type HelpModule } from '@/components/help/help-content';
import { cn } from '@/lib/utils';

const ACCENT = '#2F6BFF';

/* ================================================================== *
 * Componente principal
 * ================================================================== */
export function HelpGuide() {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string>('intro');

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Filtrado en vivo de módulos y FAQ.
  const filteredGroups = useMemo(() => {
    if (!searching) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      modules: g.modules.filter((m) => {
        const haystack = [m.title, m.tagline, m.what, m.tip ?? '', ...m.bullets]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }),
    })).filter((g) => g.modules.length > 0);
  }, [q, searching]);

  const filteredFaqs = useMemo(() => {
    if (!searching) return FAQS;
    return FAQS.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q));
  }, [q, searching]);

  const hasResults = filteredGroups.length > 0 || filteredFaqs.length > 0;

  // Scroll-spy: resalta en el menú la sección visible.
  const navIds = useMemo(() => {
    const ids = ['intro', ...filteredGroups.flatMap((g) => g.modules.map((m) => m.id))];
    if (filteredFaqs.length > 0) ids.push('faq');
    return ids;
  }, [filteredGroups, filteredFaqs]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Recorta la zona "activa" a una franja bajo la barra superior.
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    );
    navIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [navIds]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6">
      {/* ============================ HERO ============================ */}
      <section id="intro" className="scroll-mt-24 pt-8 sm:pt-12">
        <div
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 p-8 sm:p-12 dark:border-slate-800"
          style={{
            background:
              'radial-gradient(120% 120% at 0% 0%, rgba(47,107,255,0.10) 0%, rgba(47,107,255,0) 45%), radial-gradient(120% 120% at 100% 0%, rgba(47,107,255,0.07) 0%, rgba(47,107,255,0) 50%)',
          }}
        >
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
            style={{ color: ACCENT, backgroundColor: 'rgba(47,107,255,0.08)' }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Guía del sistema
          </span>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Centro de Ayuda
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            Una guía simple, sin tecnicismos, para que conozcas <strong>para qué sirve cada
            módulo</strong> del sistema. Léela como un recorrido por tu negocio: del catálogo a la
            caja. Usa el menú para saltar a cualquier sección.
          </p>

          {/* Buscador en vivo */}
          <div className="mt-6 flex max-w-xl items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-[#2F6BFF]/40 dark:border-slate-700 dark:bg-[#0F131A]">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en la guía (ej: cotización, IVA, stock...)"
              className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* El sistema en 1 minuto (se oculta al buscar) */}
        {!searching && (
          <div className="mt-8 rounded-3xl border border-slate-200/70 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-[#0F131A]">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" style={{ color: ACCENT }} />
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                El sistema en 1 minuto
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Así fluye un negocio de repuestos dentro del sistema. Cada paso alimenta al siguiente
              de forma automática.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FLOW.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.label}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800 dark:text-slate-100">
                        <span className="text-slate-400">{i + 1}.</span> {step.label}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
                        {step.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ===================== LAYOUT 2 COLUMNAS ===================== */}
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* ----------------------- CONTENIDO ----------------------- */}
        <div className="min-w-0">
          {!hasResults && (
            <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
              <Search className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                No encontramos nada para “{query}”.
              </p>
              <p className="mt-1 text-[13px] text-slate-400">
                Probá con otra palabra, como “stock”, “venta” o “IVA”.
              </p>
            </div>
          )}

          {filteredGroups.map((group) => (
            <section key={group.key} className="mb-12">
              <div className="mb-5">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {group.label}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {group.description}
                </p>
              </div>

              <div className="space-y-5">
                {group.modules.map((m) => (
                  <ModuleCard key={m.id} module={m} />
                ))}
              </div>
            </section>
          ))}

          {/* ----------------------- FAQ ----------------------- */}
          {filteredFaqs.length > 0 && (
            <section id="faq" className="scroll-mt-24">
              <div className="mb-5 flex items-center gap-2">
                <HelpCircle className="h-5 w-5" style={{ color: ACCENT }} />
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Preguntas frecuentes
                </h2>
              </div>
              <div className="space-y-3">
                {filteredFaqs.map((f, i) => (
                  <FaqItem key={i} q={f.q} a={f.a} />
                ))}
              </div>

              {/* Cierre / soporte */}
              <div
                className="mt-8 flex flex-col items-start gap-4 rounded-3xl border p-6 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: 'rgba(47,107,255,0.18)', backgroundColor: 'rgba(47,107,255,0.05)' }}
              >
                <div>
                  <p className="text-[15px] font-bold text-slate-900 dark:text-white">
                    ¿Te quedó una duda que no está acá?
                  </p>
                  <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                    Escríbenos y te ayudamos a sacarle el máximo provecho al sistema.
                  </p>
                </div>
                <a
                  href="mailto:soporte@pyme.cl"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: ACCENT, boxShadow: '0 10px 22px -8px rgba(47,107,255,0.45)' }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Contactar soporte
                </a>
              </div>
            </section>
          )}
        </div>

        {/* --------------------- MENÚ LATERAL (desktop) ---------------------- */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8">
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              En esta guía
            </p>
            <ul className="space-y-0.5">
              <TocLink id="intro" label="Inicio" active={activeId === 'intro'} />
              {filteredGroups.map((group) => (
                <li key={group.key} className="pt-2">
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400/80 dark:text-slate-600">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5 border-l border-slate-100 dark:border-slate-800">
                    {group.modules.map((m) => (
                      <TocLink
                        key={m.id}
                        id={m.id}
                        label={m.title}
                        active={activeId === m.id}
                        nested
                      />
                    ))}
                  </ul>
                </li>
              ))}
              {filteredFaqs.length > 0 && (
                <li className="pt-2">
                  <TocLink id="faq" label="Preguntas frecuentes" active={activeId === 'faq'} />
                </li>
              )}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tarjeta de módulo
 * ------------------------------------------------------------------ */
function ModuleCard({ module: m }: { module: HelpModule }) {
  const Icon = m.icon;
  return (
    <article
      id={m.id}
      data-help-id={m.id}
      className="scroll-mt-24 rounded-3xl border border-slate-200/70 bg-white p-6 transition-shadow hover:shadow-md sm:p-7 dark:border-slate-800 dark:bg-[#0F131A]"
    >
      <div className="flex items-start gap-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'rgba(47,107,255,0.1)', color: ACCENT }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {m.title}
          </h3>
          <p className="text-[13px] font-medium" style={{ color: ACCENT }}>
            {m.tagline}
          </p>
        </div>
        {m.route && (
          <Link
            href={m.route}
            className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-600 transition-colors hover:border-[#2F6BFF]/40 hover:text-[#2F6BFF] sm:inline-flex dark:border-slate-700 dark:text-slate-300 dark:hover:text-blue-400"
          >
            Ir al módulo
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
        {m.what}
      </p>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Qué puedes hacer
        </p>
        <ul className="space-y-2">
          {m.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-slate-600 dark:text-slate-300">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: ACCENT }}
              />
              <span className="leading-snug">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {m.tip && (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900/50">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-[13px] leading-snug text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Consejo: </span>
            {m.tip}
          </p>
        </div>
      )}

      {m.route && (
        <Link
          href={m.route}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2F6BFF] hover:underline sm:hidden"
        >
          Ir al módulo
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Item de FAQ (acordeón nativo accesible)
 * ------------------------------------------------------------------ */
function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border border-slate-200/70 bg-white px-5 py-1 dark:border-slate-800 dark:bg-[#0F131A]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[14px] font-semibold text-slate-800 dark:text-slate-100">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="pb-4 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
        {a}
      </p>
    </details>
  );
}

/* ------------------------------------------------------------------ *
 * Enlace del menú lateral (scroll-spy)
 * ------------------------------------------------------------------ */
function TocLink({
  id,
  label,
  active,
  nested,
}: {
  id: string;
  label: string;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <li>
      <a
        href={`#${id}`}
        className={cn(
          'block truncate rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
          active
            ? 'bg-[#2F6BFF]/10 text-[#2F6BFF] dark:bg-[#2F6BFF]/15 dark:text-blue-400'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
          nested && active && '-ml-px border-l-2 border-[#2F6BFF]',
        )}
      >
        {label}
      </a>
    </li>
  );
}
