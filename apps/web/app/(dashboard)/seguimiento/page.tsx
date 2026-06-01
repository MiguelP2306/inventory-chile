'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileText, MessageCircle, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { QuotationStatusBadge } from '@/components/quotation-status-badge';
import { MarkLostDialog } from '@/components/mark-lost-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCompanySettings } from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import {
  applyWhatsappTokens,
  buildWhatsappUrl,
  listFollowUps,
  touchCustomer,
} from '@/lib/lifecycle-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { FollowUpRowDto, FollowUpTab } from '@inventory/shared';

const TABS: { value: FollowUpTab; label: string }[] = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'sin-respuesta', label: 'Sin respuesta' },
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'ultimo-contacto', label: 'Último contacto' },
];

const PAGE_SIZE = 20;

const PILL_LIST =
  'h-auto gap-1 rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80';
const PILL_TRIGGER =
  'rounded-xl px-4 py-2 text-[11.5px] font-bold text-slate-500 transition-all hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 data-[state=active]:bg-[#2F6BFF] data-[state=active]:font-black data-[state=active]:text-white data-[state=active]:shadow-md';
const ICON_BTN =
  'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-400 dark:hover:bg-slate-900';

/**
 * /seguimiento — Rediseño UI (look de la web). SOLO UI/UX.
 * Lógica idéntica: tabs (pendientes/sin-respuesta/vencidos/último contacto),
 * listFollowUps paginado + search, touchCustomer, link wa.me, MarkLostDialog.
 */
export default function SeguimientoPage() {
  const qc = useQueryClient();
  const filters = useUrlFilters({ tab: 'pendientes', q: '', page: '' });
  const { values, setFilter, setFilters } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const tab = (values.tab as FollowUpTab) || 'pendientes';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const [lostTarget, setLostTarget] = useState<{ id: string; name: string } | null>(null);

  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000,
  });

  const followUpsQ = useQuery({
    queryKey: ['follow-ups', { tab, q: debouncedQ, page }],
    queryFn: () =>
      listFollowUps({ tab, q: debouncedQ || undefined, page, pageSize: PAGE_SIZE }),
  });

  const touchMut = useMutation({
    mutationFn: (customerId: string) => touchCustomer(customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups'] });
      toast.success('Contacto registrado');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo marcar')),
  });

  const rows = followUpsQ.data?.items ?? [];
  const total = followUpsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const template =
    settings.data?.whatsappFollowUpTemplate ??
    'Hola {cliente}, te paso de nuevo la cotización {cotizacion} por {total}.';

  function buildWaUrl(row: FollowUpRowDto): string | null {
    const phone = row.whatsappPhone ?? row.phone;
    const message = applyWhatsappTokens(template, {
      cliente: row.customerName,
      cotizacion: row.latestQuotation?.number ?? '',
      total: row.latestQuotation ? formatCurrency(row.latestQuotation.total) : '',
      link: row.latestQuotation
        ? `${window.location.origin}/p/cotizacion/${row.latestQuotation.publicToken}`
        : '',
    });
    return buildWhatsappUrl(phone, message);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Seguimiento comercial
        </h1>
        <p className="max-w-3xl text-xs font-medium text-slate-500 dark:text-slate-400">
          Cotizaciones del día —{' '}
          {new Date().toLocaleDateString('es-CL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
          . Solo se muestran clientes con cotizaciones abiertas creadas hoy. El
          badge refleja el estado actual de la cotización.
        </p>
      </div>

      {/* TABS + SEARCH */}
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <Tabs value={tab} onValueChange={(v) => setFilters({ tab: v, page: null })}>
          <TabsList className={PILL_LIST}>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className={PILL_TRIGGER}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full max-w-[480px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
          <input
            value={search.value}
            onChange={(e) => search.setValue(e.target.value)}
            placeholder="Buscar por nombre, RUT, email o teléfono…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-medium text-slate-700 shadow-sm transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none dark:border-slate-850 dark:bg-[#11151C] dark:text-white"
          />
        </div>
      </div>

      {/* TABLA */}
      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="py-4 pl-6">Cliente</th>
                <th className="py-4">Último contacto</th>
                <th className="py-4">Próximo follow-up</th>
                <th className="py-4">Cotización</th>
                <th className="py-4">Estado</th>
                <th className="py-4 pr-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {followUpsQ.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!followUpsQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center font-bold text-slate-400">
                    No hay clientes en este estado.
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const waUrl = buildWaUrl(row);
                return (
                  <tr key={row.customerId} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                    <td className="py-5 pl-6">
                      <Link
                        href={`/clientes/${row.customerId}`}
                        className="font-bold text-slate-900 hover:underline dark:text-white"
                      >
                        {row.customerName}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">{row.customerTaxId}</div>
                    </td>
                    <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                      {row.lastContactAt ? (
                        <span title={row.lastContactAt}>{relativeTime(row.lastContactAt)}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                      {row.nextFollowUpAt ? (
                        <span title={row.nextFollowUpAt}>{relativeTime(row.nextFollowUpAt)}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-5">
                      {row.latestQuotation ? (
                        <Link href={`/cotizaciones/${row.latestQuotation.id}`} className="hover:underline">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {row.latestQuotation.number}
                          </span>{' '}
                          <span className="font-medium text-slate-400">
                            · {formatCurrency(row.latestQuotation.total)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-5">
                      {row.latestQuotation ? (
                        <QuotationStatusBadge status={row.latestQuotation.status} />
                      ) : (
                        <LifecycleBadge status={row.lifecycleStatus} />
                      )}
                    </td>
                    <td className="py-5 pr-6">
                      <div className="flex justify-end gap-1.5">
                        {waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Enviar WhatsApp"
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50/50 text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-950/30 dark:bg-emerald-950/15 dark:text-emerald-400"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Sin WhatsApp / teléfono configurado"
                            className={ICON_BTN}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => touchMut.mutate(row.customerId)}
                          disabled={touchMut.isPending}
                          title="Marcar contacto"
                          className={ICON_BTN}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/cotizaciones?customer=${row.customerId}`}
                          title="Ver cotizaciones del cliente"
                          className={ICON_BTN}
                        >
                          <FileText className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setLostTarget({ id: row.customerId, name: row.customerName })}
                          title="Marcar como perdido"
                          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-rose-100 bg-rose-50/50 text-rose-500 transition-colors hover:bg-rose-50 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-400 dark:text-slate-500">
          <span>
            {total} cliente{total === 1 ? '' : 's'} · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Anterior
            </button>
            <button
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
              disabled={page >= totalPages}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 font-bold text-slate-700 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      <MarkLostDialog
        customer={lostTarget}
        open={!!lostTarget}
        onOpenChange={(o) => !o && setLostTarget(null)}
      />
    </div>
  );
}

/**
 * Formato relativo simple para el tab de bandeja: "hace 3h", "en 12h",
 * "hace 2d". Para fechas a más de 7 días devuelve la fecha local corta.
 */
function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const abs = Math.abs(diffMin);
  if (abs < 60) {
    return diffMin >= 0 ? `en ${abs} min` : `hace ${abs} min`;
  }
  if (abs < 60 * 24) {
    const h = Math.round(abs / 60);
    return diffMin >= 0 ? `en ${h}h` : `hace ${h}h`;
  }
  if (abs < 60 * 24 * 7) {
    const d = Math.round(abs / (60 * 24));
    return diffMin >= 0 ? `en ${d}d` : `hace ${d}d`;
  }
  return date.toLocaleDateString('es-CL', { dateStyle: 'medium' });
}
