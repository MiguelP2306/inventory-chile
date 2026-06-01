'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  FileDown,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Printer,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { QuotationFormDialog } from '@/components/forms/quotation-form-dialog';
import { QuotationStatusBadge } from '@/components/quotation-status-badge';
import { SendContactDialog } from '@/components/quotations/send-contact-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SoftModal } from '@/components/ui/soft-modal';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import {
  approveQuotation,
  convertQuotation,
  deleteQuotation,
  getPdfUrl,
  getQuotation,
  rejectQuotation,
  sendEmail,
  sendWhatsapp,
} from '@/lib/quotations-api';
import { formatPhonePretty } from '@/lib/validators/phone';

const CARD =
  'rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]';
const BTN_OUTLINE =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900';
const BTN_DANGER =
  'inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-2.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-950/30 dark:bg-rose-950/15 dark:text-rose-400';
const BTN_PRIMARY =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
const LABEL = 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500';

export default function QuotationDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => getQuotation(id),
    enabled: !!id,
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [waDialogOpen, setWaDialogOpen] = useState(false);

  // ?edit=1 abre el modal automáticamente y limpia el query param.
  useEffect(() => {
    if (!detail.data) return;
    if (searchParams.get('edit') !== '1') return;
    const editable =
      detail.data.status !== 'CONVERTED' && detail.data.status !== 'EXPIRED';
    if (editable) setEditOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('edit');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, detail.data]);

  const sendEmailMut = useMutation({
    mutationFn: (to?: string) => sendEmail(id, to),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation', id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success('Cotización enviada por email');
      setEmailDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo enviar el email')),
  });

  const sendWaMut = useMutation({
    mutationFn: (to?: string) => sendWhatsapp(id, to),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['quotation', id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      if (result.whatsappUrl) {
        window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      toast.success('Se abrió WhatsApp en otra pestaña');
      setWaDialogOpen(false);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo enviar por WhatsApp')),
  });

  const approveMut = useMutation({
    mutationFn: () => approveQuotation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation', id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success('Cotización aprobada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo aprobar')),
  });

  const rejectMut = useMutation({
    mutationFn: (notes?: string) => rejectQuotation(id, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation', id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success('Cotización rechazada');
      setRejectOpen(false);
      setRejectNotes('');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo rechazar')),
  });

  const convertMut = useMutation({
    mutationFn: () => convertQuotation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation', id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      router.push(`/ventas/nueva?fromQuotation=${id}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo convertir')),
  });

  // Ronda 9 — convert + generar guía. Llama el mismo endpoint de prefill
  // pero pasa `generateDispatch=1` en la URL para que /ventas/nueva
  // sepa que tras confirmar la venta hay que crear la guía.
  const convertAndDispatchMut = useMutation({
    mutationFn: () => convertQuotation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation', id] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
      router.push(`/ventas/nueva?fromQuotation=${id}&generateDispatch=1`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo convertir')),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteQuotation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success('Cotización eliminada');
      router.push('/cotizaciones');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <div className="h-10 w-1/3 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-32 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-64 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-slate-400">Cotización no encontrada.</p>
        <Link href="/cotizaciones" className={BTN_OUTLINE}>
          <ArrowLeft className="h-4 w-4" />
          Volver al listado
        </Link>
      </div>
    );
  }

  const q = detail.data;
  const editable = q.status !== 'CONVERTED' && q.status !== 'EXPIRED';
  const canSend = q.status === 'DRAFT' || q.status === 'SENT';
  const phone = q.customerView.phone;
  const email = q.customerView.email;
  const customerLabel = q.customerView.name?.trim() || 'Sin cliente';
  const showActionBar =
    canSend || q.status === 'SENT' || q.status === 'APPROVED';

  function copyPublicUrl() {
    if (!q.publicUrl) return;
    navigator.clipboard
      .writeText(q.publicUrl)
      .then(() => toast.success('Link público copiado'))
      .catch(() => toast.error('No se pudo copiar'));
  }

  function handleSendEmail() {
    if (email) {
      sendEmailMut.mutate(undefined);
    } else {
      setEmailDialogOpen(true);
    }
  }

  function handleSendWhatsapp() {
    if (phone) {
      sendWaMut.mutate(undefined);
    } else {
      setWaDialogOpen(true);
    }
  }

  const hasTempItems = (q.items ?? []).some((it) => it.isTemporary);
  const convertBusy = convertMut.isPending || convertAndDispatchMut.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <Link
            href="/cotizaciones"
            title="Volver"
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5 text-slate-500" />
          </Link>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {q.number}
              </h1>
              <QuotationStatusBadge status={q.status} />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Fecha:{' '}
              {new Date(q.date).toLocaleDateString('es-CL', { dateStyle: 'long' })}
              {q.validUntil
                ? ` · Vence: ${new Date(q.validUntil).toLocaleDateString('es-CL', { dateStyle: 'long' })}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <button type="button" className={BTN_OUTLINE} onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 text-slate-400" />
              Editar
            </button>
          )}
          <a
            href={getPdfUrl(q.id, 'letter')}
            target="_blank"
            rel="noopener noreferrer"
            title="Imprimir Carta"
            className={BTN_OUTLINE}
          >
            <Printer className="h-4 w-4 text-slate-400" />
            Imprimir Carta
          </a>
          <a
            href={getPdfUrl(q.id, 'thermal80')}
            target="_blank"
            rel="noopener noreferrer"
            title="Imprimir 80mm"
            className={BTN_OUTLINE}
          >
            <FileDown className="h-4 w-4 text-slate-400" />
            Imprimir 80mm
          </a>
          <button type="button" className={BTN_OUTLINE} onClick={copyPublicUrl}>
            <Copy className="h-4 w-4 text-slate-400" />
            Copiar link público
          </button>
          {q.status === 'DRAFT' && (
            <button type="button" className={BTN_DANGER} onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          )}
        </div>
      </div>

      {/* ============================================================
          BARRA DE ACCIONES (enviar / aprobar / convertir)
          ============================================================ */}
      {showActionBar && (
        <div className={`flex flex-wrap gap-2 ${CARD}`}>
          {canSend && (
            <>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={handleSendEmail}
                disabled={sendEmailMut.isPending}
              >
                <Mail className="h-4 w-4" />
                {sendEmailMut.isPending ? 'Enviando…' : 'Enviar por email'}
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={handleSendWhatsapp}
                disabled={sendWaMut.isPending}
              >
                <MessageCircle className="h-4 w-4" />
                {sendWaMut.isPending ? 'Enviando…' : 'Enviar por WhatsApp'}
              </button>
            </>
          )}
          {q.status === 'SENT' && (
            <>
              <button
                type="button"
                className={BTN_OUTLINE}
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
              >
                <Check className="h-4 w-4 text-emerald-500" />
                Marcar aprobada
              </button>
              <button
                type="button"
                className={BTN_DANGER}
                onClick={() => setRejectOpen(true)}
                disabled={rejectMut.isPending}
              >
                <X className="h-4 w-4" />
                Marcar rechazada
              </button>
            </>
          )}
          {/* La conversión a venta se permite desde BORRADOR, ENVIADA o
              APROBADA (el backend acepta esos estados). */}
          {(q.status === 'DRAFT' ||
            q.status === 'SENT' ||
            q.status === 'APPROVED') && (
            <>
              {/* Ronda 9 — split button: Convertir a venta + "Convertir y
                  generar guía". Con items temporales ambas se deshabilitan. */}
              <div className="inline-flex">
                <button
                  type="button"
                  onClick={() => convertMut.mutate()}
                  disabled={convertBusy || hasTempItems}
                  title={
                    hasTempItems
                      ? 'Hay productos temporales. Registralos en el catálogo o quitalos antes de convertir.'
                      : undefined
                  }
                  className={`${BTN_PRIMARY} rounded-r-none`}
                >
                  <ShoppingCart className="h-4 w-4" />
                  {convertBusy ? 'Procesando…' : 'Convertir a venta'}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={convertBusy || hasTempItems}
                      title="Más opciones"
                      className={`${BTN_PRIMARY} rounded-l-none border-l border-white/25 px-2`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => convertAndDispatchMut.mutate()}
                      disabled={convertBusy || hasTempItems}
                    >
                      <Truck className="mr-2 h-4 w-4" />
                      Convertir y generar guía
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {q.status === 'APPROVED' && (
                <button
                  type="button"
                  className={BTN_DANGER}
                  onClick={() => setRejectOpen(true)}
                  disabled={rejectMut.isPending}
                >
                  <X className="h-4 w-4" />
                  Marcar rechazada
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ============================================================
          CLIENTE + TOTALES
          ============================================================ */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={`space-y-3 ${CARD}`}>
          <h2 className={LABEL}>Datos del cliente</h2>
          <dl className="space-y-2 text-xs">
            <Row label="Tipo">
              {q.customerView.fromCatalog ? 'Cliente del catálogo' : 'Cliente libre'}
            </Row>
            <Row label="Nombre">
              <span className={q.customerView.name ? '' : 'italic text-slate-400'}>
                {customerLabel}
              </span>
            </Row>
            <Row label="RUT">{q.customerView.taxId || '—'}</Row>
            <Row label="Email">{q.customerView.email || '—'}</Row>
            <Row label="Teléfono">{phone ? formatPhonePretty(phone) : '—'}</Row>
          </dl>
        </div>

        <div className={`space-y-3 ${CARD}`}>
          <h2 className={LABEL}>Totales</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal neto</span>
              <span className="font-mono font-semibold">{formatCurrency(q.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>IVA</span>
              <span className="font-mono font-semibold">{formatCurrency(q.taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-950 dark:border-slate-850 dark:text-white">
              <span>Total</span>
              <span className="font-mono text-base font-black text-[#2F6BFF]">
                {formatCurrency(q.total)}
              </span>
            </div>
            {q.sentAt && (
              <div className="pt-1 text-[11px] text-slate-400">
                Enviada{' '}
                {new Date(q.sentAt).toLocaleString('es-CL', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================
          ITEMS
          ============================================================ */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="select-none border-b border-slate-100 p-5 dark:border-slate-850">
          <h2 className={LABEL}>Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
                <th className="w-[16%] py-3 pl-6">SKU</th>
                <th className="py-3">Producto</th>
                <th className="py-3 text-right">Cant.</th>
                <th className="py-3 text-right">P. Unit</th>
                <th className="py-3 text-right">Descuento</th>
                <th className="py-3 pr-6 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-850">
              {(q.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center font-bold text-slate-400">
                    Sin items.
                  </td>
                </tr>
              )}
              {(q.items ?? []).map((it) => (
                <tr
                  key={it.id}
                  className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-900/10"
                >
                  <td className="py-4 pl-6 font-mono text-slate-500 dark:text-slate-400">
                    {it.product?.sku ?? it.tempProductSku ?? '—'}
                  </td>
                  <td className="max-w-[280px] truncate py-4 font-bold text-slate-950 dark:text-white">
                    {it.product?.name ?? it.tempProductName ?? '—'}
                    {it.isTemporary && (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                        Temporal
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-right font-mono text-slate-700 dark:text-slate-300">
                    {it.qty}
                  </td>
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

      {/* ============================================================
          NOTAS
          ============================================================ */}
      {q.notes && (
        <div className={`space-y-2 ${CARD}`}>
          <h2 className={`flex items-center gap-2 ${LABEL}`}>
            <FileText className="h-3.5 w-3.5" />
            Notas
          </h2>
          <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            {q.notes}
          </p>
        </div>
      )}

      {/* ============================================================
          DIÁLOGOS
          ============================================================ */}
      <SoftModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Marcar como rechazada"
        subtitle="Podés registrar un motivo (opcional)"
      >
        <div className="space-y-4 p-5">
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Motivo del rechazo (opcional)"
            rows={4}
            className="w-full rounded-xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-800 transition-all placeholder:text-slate-400 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900 dark:text-white"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className={BTN_OUTLINE}
              onClick={() => setRejectOpen(false)}
              disabled={rejectMut.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              onClick={() => rejectMut.mutate(rejectNotes.trim() || undefined)}
              disabled={rejectMut.isPending}
            >
              {rejectMut.isPending ? 'Rechazando…' : 'Confirmar rechazo'}
            </button>
          </div>
        </div>
      </SoftModal>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="¿Eliminar cotización?"
        description={
          <>
            Esta acción es permanente. La cotización <strong>{q.number}</strong> se
            eliminará. Solo se pueden eliminar borradores.
          </>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          await deleteMut.mutateAsync();
        }}
      />

      <QuotationFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialData={q}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['quotation', id] });
          qc.invalidateQueries({ queryKey: ['quotations'] });
        }}
      />

      <SendContactDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        channel="email"
        defaultValue={email ?? ''}
        busy={sendEmailMut.isPending}
        onConfirm={(to) => sendEmailMut.mutateAsync(to)}
      />

      <SendContactDialog
        open={waDialogOpen}
        onOpenChange={setWaDialogOpen}
        channel="whatsapp"
        defaultValue={phone ?? ''}
        busy={sendWaMut.isPending}
        onConfirm={(to) => sendWaMut.mutateAsync(to)}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 font-semibold text-slate-400">{label}</dt>
      <dd className="truncate text-right font-bold text-slate-700 dark:text-slate-200">
        {children}
      </dd>
    </div>
  );
}
