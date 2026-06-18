'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ExternalLink,
  Eye,
  FileText,
  Printer,
  RotateCcw,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CancelSaleDialog } from '@/components/forms/cancel-sale-dialog';
import { CustomerReturnDialog } from '@/components/forms/customer-return-dialog';
import { GenerateDispatchDialog } from '@/components/forms/generate-dispatch-dialog';
import { MultiWarrantyDialog } from '@/components/forms/multi-warranty-dialog';
import { OpenWarrantyDialog } from '@/components/forms/open-warranty-dialog';
import { SaleStatusBadge } from '@/components/sale-status-badge';
import { SoftModal } from '@/components/ui/soft-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Permission, useCan } from '@/lib/current-user-context';
import { getActiveDispatchBySale } from '@/lib/dispatch-api';
import { formatCurrency } from '@/lib/format';
import { getSale, getSalePdfUrl } from '@/lib/sales-api';
import { cn } from '@/lib/utils';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD_DEBIT: 'Débito',
  CARD_CREDIT: 'Crédito',
  PAYMENT_LINK: 'Link de pago',
};

const CARD =
  'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const BTN_OUTLINE =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900';
const BTN_DANGER =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-2.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400';
const BTN_PRIMARY =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
const LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';

export default function VentaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [multiWarrantyOpen, setMultiWarrantyOpen] = useState(false);
  const canSeeBreakdown = useCan(Permission.SALE_VIEW_FINANCIAL_BREAKDOWN);

  // Ronda 9 — query params para ops rápidas (?return / ?warranty / ?dispatch).
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('return') === '1') setReturnOpen(true);
    if (searchParams.get('warranty') === '1') setMultiWarrantyOpen(true);
    if (searchParams.get('dispatch') === '1') setDispatchOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [warrantyTargetItemId, setWarrantyTargetItemId] = useState<string | null>(null);

  // Si la venta ya tiene guía activa, mostramos "Ver guía DESP-XXX".
  const activeDispatch = useQuery({
    queryKey: ['active-dispatch-by-sale', id],
    queryFn: () => getActiveDispatchBySale(id),
    enabled: !!id,
  });

  const sale = useQuery({
    queryKey: ['sale', id],
    queryFn: () => getSale(id),
    enabled: !!id,
  });

  if (sale.isLoading) {
    return <div className="h-40 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  }
  if (!sale.data) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 text-sm font-semibold text-slate-400 dark:border-slate-850 dark:bg-[#11151C]">
        Venta no encontrada.
      </div>
    );
  }

  const s = sale.data;
  const canCancel = s.status !== 'CANCELLED';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <Link
            href="/ventas"
            title="Volver"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {s.number}
              </h1>
              <SaleStatusBadge status={s.status} />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Registrada el{' '}
              {new Date(s.date).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
              {s.user ? ` por ${s.user.name}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCancel && (
            <>
              {activeDispatch.data ? (
                <Link href={`/guias/${activeDispatch.data.id}`} className={BTN_OUTLINE}>
                  <Truck className="h-4 w-4 text-slate-400" />
                  Ver guía {activeDispatch.data.number}
                </Link>
              ) : (
                <button type="button" className={BTN_OUTLINE} onClick={() => setDispatchOpen(true)}>
                  <Truck className="h-4 w-4 text-slate-400" />
                  Generar guía de despacho
                </button>
              )}
              <button type="button" className={BTN_OUTLINE} onClick={() => setReturnOpen(true)}>
                <RotateCcw className="h-4 w-4 text-slate-400" />
                Crear devolución
              </button>
              <button type="button" className={BTN_OUTLINE} onClick={() => setMultiWarrantyOpen(true)}>
                <ShieldAlert className="h-4 w-4 text-slate-400" />
                Crear garantía
              </button>
              <button type="button" className={BTN_DANGER} onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4" />
                Venta a nota crédito
              </button>
            </>
          )}
          <button
            type="button"
            className={BTN_OUTLINE}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4" />
            Vista previa
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={BTN_PRIMARY}>
                <Printer className="h-4 w-4" />
                Imprimir
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={getSalePdfUrl(s.id, 'letter')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-4 w-4" />
                  Carta (A4)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={getSalePdfUrl(s.id, 'thermal80')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-4 w-4" />
                  Térmica 80mm
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* BANNER cancelada */}
      {s.status === 'CANCELLED' && (
        <div className="space-y-2 rounded-3xl border border-rose-100 bg-rose-50/50 p-5 dark:border-rose-950/20 dark:bg-rose-950/5">
          <h4 className="text-sm font-black text-rose-500">Venta cancelada</h4>
          {s.cancelledAt && (
            <p className="text-xs font-medium text-slate-500">
              {new Date(s.cancelledAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
              {s.cancelledBy ? ` por ${s.cancelledBy.name}` : ''}
            </p>
          )}
          {s.cancelReason && (
            <p className="whitespace-pre-wrap text-xs font-bold text-slate-800 dark:text-slate-200">
              Motivo:{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-400">{s.cancelReason}</span>
            </p>
          )}
        </div>
      )}

      {/* CLIENTE + PAGO */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={`space-y-2 ${CARD}`}>
          <h2 className={LABEL}>Cliente</h2>
          <div className="space-y-1 text-xs">
            <div className="text-sm font-black text-slate-900 dark:text-white">
              {s.customer?.name ?? '—'}
            </div>
            {s.customer?.taxId && <div className="font-mono text-slate-500">RUT {s.customer.taxId}</div>}
            {s.customer?.email && <div className="text-slate-500">{s.customer.email}</div>}
            {s.customer?.phone && <div className="text-slate-500">{s.customer.phone}</div>}
            {s.customer && (
              <Link
                href={`/clientes/${s.customer.id}`}
                className="inline-flex items-center gap-1 pt-1 text-[11px] font-bold text-[#2F6BFF] hover:underline"
              >
                Ver cliente <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        <div className={`space-y-2 ${CARD}`}>
          <h2 className={LABEL}>{canSeeBreakdown ? 'Pago' : 'Detalles'}</h2>
          <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            {canSeeBreakdown && s.paymentMethod && (
              <div>
                Método:{' '}
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
                </span>
              </div>
            )}
            {canSeeBreakdown && Number(s.commissionAmount ?? 0) > 0 && (
              <div>
                Comisión tarjeta:{' '}
                <span className="font-mono tabular-nums">{formatCurrency(s.commissionAmount)}</span>
              </div>
            )}
            {s.warehouse && <div>Bodega: <span className="font-semibold text-slate-700 dark:text-slate-300">{s.warehouse.name}</span></div>}
            {s.quotation && (
              <Link
                href={`/cotizaciones/${s.quotation.id}`}
                className="inline-flex items-center gap-1 pt-1 text-[11px] font-bold text-[#2F6BFF] hover:underline"
              >
                Desde cotización {s.quotation.number} <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ITEMS */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:bg-slate-900/10 dark:text-slate-500">
                <th className="w-[16%] py-4 pl-6">SKU</th>
                <th className="py-4">Producto</th>
                <th className="py-4 text-right">Cant.</th>
                <th className="py-4 text-right">P. Unit (bruto)</th>
                <th className="py-4 text-right">Desc.</th>
                <th className="py-4 pr-6 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800/80">
              {(s.items ?? []).map((it) => (
                <tr key={it.id} className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                  <td className="py-4 pl-6 font-mono text-slate-500 dark:text-slate-400">
                    {it.product?.sku ?? '—'}
                  </td>
                  <td className="max-w-[300px] py-4 font-bold text-slate-950 dark:text-white">
                    <span className="block truncate">
                      {it.product?.name ?? '—'}
                    </span>
                    {it.observation && (
                      <span className="mt-0.5 block whitespace-pre-wrap text-xs font-medium text-slate-500 dark:text-slate-400">
                        {it.observation}
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-right font-mono text-slate-700 dark:text-slate-300">{it.qty}</td>
                  <td className="py-4 text-right font-mono text-slate-500 dark:text-slate-400">
                    {formatCurrency(it.unitPrice)}
                  </td>
                  <td className="py-4 text-right font-mono text-slate-400">
                    {it.discountPercent
                      ? `${Number(it.discountPercent).toFixed(0)}%`
                      : Number(it.discount) > 0
                        ? formatCurrency(it.discount)
                        : '—'}
                  </td>
                  <td className="py-4 pr-6 text-right font-mono font-black text-slate-900 dark:text-white">
                    {formatCurrency(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NOTAS + TOTALES */}
      <div className="flex flex-wrap items-start gap-4">
        {s.notes && (
          <div className={`min-w-[300px] flex-1 space-y-2 ${CARD}`}>
            <h2 className={LABEL}>Notas</h2>
            <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
              {s.notes}
            </p>
          </div>
        )}
        <div className={`ml-auto min-w-[280px] space-y-2 text-xs ${CARD}`}>
          {canSeeBreakdown && s.subtotal != null && (
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal neto</span>
              <span className="font-mono font-semibold">{formatCurrency(s.subtotal)}</span>
            </div>
          )}
          {canSeeBreakdown && s.taxAmount != null && (
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>IVA</span>
              <span className="font-mono font-semibold">{formatCurrency(s.taxAmount)}</span>
            </div>
          )}
          <div
            className={cn(
              'flex justify-between text-sm font-bold text-slate-950 dark:text-white',
              canSeeBreakdown && 'border-t border-slate-100 pt-2 dark:border-slate-850',
            )}
          >
            <span>Total</span>
            <span className="font-mono text-base font-black text-[#2F6BFF]">{formatCurrency(s.total)}</span>
          </div>
        </div>
      </div>

      {/* Vista previa: visor inline de la nota de venta (reusa el mismo PDF
          que "Imprimir", sin tener que abrir el dropdown). Carta A4. */}
      <SoftModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Vista previa · ${s.number}`}
        subtitle="Así queda la nota de venta. Podés imprimirla o descargarla desde el visor."
        icon={<Eye className="h-5 w-5" />}
        size="4xl"
      >
        <div className="p-3">
          {/* `#navpanes=0` oculta el panel de miniaturas/páginas del visor PDF
              nativo del navegador, dejando el resto del visor intacto. */}
          <iframe
            title={`Nota de venta ${s.number}`}
            src={`${getSalePdfUrl(s.id, 'letter')}#navpanes=0`}
            className="h-[70vh] w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800"
          />
        </div>
      </SoftModal>

      <CancelSaleDialog sale={s} open={cancelOpen} onOpenChange={setCancelOpen} />
      <CustomerReturnDialog sale={s} open={returnOpen} onOpenChange={setReturnOpen} />
      <GenerateDispatchDialog sale={s} open={dispatchOpen} onOpenChange={setDispatchOpen} />
      <MultiWarrantyDialog sale={s} open={multiWarrantyOpen} onOpenChange={setMultiWarrantyOpen} />

      {warrantyTargetItemId &&
        (() => {
          const item = (s.items ?? []).find((i) => i.id === warrantyTargetItemId);
          if (!item) return null;
          return (
            <OpenWarrantyDialog
              saleItem={item}
              open={!!warrantyTargetItemId}
              onOpenChange={(o) => !o && setWarrantyTargetItemId(null)}
            />
          );
        })()}
    </div>
  );
}
