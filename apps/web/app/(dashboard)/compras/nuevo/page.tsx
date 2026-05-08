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
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import {
  createPurchase,
  listSuppliers,
  type PurchaseInput,
} from '@/lib/inventory-api';

interface ItemRow {
  productId: string;
  sku: string;
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
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

  const valid =
    !!supplierId &&
    items.length > 0 &&
    items.every((i) => i.qty > 0 && Number(i.unitCost) >= 0);

  const mut = useMutation({
    mutationFn: (input: PurchaseInput) => createPurchase(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['cashbox-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-transactions'] });
      toast.success('Compra registrada');
      router.push('/compras');
      router.refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo registrar')),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    mut.mutate({
      supplierId,
      date,
      notes: notes.trim() || undefined,
      invoiceUrl,
      taxAmountOverride:
        taxOverride !== null ? Number(taxOverride).toFixed(2) : undefined,
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

  async function onSelectInvoice(file?: File | null) {
    if (!file) return;
    if (!ACCEPTED_DOC_MIMES.includes(file.type)) {
      toast.error('Formato no permitido. PDF, JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      toast.error('Archivo supera 10 MB.');
      return;
    }
    setUploadingInvoice(true);
    try {
      const result = await uploadPurchaseInvoice(file);
      setInvoiceUrl(result.url);
      toast.success('Factura subida');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'No se pudo subir la factura'));
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
            {mut.isPending ? 'Guardando...' : 'Registrar compra'}
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
          <Label>Fecha</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Factura adjunta (opcional)</Label>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onSelectInvoice(e.target.files?.[0])}
          />
          {invoiceUrl ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
              <Paperclip className="h-4 w-4" />
              <a
                href={publicDocumentUrl(invoiceUrl) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-muted-foreground hover:underline"
              >
                Ver factura
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setInvoiceUrl(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
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
                : 'Subir factura (PDF / imagen)'}
            </Button>
          )}
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
