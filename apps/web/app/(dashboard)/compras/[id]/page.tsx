'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Paperclip, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SupplierReturnDialog } from '@/components/forms/supplier-return-dialog';
import { publicDocumentUrl, uploadPurchaseInvoice } from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { addPurchaseInvoices, getPurchase, removePurchaseInvoice } from '@/lib/inventory-api';

const ACCEPTED_DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

/**
 * /compras/[id] — Rediseño UI (look de PurchaseDetail).
 *
 * SOLO UI/UX. La lógica es idéntica a la versión previa:
 *  · getPurchase(id) vía useQuery.
 *  · removeMut (removePurchaseInvoice) + ConfirmDialog para borrar archivo.
 *  · onSelectFiles → uploadPurchaseInvoice + addPurchaseInvoices (multi-archivo).
 *  · Apertura del SupplierReturnDialog (incluye ?return=1 para ops rápidas).
 *
 * Cambios visuales: header con back redondeado + título + botón "Devolver",
 * layout 2 columnas (items 2/3 + "Resumen de Valores" 1/3), sección de
 * facturas en grid de chips y card de notas. Total bruto en azul #2F6BFF.
 */
export default function CompraDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('return') === '1') setReturnOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar el archivo')),
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
        toast.success(
          `${uploaded.length} archivo${uploaded.length === 1 ? '' : 's'} agregado${uploaded.length === 1 ? '' : 's'}`,
        );
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo subir el archivo'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (pq.isLoading) {
    return <div className="h-40 w-full animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />;
  }
  if (!pq.data) {
    return (
      <div className="rounded-3xl border border-slate-100 bg-white p-6 text-sm font-semibold text-slate-400 dark:border-slate-850 dark:bg-[#11151C]">
        Compra no encontrada.
      </div>
    );
  }

  const p = pq.data;
  const invoices = p.invoices ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Link
            href="/compras"
            title="Volver"
            className="cursor-pointer rounded-xl border border-slate-100 bg-white p-2.5 text-slate-800 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-[#1E2530]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="space-y-0.5">
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white md:text-2xl">
              Compra del{' '}
              {new Date(p.date).toLocaleDateString('es-CL', { dateStyle: 'long' })}
            </h1>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-400">
              {p.supplier?.name ?? '—'}
              {p.warehouse?.name ? ` · Bodega ${p.warehouse.name}` : ''}
            </p>
          </div>
        </div>

        <button
          onClick={() => setReturnOpen(true)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-900 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:text-white dark:hover:bg-slate-900 sm:self-auto"
        >
          <RotateCcw className="h-4 w-4 text-slate-400" />
          <span>Devolver a proveedor</span>
        </button>
      </div>

      <SupplierReturnDialog purchase={p} open={returnOpen} onOpenChange={setReturnOpen} />

      {/* ============================================================
          ITEMS + RESUMEN
          ============================================================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Items (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <div className="select-none border-b border-slate-100 p-5 dark:border-slate-850">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Items Compra
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/20 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="w-[20%] py-3 pl-6">SKU</th>
                    <th className="py-3">Producto</th>
                    <th className="py-3 text-right">Cantidad</th>
                    <th className="py-3 text-right">Costo unit.</th>
                    <th className="w-[20%] py-3 pr-6 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800/60">
                  {p.items?.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/10">
                      <td className="py-4 pl-6 font-mono font-medium text-slate-500 dark:text-slate-400">
                        {it.product?.sku ?? '—'}
                      </td>
                      <td className="py-4 font-bold text-slate-950 dark:text-white">
                        {it.product?.name ?? '—'}
                      </td>
                      <td className="py-4 text-right font-mono font-bold text-slate-800 dark:text-slate-300">
                        {it.qty}
                      </td>
                      <td className="py-4 text-right font-mono text-slate-500">
                        {formatCurrency(it.unitCost)}
                      </td>
                      <td className="py-4 pr-6 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                        {formatCurrency(it.subtotal)}
                      </td>
                    </tr>
                  ))}
                  {(p.items?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center font-bold text-slate-400">
                        Sin ítems.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Resumen de valores (1/3) */}
        <div className="space-y-4">
          <div className="select-none space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
            <h3 className="border-b border-slate-100 pb-2 text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
              Resumen de Valores
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-500">
                <span>Subtotal neto</span>
                <span className="font-mono font-semibold">{formatCurrency(p.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>IVA</span>
                <span className="font-mono font-semibold">{formatCurrency(p.taxAmount)}</span>
              </div>
              <div className="my-2 border-t border-slate-100 dark:border-slate-850" />
              <div className="flex items-center justify-between text-sm font-bold text-slate-950 dark:text-white">
                <span>Total bruto</span>
                <span className="font-mono text-base font-black text-[#2F6BFF]">
                  {formatCurrency(p.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          FACTURAS ADJUNTAS
          ============================================================ */}
      <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Facturas adjuntas
          </h3>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onSelectFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition-all hover:border-[#2F6BFF]/45 hover:text-[#2F6BFF] disabled:opacity-50 dark:border-slate-850 dark:bg-slate-900 dark:text-white"
          >
            {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : <Plus className="h-4 w-4" />}
            <span>{uploading ? 'Subiendo…' : 'Agregar archivo'}</span>
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="text-xs font-semibold leading-relaxed text-slate-400">
            Esta compra no tiene archivos adjuntos. Subí PDF o imágenes con el botón de arriba.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-850 dark:bg-slate-900/50"
              >
                <a
                  href={publicDocumentUrl(inv.url) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={inv.originalName}
                  className="flex min-w-0 flex-1 items-center gap-2.5 truncate"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-xs font-bold text-slate-700 hover:underline dark:text-slate-200">
                    {inv.originalName}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ id: inv.id, name: inv.originalName })}
                  title="Eliminar factura"
                  className="shrink-0 cursor-pointer p-1 text-slate-400 transition-colors hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================================================
          NOTAS
          ============================================================ */}
      {p.notes && (
        <div className="space-y-1 rounded-2xl border border-slate-100 bg-white p-5 text-sm shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
          <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Notas
          </div>
          <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            {p.notes}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar archivo?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong> de esta compra. El archivo se
              borra del servidor.
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
