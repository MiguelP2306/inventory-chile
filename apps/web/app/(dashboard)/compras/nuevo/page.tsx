'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Paperclip, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ProductPicker } from '@/components/product-picker';
import { getCompanySettings, publicDocumentUrl, uploadPurchaseInvoice } from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import { createPurchase, listSuppliers, type PurchaseInput } from '@/lib/inventory-api';
import { invalidateProductCaches } from '@/lib/invalidate-product-caches';
import { listAvailableSupplierCredits } from '@/lib/supplier-credits-api';
import { listWarehouses } from '@/lib/warehouses-api';
import type { WarehouseDto } from '@inventory/shared';

interface ItemRow {
  productId: string;
  sku: string | null;
  name: string;
  qty: number;
  unitCost: string;
}

const ACCEPTED_DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

/**
 * /compras/nuevo — Rediseño UI (look de PurchaseCreate).
 *
 * SOLO UI/UX. TODA la lógica de la versión previa se conserva 1:1:
 *  · supplier/warehouse/date/notes, default de bodega "Principal".
 *  · Upload multi-factura (uploadPurchaseInvoice) con validación de mime/size.
 *  · ProductPicker real para agregar ítems (NO el modal del mock).
 *  · taxOverride (IVA editable) + recálculo de neto/subtotal.
 *  · Créditos de proveedor (listAvailableSupplierCredits) + aplicaciones.
 *  · createPurchase + invalidación de caches y redirect.
 *
 * Cambios visuales: header font-black con botones, card panel rounded-2xl con
 * labels uppercase, dropzone de facturas, tabla de ítems en sheet, panel de
 * créditos y footer de totales con Total bruto en #2F6BFF.
 *
 * NOTA: el mock usaba un <select> nativo de proveedor y un modal manual para
 * ítems; mantuve tu <ProductPicker> real (mejor lógica: busca catálogo, trae
 * costo y SKU). El selector de proveedor sí pasó a <select> nativo estilizado.
 */
