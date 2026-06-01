'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  FileText,
  MessageSquare,
  Send,
  ShoppingCart,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { CustomerForm } from '@/components/forms/customer-form';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/format';
import { listCustomerEvents } from '@/lib/lifecycle-api';
import { listQuotations } from '@/lib/quotations-api';
import { listSales } from '@/lib/sales-api';
import { formatPhonePretty } from '@/lib/validators/phone';
import { formatRutPretty } from '@/lib/validators/rut';
import type { CustomerDto, LeadEventTypeDto } from '@inventory/shared';

interface Props {
  customer: CustomerDto;
}

/* Estilos compartidos de los tabs tipo pill (activo = azul de marca). */
const PILL_LIST =
  'h-auto gap-1 rounded-2xl border border-slate-200 bg-slate-100/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/80';
const PILL_TRIGGER =
  'rounded-xl px-4 py-2 text-[11.5px] font-bold text-slate-500 transition-all hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 data-[state=active]:bg-[#2F6BFF] data-[state=active]:font-black data-[state=active]:text-white data-[state=active]:shadow-md';

const SHEET =
  'overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const THEAD =
  'border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500';
const TBODY = 'divide-y divide-slate-100 dark:divide-slate-800/80';

/**
 * Detalle del cliente — Rediseño UI (look Stock / Transferencias).
 *
 * SOLO UI/UX. La lógica de datos es idéntica:
 *   - Datos: el CustomerForm tal cual (Fase 4 + 8.5).
 *   - Compras: ventas confirmadas a este cliente (listSales).
 *   - Cotizaciones: cotizaciones emitidas (listQuotations).
 *   - Histórico: timeline de eventos del lifecycle (listCustomerEvents).
 *
 * Cambios visuales: header con back + nombre font-black + badge de lifecycle
 * + subtítulo de contacto, tabs en pills azules, tablas en "sheet" rounded-3xl
 * y timeline con íconos en círculo de color.
 */
