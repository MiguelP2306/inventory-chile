'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, ChevronDown, ExternalLink, Eye, FileText, Printer, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { DispatchStatusBadge } from '@/components/dispatch-status-badge';
import { VoidDispatchDialog } from '@/components/forms/void-dispatch-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SoftModal } from '@/components/ui/soft-modal';
import { getDispatchNote, getDispatchPdfUrl } from '@/lib/dispatch-api';
import { formatCurrency } from '@/lib/format';

const CARD =
  'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';

export default function GuiaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [voidOpen, setVoidOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const dq = useQuery({
    queryKey: ['dispatch-note', id],
    queryFn: () => getDispatchNote(id),
    enabled: !!id,
  });

  if (dq.isLoading) return <div className="h-40 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  if (!dq.data) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 text-sm font-semibold text-slate-400 dark:border-slate-850 dark:bg-[#11151C]">
        Guía no encontrada.
      </div>
    );
  }

  const d = dq.data;
  const canVoid = d.status === 'ACTIVE';
  const isIndependent = d.origin === 'INDEPENDENT';
  // Una guía independiente convertida ya tiene saleId. Solo se puede convertir
  // si es independiente, sigue activa y todavía no tiene venta.
  const canConvert = isIndependent && !d.saleId && d.status === 'ACTIVE';
  // Ambos tipos de guía se muestran valorizados. La independiente lleva sus
  // propios items y totales, congelados al emitirla; la generada desde una
  // venta los toma prestados de esa venta.
  const lineItems = isIndependent ? d.items ?? [] : d.sale?.items ?? [];
  const totals = isIndependent
    ? { subtotal: d.subtotal, taxAmount: d.taxAmount, total: d.total }
    : {
        subtotal: d.sale?.subtotal ?? '0',
        taxAmount: d.sale?.taxAmount ?? '0',
        total: d.sale?.total ?? '0',
      };
  const addressLine = [d.addressStreet, d.addressNumber, d.commune?.name].filter(Boolean).join(' ');

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <Link
            href="/guias"
            title="Volver"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {d.number}
              </h1>
              <DispatchStatusBadge status={d.status} />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Despachada el{' '}
              {new Date(d.dispatchedAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
              {d.user ? ` por ${d.user.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canConvert && (
            <Link
              href={`/ventas/nueva?fromDispatch=${d.id}`}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-950/30 dark:bg-emerald-950/15 dark:text-emerald-400"
            >
              <Receipt className="h-4 w-4" />
              Convertir a venta
            </Link>
          )}
          {canVoid && (
            <button
              type="button"
              onClick={() => setVoidOpen(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-2.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-50 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400"
            >
              <Ban className="h-4 w-4" />
              Anular guía
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Eye className="h-4 w-4" />
            Vista previa
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2F6BFF] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90"
              >
                <Printer className="h-4 w-4" />
                Imprimir
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={getDispatchPdfUrl(d.id, 'letter')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-4 w-4" />
                  Carta (A4)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={getDispatchPdfUrl(d.id, 'thermal80')} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-4 w-4" />
                  Térmica 80mm
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* BANNER anulada */}
      {d.status === 'VOIDED' && (
        <div className="space-y-2 rounded-3xl border border-rose-100 bg-rose-50/50 p-5 dark:border-rose-950/20 dark:bg-rose-950/5">
          <h4 className="text-sm font-black text-rose-500">Guía anulada</h4>
          {d.voidedAt && (
            <p className="text-xs font-medium text-slate-500">
              {new Date(d.voidedAt).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}
              {d.voidedBy ? ` por ${d.voidedBy.name}` : ''}
            </p>
          )}
          {d.voidReason && (
            <p className="whitespace-pre-wrap text-xs font-bold text-slate-800 dark:text-slate-200">
              Motivo:{' '}
              <span className="font-semibold text-slate-600 dark:text-slate-400">{d.voidReason}</span>
            </p>
          )}
        </div>
      )}

      {/* VENTA / DIRECCIÓN / TRANSPORTE */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={`space-y-1 ${CARD}`}>
          <h2 className={LABEL}>{isIndependent ? 'Cliente' : 'Venta origen'}</h2>
          {d.sale ? (
            <>
              <Link
                href={`/ventas/${d.sale.id}`}
                className="inline-flex items-center gap-1 font-mono text-sm font-bold text-[#2F6BFF] hover:underline"
              >
                {d.sale.number} <ExternalLink className="h-3 w-3" />
              </Link>
              {isIndependent && (
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Convertida a venta
                </div>
              )}
              {d.sale.customer && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {d.sale.customer.name} · RUT {d.sale.customer.taxId}
                </div>
              )}
            </>
          ) : d.customer ? (
            <>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {d.customer.name}
              </div>
              {d.customer.taxId && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  RUT {d.customer.taxId}
                </div>
              )}
              <div className="text-[11px] font-semibold text-slate-400">
                Guía independiente · sin convertir
              </div>
            </>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
        <div className={`space-y-1 ${CARD}`}>
          <h2 className={LABEL}>Dirección de entrega</h2>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {addressLine || <span className="font-medium text-slate-400">—</span>}
          </div>
          {d.commune?.region && <div className="text-[11px] text-slate-400">Región {d.commune.region}</div>}
          {d.addressNotes && (
            <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-500 dark:text-slate-400">
              {d.addressNotes}
            </p>
          )}
        </div>
        <div className={`space-y-1 ${CARD}`}>
          <h2 className={LABEL}>Transporte</h2>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Transportista:{' '}
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {d.carrier ?? '—'}
            </span>
          </div>
          {d.trackingNumber && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              N° seguimiento: <span className="font-mono text-slate-700 dark:text-slate-300">{d.trackingNumber}</span>
            </div>
          )}
          {isIndependent && d.warehouse && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Bodega:{' '}
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {d.warehouse.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ITEMS */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="select-none border-b border-slate-100 p-5 dark:border-slate-850">
          <h2 className={LABEL}>Items despachados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
                <th className="w-[18%] py-3 pl-6">SKU</th>
                <th className="py-3">Producto</th>
                <th className="py-3 text-right">Cant.</th>
                <th className="py-3 text-right">P. Unit</th>
                <th className="py-3 pr-6 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-850">
              {lineItems.map((it) => (
                <tr key={it.id} className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                  <td className="py-4 pl-6 font-mono text-slate-500 dark:text-slate-400">
                    {it.product?.sku ?? '—'}
                  </td>
                  <td className="max-w-[300px] truncate py-4 font-bold text-slate-950 dark:text-white">
                    {it.product?.name ?? '—'}
                  </td>
                  <td className="py-4 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                    {it.qty}
                  </td>
                  <td className="py-4 text-right font-mono text-slate-600 dark:text-slate-300">
                    {formatCurrency(it.unitPrice)}
                  </td>
                  <td className="py-4 pr-6 text-right font-mono text-[13px] font-black text-slate-900 dark:text-white">
                    {formatCurrency(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Totales: la guía independiente lleva los suyos congelados; la guía
            generada desde una venta los toma de la venta origen. */}
        <div className="flex justify-end border-t border-slate-100 p-5 dark:border-slate-850">
          <div className="w-full max-w-[260px] space-y-1.5 text-[12px]">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal neto</span>
              <span className="font-mono">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>IVA</span>
              <span className="font-mono">{formatCurrency(totals.taxAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-sm font-black text-slate-900 dark:border-slate-850 dark:text-white">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* OBSERVACIONES */}
      {d.notes && (
        <div className={`space-y-2 ${CARD}`}>
          <h2 className={LABEL}>Observaciones</h2>
          <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            {d.notes}
          </p>
        </div>
      )}

      {/* Vista previa: visor inline de la guía (mismo PDF que "Imprimir",
          sin abrir el dropdown ni una pestaña nueva). Carta A4. */}
      <SoftModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Vista previa · ${d.number}`}
        subtitle="Así queda la guía de despacho. Podés imprimirla o descargarla desde el visor."
        icon={<Eye className="h-5 w-5" />}
        size="4xl"
      >
        <div className="p-3">
          {/* `#navpanes=0` oculta el panel de miniaturas del visor PDF nativo. */}
          <iframe
            title={`Guía de despacho ${d.number}`}
            src={`${getDispatchPdfUrl(d.id, 'letter')}#navpanes=0`}
            className="h-[70vh] w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800"
          />
        </div>
      </SoftModal>

      <VoidDispatchDialog note={d} open={voidOpen} onOpenChange={setVoidOpen} />
    </div>
  );
}