export default function NuevaCompraPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [invoices, setInvoices] = useState<Array<{ url: string; originalName: string }>>([]);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  const warehousesQ = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ active: 'true' }),
  });
  const activeWarehouses: WarehouseDto[] = Array.isArray(warehousesQ.data)
    ? warehousesQ.data
    : warehousesQ.data?.items ?? [];
  useEffect(() => {
    if (warehouseId || activeWarehouses.length === 0) return;
    const principal = activeWarehouses.find((w) => w.name === 'Principal');
    setWarehouseId((principal ?? activeWarehouses[0]!).id);
  }, [warehouseId, activeWarehouses]);
  const selectedWarehouse = activeWarehouses.find((w) => w.id === warehouseId) ?? null;

  const [taxOverride, setTaxOverride] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });
  const settings = useQuery({ queryKey: ['settings', 'company'], queryFn: getCompanySettings });
  const taxRate = Number(settings.data?.taxRate ?? '0.19');

  const totalBruto = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.unitCost) || 0) * (it.qty || 0), 0),
    [items],
  );

  const autoTax = totalBruto - totalBruto / (1 + taxRate);
  const taxAmount = taxOverride !== null ? Number(taxOverride) : autoTax;
  const subtotalNeto = totalBruto - taxAmount;

  const creditsQ = useQuery({
    queryKey: ['supplier-credits', 'available', supplierId],
    queryFn: () => listAvailableSupplierCredits(supplierId),
    enabled: !!supplierId,
  });
  const availableCredits = creditsQ.data ?? [];

  const [creditApplications, setCreditApplications] = useState<Record<string, string>>({});
  useEffect(() => {
    setCreditApplications({});
  }, [supplierId]);

  const totalCreditApplied = useMemo(
    () => Object.values(creditApplications).reduce((acc, v) => acc + (Number(v) || 0), 0),
    [creditApplications],
  );
  const cashToPay = Math.max(0, totalBruto - totalCreditApplied);
  const creditExceedsTotal = totalCreditApplied > totalBruto + 0.005;

  const valid =
    !!supplierId &&
    !!warehouseId &&
    items.length > 0 &&
    items.every((i) => i.qty > 0 && Number(i.unitCost) >= 0) &&
    !creditExceedsTotal;

  const mut = useMutation({
    mutationFn: (input: PurchaseInput) => createPurchase(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      invalidateProductCaches(qc);
      toast.success('Compra registrada');
      router.push('/compras');
      router.refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo registrar')),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const creditList = Object.entries(creditApplications)
      .map(([cid, amt]) => ({ supplierCreditId: cid, amount: amt }))
      .filter((c) => Number(c.amount) > 0);
    mut.mutate({
      supplierId,
      warehouseId,
      date,
      notes: notes.trim() || undefined,
      invoiceUrls: invoices.length > 0 ? invoices.map((i) => i.url) : undefined,
      taxAmountOverride: taxOverride !== null ? Number(taxOverride).toFixed(2) : undefined,
      creditApplications: creditList.length > 0 ? creditList : undefined,
      items: items.map((i) => ({ productId: i.productId, qty: i.qty, unitCost: i.unitCost })),
    });
  }

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  useEffect(() => {
    if (taxOverride === null) return;
    if (Math.abs(Number(taxOverride) - autoTax) < 0.005) setTaxOverride(null);
  }, [autoTax, taxOverride]);

  async function onSelectInvoices(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingInvoice(true);
    const arr = Array.from(files);
    try {
      for (const file of arr) {
        if (!ACCEPTED_DOC_MIMES.includes(file.type)) {
          toast.error(`"${file.name}": formato no permitido (PDF/JPG/PNG/WEBP)`);
          continue;
        }
        if (file.size > MAX_DOC_BYTES) {
          toast.error(`"${file.name}": supera 10 MB`);
          continue;
        }
        const result = await uploadPurchaseInvoice(file);
        setInvoices((prev) => [...prev, { url: result.url, originalName: result.originalName }]);
      }
      toast.success(`${arr.length} archivo${arr.length === 1 ? '' : 's'} subido${arr.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo subir un archivo'));
    } finally {
      setUploadingInvoice(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const inputCls =
    'w-full text-xs font-semibold px-3.5 py-3 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 border border-transparent focus:border-[#2F6BFF] rounded-xl transition-all text-slate-850 dark:text-white';

  return (
    <form onSubmit={onSubmit} className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex select-none flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white md:text-2xl">
          Nueva entrada de mercadería
        </h1>
        <div className="flex w-full gap-2.5 self-start text-xs font-bold sm:w-auto sm:self-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 cursor-pointer rounded-xl border border-slate-200 px-5 py-3 text-center text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:text-slate-300 dark:hover:bg-slate-900 sm:flex-initial"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || mut.isPending || uploadingInvoice}
            className="flex-1 cursor-pointer rounded-xl bg-slate-950 px-5 py-3 text-center font-bold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950 sm:flex-initial"
          >
            {mut.isPending
              ? 'Guardando…'
              : selectedWarehouse
                ? `Registrar compra en ${selectedWarehouse.name}`
                : 'Registrar compra'}
          </button>
        </div>
      </div>

      {/* ============================================================
          CARD: datos generales
          ============================================================ */}
      <div className="space-y-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Proveedor */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Proveedor <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                className={`${inputCls} appearance-none pr-10`}
              >
                <option value="">Seleccioná un proveedor</option>
                {suppliers.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
            </div>
            {suppliers.data?.length === 0 && (
              <p className="text-[10px] text-slate-400">No hay proveedores. Creá uno en /proveedores.</p>
            )}
          </div>

          {/* Bodega destino */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Bodega destino
            </label>
            <div className="relative">
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className={`${inputCls} appearance-none pr-10`}
              >
                {activeWarehouses.length === 0 && <option value="">No hay bodegas activas.</option>}
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-400">La mercadería ingresa al stock de esta bodega.</p>
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Fecha
            </label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Facturas + notas */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Factura adjunta (opcional)
            </label>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onSelectInvoices(e.target.files)}
            />
            <div
              onClick={() => !uploadingInvoice && inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 p-5 text-center transition-all hover:border-[#2F6BFF]/65 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/10"
            >
              <UploadCloud className="mb-2 h-8 w-8 text-slate-400" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-200">
                {uploadingInvoice
                  ? 'Subiendo…'
                  : invoices.length > 0
                    ? 'Agregar más facturas (PDF / imagen)'
                    : 'Subir facturas (PDF / imagen, múltiples)'}
              </span>
              <p className="mt-1 text-[10px] text-slate-400">Haz click para agregar archivos de respaldo.</p>
              {invoices.length > 0 && (
                <span className="mt-2.5 inline-flex rounded-lg bg-[#2F6BFF]/10 px-2.5 py-1 text-[10px] font-black text-[#2F6BFF]">
                  {invoices.length} archivo(s) adjunto(s)
                </span>
              )}
            </div>

            {invoices.length > 0 && (
              <ul className="space-y-1 pt-1">
                {invoices.map((inv, idx) => (
                  <li
                    key={inv.url}
                    className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2 text-xs dark:border-slate-850 dark:bg-slate-900/50"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                    <a
                      href={publicDocumentUrl(inv.url) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate font-bold text-slate-600 hover:underline dark:text-slate-300"
                      title={inv.originalName}
                    >
                      {inv.originalName}
                    </a>
                    <button
                      type="button"
                      onClick={() => setInvoices((prev) => prev.filter((_, i) => i !== idx))}
                      className="shrink-0 cursor-pointer p-1 text-slate-400 hover:text-rose-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Notas (opcional)
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remito, observaciones, etc."
              className="w-full rounded-2xl border border-transparent bg-slate-50 px-3.5 py-3 text-xs font-medium transition-all focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/15 dark:bg-slate-900"
            />
          </div>
        </div>
      </div>

      {/* ============================================================
          ITEMS
          ============================================================ */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="flex select-none items-center justify-between border-b border-slate-100 p-5 dark:border-slate-850">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Items
          </h3>
          {/* ProductPicker real — su botón se restilea con buttonClassName si lo
              soporta; si no, conserva su estilo y la lógica intacta. */}
          <ProductPicker
            buttonLabel="Agregar producto"
            onPick={(p) => {
              if (items.some((i) => i.productId === p.id)) {
                toast.info('El producto ya está en la lista');
                return;
              }
              setItems((prev) => [
                ...prev,
                { productId: p.id, sku: p.sku, name: p.name, qty: 1, unitCost: p.cost ?? '0' },
              ]);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/20 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
                <th className="w-[18%] py-3 pl-6">SKU</th>
                <th className="py-3">Producto</th>
                <th className="w-[120px] py-3 text-right">Cantidad</th>
                <th className="w-[170px] py-3 text-right">Costo unit. (bruto)</th>
                <th className="w-[140px] py-3 text-right">Subtotal</th>
                <th className="w-[70px] py-3 pr-6 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-850">
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="select-none py-12 text-center text-xs font-bold text-slate-400">
                    Agregá al menos un producto.
                  </td>
                </tr>
              )}
              {items.map((it, idx) => {
                const subtotal = ((Number(it.unitCost) || 0) * (it.qty || 0)).toFixed(2);
                return (
                  <tr key={it.productId} className="hover:bg-slate-50/10 dark:hover:bg-slate-900/10">
                    <td className="py-4 pl-6 font-mono text-slate-500">{it.sku ?? '—'}</td>
                    <td className="py-4 font-bold text-slate-950 dark:text-white">{it.name}</td>
                    <td className="py-4 text-right">
                      <input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value) || 0) })}
                        className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs font-bold focus:border-[#2F6BFF] focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-4 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={it.unitCost}
                        onChange={(e) => updateItem(idx, { unitCost: e.target.value })}
                        className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs focus:border-[#2F6BFF] focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-4 text-right font-mono font-extrabold text-[#2F6BFF]">
                      {formatCurrency(subtotal)}
                    </td>
                    <td className="py-4 pr-6 text-center">
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        title="Eliminar artículo"
                        className="cursor-pointer p-1.5 text-slate-400 transition-colors hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
          CRÉDITOS DEL PROVEEDOR
          ============================================================ */}
      {availableCredits.length > 0 && items.length > 0 && (
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Créditos disponibles del proveedor
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Generados por devoluciones con reembolso "Crédito a favor". Marcá los que querés
                aplicar y editá el monto si querés usar sólo una parte.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Saldo total a favor
              </div>
              <div className="font-mono text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(
                  availableCredits.reduce((acc, c) => acc + parseFloat(c.balance), 0).toFixed(2),
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {availableCredits.map((c) => {
              const checked = creditApplications[c.id] !== undefined;
              const value = creditApplications[c.id] ?? c.balance;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-850 dark:bg-[#11151C]"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#2F6BFF]"
                      checked={checked}
                      onChange={(e) =>
                        setCreditApplications((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next[c.id] = c.balance;
                          else delete next[c.id];
                          return next;
                        })
                      }
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Crédito #{c.id.slice(0, 8)}
                        {c.sourceReturn && (
                          <span className="ml-2 text-[10px] font-medium text-slate-400">
                            · origen {c.sourceReturn.number}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Disponible: {formatCurrency(c.balance)}
                      </div>
                    </div>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!checked}
                    value={value}
                    onChange={(e) =>
                      setCreditApplications((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#2F6BFF] focus:outline-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900"
                  />
                </div>
              );
            })}
          </div>
          {creditExceedsTotal && (
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50/60 p-2 text-[11px] font-semibold text-rose-500 dark:border-rose-950/30 dark:bg-rose-950/10">
              El total de créditos aplicados ({formatCurrency(totalCreditApplied.toFixed(2))}) supera
              el total de la compra ({formatCurrency(totalBruto.toFixed(2))}).
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          TOTALES
          ============================================================ */}
      {items.length > 0 && (
        <div className="flex md:justify-end">
          <div className="w-full space-y-2 rounded-2xl border border-slate-100 bg-white p-5 text-xs shadow-sm dark:border-slate-850 dark:bg-[#11151C] md:w-96">
            <div className="flex justify-between text-slate-500">
              <span>Total bruto</span>
              <span className="font-mono font-semibold">{formatCurrency(totalBruto.toFixed(2))}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-slate-500">
              <span>IVA ({(taxRate * 100).toFixed(2)}%)</span>
              <input
                type="text"
                inputMode="decimal"
                value={taxOverride !== null ? taxOverride : autoTax.toFixed(2)}
                onChange={(e) => setTaxOverride(e.target.value)}
                className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#2F6BFF] focus:outline-none dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-500 dark:border-slate-850">
              <span>Subtotal neto</span>
              <span className="font-mono">{formatCurrency(subtotalNeto.toFixed(2))}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-950 dark:border-slate-850 dark:text-white">
              <span>Total</span>
              <span className="font-mono text-base font-black text-[#2F6BFF]">
                {formatCurrency(totalBruto.toFixed(2))}
              </span>
            </div>
            {totalCreditApplied > 0 && (
              <>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Crédito aplicado</span>
                  <span className="font-mono">− {formatCurrency(totalCreditApplied.toFixed(2))}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-950 dark:border-slate-850 dark:text-white">
                  <span>Total a pagar en caja</span>
                  <span className="font-mono">{formatCurrency(cashToPay.toFixed(2))}</span>
                </div>
              </>
            )}
            {taxOverride !== null && (
              <p className="text-[10px] text-slate-400">
                IVA editado manualmente. El subtotal neto se ajusta para que la suma cuadre con el
                total bruto.
              </p>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
