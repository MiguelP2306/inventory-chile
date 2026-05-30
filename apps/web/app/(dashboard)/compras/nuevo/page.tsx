'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Trash2, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ProductPicker } from '@/components/product-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getCompanySettings,
  publicDocumentUrl,
  uploadPurchaseInvoice,
} from '@/lib/cashbox-api';
import { invalidateProductCaches } from '@/lib/invalidate-product-caches';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import {
  createPurchase,
  listSuppliers,
  type PurchaseInput,
} from '@/lib/inventory-api';
import { listAvailableSupplierCredits } from '@/lib/supplier-credits-api';
import { listWarehouses } from '@/lib/warehouses-api';
import type { WarehouseDto } from '@inventory/shared';

interface ItemRow {
  productId: string;
  // Ronda 9 — sku puede ser null si el producto se creó sin SKU manual.
  sku: string | null;
  name: string;
  qty: number;
  unitCost: string;
}

const ACCEPTED_DOC_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_DOC_BYTES = 10 * 1024 * 1024;

export default function NuevaCompraPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  // Ronda 7 — multi-factura. Cada item es una URL relativa devuelta por el
  // backend tras subir el archivo. Mantiene también el nombre original para
  // mostrar al operador qué subió. El submit envía solo las URLs en
  // `invoiceUrls`; los metadatos se derivan en backend desde el nombre.
  const [invoices, setInvoices] = useState<
    Array<{ url: string; originalName: string }>
  >([]);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  // Bodegas activas para el selector. La compra es obligatoria: si no se
  // selecciona, no se puede registrar. Default = "Principal" si está activa,
  // si no la primera activa por orden alfabético.
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
  const selectedWarehouse =
    activeWarehouses.find((w) => w.id === warehouseId) ?? null;
  // El IVA puede sobreescribirse para coincidir con la factura real del
  // proveedor. Mientras `taxOverride` sea null, el subtotal/IVA se
  // recalculan automáticamente desde el total bruto.
  const [taxOverride, setTaxOverride] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });
  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
  });
  const taxRate = Number(settings.data?.taxRate ?? '0.19');

  const totalBruto = useMemo(
    () =>
      items.reduce(
        (acc, it) => acc + (Number(it.unitCost) || 0) * (it.qty || 0),
        0,
      ),
    [items],
  );

  const autoTax = totalBruto - totalBruto / (1 + taxRate);
  const taxAmount = taxOverride !== null ? Number(taxOverride) : autoTax;
  const subtotalNeto = totalBruto - taxAmount;

  // Ronda 9 — créditos a favor disponibles para el proveedor seleccionado.
  // Sólo se cargan cuando hay un proveedor elegido. La card se renderiza
  // solo si hay al menos un crédito con balance > 0.
  const creditsQ = useQuery({
    queryKey: ['supplier-credits', 'available', supplierId],
    queryFn: () => listAvailableSupplierCredits(supplierId),
    enabled: !!supplierId,
  });
  const availableCredits = creditsQ.data ?? [];

  // Map<creditId, monto a aplicar>. Empieza vacío; el operador tilda los
  // créditos y opcionalmente edita el monto (default = balance del crédito).
  const [creditApplications, setCreditApplications] = useState<
    Record<string, string>
  >({});

  // Si cambia el proveedor, limpiamos las aplicaciones (los créditos eran
  // del proveedor anterior y no aplican al nuevo).
  useEffect(() => {
    setCreditApplications({});
  }, [supplierId]);

  const totalCreditApplied = useMemo(
    () =>
      Object.values(creditApplications).reduce(
        (acc, v) => acc + (Number(v) || 0),
        0,
      ),
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
      // La compra recalcula el costo ponderado del producto (motor de lotes),
      // así que hay que refrescar todas las vistas que muestran ese costo:
      // listado, detalle, buscador/picker y stock del bolso.
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
    // Ronda 9 — mapeo de aplicaciones a payload. Sólo entrega los créditos
    // con monto > 0 (un crédito tildado pero con monto 0 se omite).
    const creditList = Object.entries(creditApplications)
      .map(([id, amt]) => ({ supplierCreditId: id, amount: amt }))
      .filter((c) => Number(c.amount) > 0);
    mut.mutate({
      supplierId,
      warehouseId,
      date,
      notes: notes.trim() || undefined,
      invoiceUrls: invoices.length > 0 ? invoices.map((i) => i.url) : undefined,
      taxAmountOverride:
        taxOverride !== null ? Number(taxOverride).toFixed(2) : undefined,
      creditApplications: creditList.length > 0 ? creditList : undefined,
      items: items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        unitCost: i.unitCost,
      })),
    });
  }

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  // Si el operador edita el IVA y queda igual al auto-calculado, limpiamos el
  // override para que vuelva a recalcularse al cambiar items.
  useEffect(() => {
    if (taxOverride === null) return;
    if (Math.abs(Number(taxOverride) - autoTax) < 0.005) {
      setTaxOverride(null);
    }
  }, [autoTax, taxOverride]);

  /**
   * Ronda 7 — subir N archivos. El operador puede seleccionar varios
   * archivos a la vez (el input tiene `multiple`); cada uno se sube
   * secuencialmente y se acumula en `invoices`. Si alguno falla los
   * anteriores quedan subidos — el flujo es agregar y los otros se
   * suman.
   */
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
        setInvoices((prev) => [
          ...prev,
          { url: result.url, originalName: result.originalName },
        ]);
      }
      toast.success(`${arr.length} archivo${arr.length === 1 ? '' : 's'} subido${arr.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo subir un archivo'));
    } finally {
      setUploadingInvoice(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nueva entrada de mercadería</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || mut.isPending || uploadingInvoice}>
            {mut.isPending
              ? 'Guardando...'
              : selectedWarehouse
                ? `Registrar compra en ${selectedWarehouse.name}`
                : 'Registrar compra'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-md border bg-card p-6 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Proveedor</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccioná un proveedor" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.data?.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No hay proveedores. Creá uno en /proveedores.
                </div>
              )}
              {suppliers.data?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Bodega destino</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccioná bodega" />
            </SelectTrigger>
            <SelectContent>
              {activeWarehouses.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No hay bodegas activas.
                </div>
              )}
              {activeWarehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            La mercadería ingresa al stock de esta bodega.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Fecha</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Factura adjunta (opcional)</Label>
          {/* Ronda 7 — input `multiple` para subir N archivos a la vez. La
              lista de los ya subidos se renderiza debajo con un botón de
              eliminar individual antes de confirmar la compra. */}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onSelectInvoices(e.target.files)}
          />
          {invoices.length > 0 && (
            <ul className="space-y-1">
              {invoices.map((inv, idx) => (
                <li
                  key={inv.url}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm"
                >
                  <Paperclip className="h-4 w-4 shrink-0" />
                  <a
                    href={publicDocumentUrl(inv.url) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 truncate text-muted-foreground hover:underline"
                    title={inv.originalName}
                  >
                    {inv.originalName}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setInvoices((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploadingInvoice}
            className="w-full justify-start"
          >
            <Upload className="h-4 w-4" />
            {uploadingInvoice
              ? 'Subiendo...'
              : invoices.length > 0
                ? 'Agregar más facturas (PDF / imagen)'
                : 'Subir facturas (PDF / imagen, múltiples)'}
          </Button>
        </div>
        <div className="space-y-2 md:col-span-3">
          <Label>Notas (opcional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Remito, observaciones, etc."
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-medium">Items</h2>
          <ProductPicker
            buttonLabel="Agregar producto"
            onPick={(p) => {
              if (items.some((i) => i.productId === p.id)) {
                toast.info('El producto ya está en la lista');
                return;
              }
              setItems((prev) => [
                ...prev,
                {
                  productId: p.id,
                  sku: p.sku,
                  name: p.name,
                  qty: 1,
                  unitCost: p.cost ?? '0',
                },
              ]);
            }}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="w-[120px] text-right">Cantidad</TableHead>
              <TableHead className="w-[160px] text-right">Costo unit. (bruto)</TableHead>
              <TableHead className="w-[140px] text-right">Subtotal</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Agregá al menos un producto.
                </TableCell>
              </TableRow>
            )}
            {items.map((it, idx) => {
              const subtotal = ((Number(it.unitCost) || 0) * (it.qty || 0)).toFixed(2);
              return (
                <TableRow key={it.productId}>
                  <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                  <TableCell>{it.name}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) =>
                        updateItem(idx, { qty: Math.max(1, Number(e.target.value) || 0) })
                      }
                      className="text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={it.unitCost}
                      onChange={(e) => updateItem(idx, { unitCost: e.target.value })}
                      className="text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(subtotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Ronda 9 — créditos a favor disponibles del proveedor. */}
      {availableCredits.length > 0 && items.length > 0 && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Créditos disponibles del proveedor</h3>
              <p className="text-xs text-muted-foreground">
                Generados por devoluciones a este proveedor con reembolso
                "Crédito a favor". Marcá los que querés aplicar y editá el
                monto si querés usar sólo una parte.
              </p>
            </div>
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Saldo total a favor</div>
              <div className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(
                  availableCredits
                    .reduce((acc, c) => acc + parseFloat(c.balance), 0)
                    .toFixed(2),
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
                  className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={(e) => {
                        setCreditApplications((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) {
                            next[c.id] = c.balance;
                          } else {
                            delete next[c.id];
                          }
                          return next;
                        });
                      }}
                    />
                    <div>
                      <div className="text-sm font-medium">
                        Crédito #{c.id.slice(0, 8)}
                        {c.sourceReturn && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            · origen {c.sourceReturn.number}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Disponible: {formatCurrency(c.balance)}
                      </div>
                    </div>
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    disabled={!checked}
                    value={value}
                    onChange={(e) =>
                      setCreditApplications((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    className="w-32 text-right tabular-nums"
                  />
                </div>
              );
            })}
          </div>
          {creditExceedsTotal && (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              El total de créditos aplicados ({formatCurrency(totalCreditApplied.toFixed(2))})
              supera el total de la compra ({formatCurrency(totalBruto.toFixed(2))}).
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="ml-auto max-w-md rounded-md border bg-card p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total bruto</span>
            <span className="tabular-nums font-medium">
              {formatCurrency(totalBruto.toFixed(2))}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              IVA ({(taxRate * 100).toFixed(2)}%)
            </span>
            <Input
              type="text"
              inputMode="decimal"
              value={taxOverride !== null ? taxOverride : autoTax.toFixed(2)}
              onChange={(e) => setTaxOverride(e.target.value)}
              className="w-32 text-right tabular-nums"
            />
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="text-muted-foreground">Subtotal neto</span>
            <span className="tabular-nums">
              {formatCurrency(subtotalNeto.toFixed(2))}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totalBruto.toFixed(2))}</span>
          </div>
          {/* Ronda 9 — desglose del crédito aplicado y total a pagar. */}
          {totalCreditApplied > 0 && (
            <>
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Crédito aplicado</span>
                <span className="tabular-nums">
                  − {formatCurrency(totalCreditApplied.toFixed(2))}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total a pagar en caja</span>
                <span className="tabular-nums">
                  {formatCurrency(cashToPay.toFixed(2))}
                </span>
              </div>
            </>
          )}
          {taxOverride !== null && (
            <p className="text-xs text-muted-foreground">
              IVA editado manualmente. El subtotal neto se ajusta para que la
              suma cuadre con el total bruto.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
