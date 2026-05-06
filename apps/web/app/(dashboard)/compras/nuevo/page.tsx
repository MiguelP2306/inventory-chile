'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
import { apiErrorMessage } from '@/lib/catalog-api';
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

export default function NuevaCompraPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });

  const total = useMemo(
    () =>
      items
        .reduce((acc, it) => acc + (Number(it.unitCost) || 0) * (it.qty || 0), 0)
        .toFixed(2),
    [items],
  );

  const valid =
    !!supplierId && items.length > 0 && items.every((i) => i.qty > 0 && Number(i.unitCost) >= 0);

  const mut = useMutation({
    mutationFn: (input: PurchaseInput) => createPurchase(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nueva entrada de mercadería</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || mut.isPending}>
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
              <TableHead className="w-[140px] text-right">Costo unitario</TableHead>
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
                    ${subtotal}
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
            {items.length > 0 && (
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={4} className="text-right">
                  Total
                </TableCell>
                <TableCell className="text-right tabular-nums">${total}</TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </form>
  );
}
