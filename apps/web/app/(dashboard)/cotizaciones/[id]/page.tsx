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
import { QuotationFormDialog } from '@/components/forms/quotation-form-dialog';
import { QuotationStatusBadge } from '@/components/quotation-status-badge';
import { SendContactDialog } from '@/components/quotations/send-contact-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
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
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Cotización no encontrada.</p>
        <Button variant="outline" asChild>
          <Link href="/cotizaciones">
            <ArrowLeft className="h-4 w-4" />
            Volver al listado
          </Link>
        </Button>
      </div>
    );
  }

  const q = detail.data;
  const editable = q.status !== 'CONVERTED' && q.status !== 'EXPIRED';
  const canSend = q.status === 'DRAFT' || q.status === 'SENT';
  const phone = q.customerView.phone;
  const email = q.customerView.email;
  const customerLabel = q.customerView.name?.trim() || 'Sin cliente';

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/cotizaciones">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold font-mono">{q.number}</h1>
            <QuotationStatusBadge status={q.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Fecha:{' '}
            {new Date(q.date).toLocaleDateString('es-CL', {
              dateStyle: 'long',
            })}
            {q.validUntil
              ? ` · Vence: ${new Date(q.validUntil).toLocaleDateString('es-CL', { dateStyle: 'long' })}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            title="Imprimir Carta"
          >
            <a
              href={getPdfUrl(q.id, 'letter')}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer className="h-4 w-4" />
              Imprimir Carta
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            title="Imprimir 80mm"
          >
            <a
              href={getPdfUrl(q.id, 'thermal80')}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="h-4 w-4" />
              Imprimir 80mm
            </a>
          </Button>
          <Button variant="outline" onClick={copyPublicUrl}>
            <Copy className="h-4 w-4" />
            Copiar link público
          </Button>
          {q.status === 'DRAFT' && (
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      {(canSend ||
        q.status === 'SENT' ||
        q.status === 'APPROVED') && (
        <div className="flex flex-wrap gap-2 rounded-md border bg-card p-4">
          {canSend && (
            <>
              <Button
                onClick={handleSendEmail}
                disabled={sendEmailMut.isPending}
              >
                <Mail className="h-4 w-4" />
                {sendEmailMut.isPending
                  ? 'Enviando...'
                  : 'Enviar por email'}
              </Button>
              <Button
                onClick={handleSendWhatsapp}
                disabled={sendWaMut.isPending}
              >
                <MessageCircle className="h-4 w-4" />
                {sendWaMut.isPending ? 'Enviando...' : 'Enviar por WhatsApp'}
              </Button>
            </>
          )}
          {q.status === 'SENT' && (
            <>
              <Button
                variant="outline"
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
              >
                <Check className="h-4 w-4" />
                Marcar aprobada
              </Button>
              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={rejectMut.isPending}
              >
                <X className="h-4 w-4" />
                Marcar rechazada
              </Button>
            </>
          )}
          {q.status === 'APPROVED' && (
            <>
              {/* Ronda 9 — split button: Convertir a venta + opción
                  "Convertir y generar guía". Si la cotización tiene items
                  temporales (productos no del catálogo), ambas opciones
                  se deshabilitan con tooltip explicativo. */}
              {(() => {
                const hasTempItems = (q.items ?? []).some(
                  (it) => it.isTemporary,
                );
                const busy =
                  convertMut.isPending || convertAndDispatchMut.isPending;
                return (
                  <div className="inline-flex">
                    <Button
                      onClick={() => convertMut.mutate()}
                      disabled={busy || hasTempItems}
                      title={
                        hasTempItems
                          ? 'Hay productos temporales. Registralos en el catálogo o quitalos antes de convertir.'
                          : undefined
                      }
                      className="rounded-r-none"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      {busy ? 'Procesando...' : 'Convertir a venta'}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          disabled={busy || hasTempItems}
                          className="rounded-l-none border-l border-primary-foreground/20 px-2"
                          title="Más opciones"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => convertAndDispatchMut.mutate()}
                          disabled={busy || hasTempItems}
                        >
                          <Truck className="mr-2 h-4 w-4" />
                          Convertir y generar guía
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })()}
              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={rejectMut.isPending}
              >
                <X className="h-4 w-4" />
                Marcar rechazada
              </Button>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-md border bg-card p-4">
          <h2 className="font-medium">Datos del cliente</h2>
          <div className="text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Tipo: </span>
              {q.customerView.fromCatalog ? 'Cliente del catálogo' : 'Cliente libre'}
            </div>
            <div>
              <span className="text-muted-foreground">Nombre: </span>
              <span
                className={
                  q.customerView.name ? '' : 'italic text-muted-foreground'
                }
              >
                {customerLabel}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">RUT: </span>
              {q.customerView.taxId || '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Email: </span>
              {q.customerView.email || '—'}
            </div>
            <div>
              <span className="text-muted-foreground">Teléfono: </span>
              {phone ? formatPhonePretty(phone) : '—'}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-md border bg-card p-4">
          <h2 className="font-medium">Totales</h2>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal neto</span>
              <span className="tabular-nums">
                {formatCurrency(q.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA</span>
              <span className="tabular-nums">
                {formatCurrency(q.taxAmount)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(q.total)}</span>
            </div>
            {q.sentAt && (
              <div className="pt-2 text-xs text-muted-foreground">
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

      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Items</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">P. Unit</TableHead>
              <TableHead className="text-right">Descuento</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.items ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin items.
                </TableCell>
              </TableRow>
            )}
            {(q.items ?? []).map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">
                  {it.product?.sku ?? '—'}
                </TableCell>
                <TableCell className="max-w-[280px] truncate">
                  {it.product?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {it.qty}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(it.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {it.discountPercent
                    ? `${Number(it.discountPercent).toFixed(0)}%`
                    : Number(it.discount) > 0
                      ? formatCurrency(it.discount)
                      : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(it.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {q.notes && (
        <div className="rounded-md border bg-card p-4">
          <h2 className="font-medium mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notas
          </h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {q.notes}
          </p>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como rechazada</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Podés agregar un motivo (opcional) para registrar por qué se rechazó.
            </p>
            <Textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Motivo del rechazo (opcional)"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={rejectMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => rejectMut.mutate(rejectNotes.trim() || undefined)}
              disabled={rejectMut.isPending}
            >
              {rejectMut.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar cotización?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta acción es permanente. La cotización {q.number} se eliminará. Solo se
            pueden eliminar borradores.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
