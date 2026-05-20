'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Paperclip,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SupplierReturnDialog } from '@/components/forms/supplier-return-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  publicDocumentUrl,
  uploadPurchaseInvoice,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import {
  addPurchaseInvoices,
  getPurchase,
  removePurchaseInvoice,
} from '@/lib/inventory-api';

const ACCEPTED_DOC_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

export default function CompraDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  // Ronda 11 — dialog para devolución a proveedor. Soporta apertura via
  // query param `?return=1` para ops rápidas desde /devoluciones.
  const [returnOpen, setReturnOpen] = useState(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('return') === '1') setReturnOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const pq = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => getPurchase(id),
    enabled: !!id,
  });

  const removeMut = useMutation({
    mutationFn: (invoiceId: string) => removePurchaseInvoice(id, invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase', id] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Archivo eliminado');
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo eliminar el archivo')),
  });

  async function onSelectFiles(files: FileList | null) {
    if (!files || files.length === 0 || !id) return;
    setUploading(true);
    const uploaded: Array<{
      url: string;
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
    }> = [];
    try {
      for (const file of Array.from(files)) {
        if (!ACCEPTED_DOC_MIMES.includes(file.type)) {
          toast.error(`"${file.name}": formato no permitido`);
          continue;
        }
        if (file.size > MAX_DOC_BYTES) {
          toast.error(`"${file.name}": supera 10 MB`);
          continue;
        }
        const result = await uploadPurchaseInvoice(file);
        uploaded.push(result);
      }
      if (uploaded.length > 0) {
        await addPurchaseInvoices(id, uploaded);
        qc.invalidateQueries({ queryKey: ['purchase', id] });
        qc.invalidateQueries({ queryKey: ['purchases'] });
        toast.success(`${uploaded.length} archivo${uploaded.length === 1 ? '' : 's'} agregado${uploaded.length === 1 ? '' : 's'}`);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo subir el archivo'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (pq.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!pq.data) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Compra no encontrada.
      </div>
    );
  }

  const p = pq.data;
  const invoices = p.invoices ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/compras">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">
            Compra del{' '}
            {new Date(p.date).toLocaleDateString('es-CL', { dateStyle: 'long' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {p.supplier?.name ?? '—'}
            {p.warehouse?.name ? ` · Bodega ${p.warehouse.name}` : ''}
          </p>
        </div>
        {/* Ronda 11 — devolución a proveedor desde el detalle de la compra. */}
        <Button variant="outline" onClick={() => setReturnOpen(true)}>
          <RotateCcw className="h-4 w-4" />
          Devolver a proveedor
        </Button>
      </div>

      <SupplierReturnDialog
        purchase={p}
        open={returnOpen}
        onOpenChange={setReturnOpen}
      />

      {/* Items */}
      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Items</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Costo unit.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.items?.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-mono text-xs">
                  {it.product?.sku ?? '—'}
                </TableCell>
                <TableCell>{it.product?.name ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {it.qty}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCurrency(it.unitCost)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(it.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totales */}
      <div className="ml-auto max-w-md rounded-md border bg-card p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal neto</span>
          <span className="tabular-nums">{formatCurrency(p.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">IVA</span>
          <span className="tabular-nums">{formatCurrency(p.taxAmount)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total bruto</span>
          <span className="tabular-nums">{formatCurrency(p.total)}</span>
        </div>
      </div>

      {/* Facturas (multi-archivo, Ronda 7) */}
      <div className="rounded-md border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Facturas adjuntas</h2>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onSelectFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {uploading ? 'Subiendo…' : 'Agregar archivo'}
          </Button>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta compra no tiene archivos adjuntos. Subí PDF o imágenes con
            el botón de arriba.
          </p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm"
              >
                <Paperclip className="h-4 w-4 shrink-0" />
                <a
                  href={publicDocumentUrl(inv.url) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate hover:underline"
                  title={inv.originalName}
                >
                  {inv.originalName}
                </a>
                <span className="text-xs text-muted-foreground">
                  {new Date(inv.uploadedAt).toLocaleDateString('es-CL', {
                    dateStyle: 'short',
                  })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setDeleteTarget({ id: inv.id, name: inv.originalName })
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {p.notes && (
        <div className="rounded-md border bg-card p-4 text-sm">
          <div className="mb-1 font-medium">Notas</div>
          <p className="whitespace-pre-wrap text-muted-foreground">{p.notes}</p>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar archivo?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong> de esta
              compra. El archivo se borra del servidor.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget) await removeMut.mutateAsync(deleteTarget.id);
        }}
      />
    </div>
  );
}