export function CustomerDetail({ customer }: Props) {
  const subtitle = [
    customer.taxId ? formatRutPretty(customer.taxId) : null,
    customer.email,
    customer.phone ? formatPhonePretty(customer.phone) : null,
    customer.commune?.name,
  ].filter(Boolean);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex items-start gap-4">
        <Link
          href="/clientes"
          title="Volver a clientes"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </Link>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {customer.name}
            </h1>
            <LifecycleBadge status={customer.lifecycleStatus} />
          </div>
          {subtitle.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              {subtitle.map((part, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && (
                    <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                  )}
                  <span className={i === 0 ? 'font-mono' : ''}>{part}</span>
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* ============================================================
          TABS
          ============================================================ */}
      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList className={PILL_LIST}>
          <TabsTrigger value="datos" className={PILL_TRIGGER}>
            Datos
          </TabsTrigger>
          <TabsTrigger value="compras" className={PILL_TRIGGER}>
            Compras
          </TabsTrigger>
          <TabsTrigger value="cotizaciones" className={PILL_TRIGGER}>
            Cotizaciones
          </TabsTrigger>
          <TabsTrigger value="historico" className={PILL_TRIGGER}>
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <CustomerForm customer={customer} />
        </TabsContent>

        <TabsContent value="compras">
          <SalesTab customerId={customer.id} />
        </TabsContent>

        <TabsContent value="cotizaciones">
          <QuotationsTab customerId={customer.id} />
        </TabsContent>

        <TabsContent value="historico">
          <HistoryTab customerId={customer.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers visuales                                                    */
/* ------------------------------------------------------------------ */

function TabSkeleton() {
  return (
    <div className="h-40 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center text-xs font-semibold text-slate-400 dark:border-slate-850 dark:bg-[#11151C]">
      {children}
    </div>
  );
}

const BADGE = 'inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider';

// ---------- Compras ----------

function SaleStatusBadge({ status }: { status: string }) {
  if (status === 'CANCELLED')
    return (
      <span className={`${BADGE} bg-rose-50 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400`}>
        Cancelada
      </span>
    );
  if (status === 'PAID')
    return (
      <span className={`${BADGE} bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400`}>
        Pagada
      </span>
    );
  return (
    <span className={`${BADGE} bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}>
      {status === 'PENDING' ? 'Pendiente' : status}
    </span>
  );
}

function SalesTab({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ['sales', { customerId }],
    queryFn: () => listSales({ customerId, pageSize: 50 }),
  });
  const items = q.data?.items ?? [];

  if (q.isLoading) return <TabSkeleton />;
  if (items.length === 0)
    return <EmptyState>Este cliente todavía no tiene compras registradas.</EmptyState>;

  return (
    <div className={SHEET}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
          <thead>
            <tr className={THEAD}>
              <th className="py-4 pl-6">Número</th>
              <th className="py-4">Fecha</th>
              <th className="py-4 text-right">Items</th>
              <th className="py-4 text-right">Total</th>
              <th className="py-4">Método</th>
              <th className="py-4 pr-6">Estado</th>
            </tr>
          </thead>
          <tbody className={TBODY}>
            {items.map((s) => (
              <tr
                key={s.id}
                className="group transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
              >
                <td className="py-5 pl-6 font-mono font-bold text-slate-900 dark:text-white">
                  <Link href={`/ventas/${s.id}`} className="hover:underline">
                    {s.number}
                  </Link>
                </td>
                <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                  {new Date(s.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                </td>
                <td className="py-5 text-right font-mono font-semibold text-slate-600 dark:text-slate-400">
                  {s.items?.length ?? 0}
                </td>
                <td className="py-5 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                  {formatCurrency(s.total)}
                </td>
                <td className="py-5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {s.paymentMethod}
                </td>
                <td className="py-5 pr-6">
                  <SaleStatusBadge status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Cotizaciones ----------

function QuotationsTab({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ['quotations', { customerId }],
    queryFn: () => listQuotations({ customerId, pageSize: 50 }),
  });
  const items = q.data?.items ?? [];

  if (q.isLoading) return <TabSkeleton />;
  if (items.length === 0)
    return <EmptyState>Este cliente todavía no tiene cotizaciones.</EmptyState>;

  return (
    <div className={SHEET}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[12px]">
          <thead>
            <tr className={THEAD}>
              <th className="py-4 pl-6">Número</th>
              <th className="py-4">Fecha</th>
              <th className="py-4 text-right">Total</th>
              <th className="py-4">Estado</th>
              <th className="py-4 pr-6">Enviada</th>
            </tr>
          </thead>
          <tbody className={TBODY}>
            {items.map((qt) => (
              <tr
                key={qt.id}
                className="group transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
              >
                <td className="py-5 pl-6 font-mono font-bold text-slate-900 dark:text-white">
                  <Link href={`/cotizaciones/${qt.id}`} className="hover:underline">
                    {qt.number}
                  </Link>
                </td>
                <td className="py-5 font-medium text-slate-500 dark:text-slate-400">
                  {new Date(qt.date).toLocaleDateString('es-CL', { dateStyle: 'short' })}
                </td>
                <td className="py-5 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                  {formatCurrency(qt.total)}
                </td>
                <td className="py-5">
                  <span className={`${BADGE} bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}>
                    {qt.status}
                  </span>
                </td>
                <td className="py-5 pr-6 font-medium text-slate-500 dark:text-slate-400">
                  {qt.sentAt
                    ? new Date(qt.sentAt).toLocaleDateString('es-CL', { dateStyle: 'short' })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Histórico ----------

const EVENT_META: Record<
  LeadEventTypeDto,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  QUOTATION_CREATED: {
    label: 'Cotización creada',
    icon: FileText,
    cls: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
  },
  QUOTATION_SENT: {
    label: 'Cotización enviada',
    icon: Send,
    cls: 'bg-blue-50 text-[#2F6BFF] dark:bg-blue-950/30 dark:text-blue-400',
  },
  SALE_CONFIRMED: {
    label: 'Venta confirmada',
    icon: ShoppingCart,
    cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
  },
  FOLLOW_UP_TRIGGERED: {
    label: 'Marcado para seguimiento',
    icon: Ban,
    cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
  },
  MANUAL_CONTACT: {
    label: 'Contacto manual registrado',
    icon: CheckCircle2,
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  LOST_MARKED: {
    label: 'Marcado como perdido',
    icon: XCircle,
    cls: 'bg-rose-50 text-rose-500 dark:bg-rose-950/20 dark:text-rose-400',
  },
};

function HistoryTab({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ['customer-events', customerId],
    queryFn: () => listCustomerEvents(customerId),
  });
  const events = q.data ?? [];

  if (q.isLoading) return <TabSkeleton />;
  if (events.length === 0)
    return (
      <EmptyState>
        Este cliente todavía no tiene eventos registrados. Los eventos se crean
        automáticamente cuando se cotiza, envía cotización, confirma venta o se
        marca como perdido.
      </EmptyState>
    );

  return (
    <div className={`${SHEET} p-2`}>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800/80">
        {events.map((e) => {
          const meta = EVENT_META[e.type] ?? {
            label: e.type,
            icon: MessageSquare,
            cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
          };
          const Icon = meta.icon;
          return (
            <li key={e.id} className="flex items-start gap-3.5 px-4 py-4">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${meta.cls}`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-extrabold text-slate-800 dark:text-slate-200">
                    {meta.label}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    {new Date(e.occurredAt).toLocaleString('es-CL', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                {e.refType && e.refId && (
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Referencia: {e.refType} ·{' '}
                    <span className="font-mono">{e.refId.slice(0, 8)}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
