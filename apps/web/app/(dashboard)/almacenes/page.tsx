'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, PowerOff, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  updateWarehouse,
} from '@/lib/warehouses-api';
import type { WarehouseDto } from '@inventory/shared';

export default function AlmacenesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseDto | null>(null);
  const [form, setForm] = useState({ name: '', address: '' });

  // En /almacenes mostramos TODAS (activas + inactivas) — el toggle por fila
  // permite reactivar/desactivar.
  const list = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses(),
  });
  const items = (Array.isArray(list.data) ? list.data : list.data?.items ?? []) as WarehouseDto[];

  const createMut = useMutation({
    mutationFn: () =>
      createWarehouse({
        name: form.name.trim(),
        address: form.address.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Bodega creada');
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name, address }: { id: string; name: string; address: string }) =>
      updateWarehouse(id, {
        name: name.trim(),
        address: address.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Bodega actualizada');
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateWarehouse(id, { isActive }),
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(
        w.isActive ? `${w.name} reactivada` : `${w.name} desactivada`,
      );
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar el estado')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success(
        res.softDeleted
          ? 'Bodega desactivada (tenía movimientos asociados)'
          : 'Bodega eliminada',
      );
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function startCreate() {
    setEditing(null);
    setForm({ name: '', address: '' });
    setOpen(true);
  }

  function startEdit(w: WarehouseDto) {
    setEditing(w);
    setForm({ name: w.name, address: w.address ?? '' });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setEditing(null);
    setForm({ name: '', address: '' });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      updateMut.mutate({ id: editing.id, name: form.name, address: form.address });
    } else {
      createMut.mutate();
    }
  }

  // Sincronizar form cuando cambia el editing (caso: click Edit en otra fila
  // mientras el dialog ya está abierto).
  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, address: editing.address ?? '' });
    }
  }, [editing]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Almacenes</h1>
          <p className="text-sm text-muted-foreground">
            Bodegas físicas o virtuales donde se almacena stock. Las inactivas
            no aparecen en selectores de venta o transferencia, pero siguen
            preservando su historial.
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Nueva bodega
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[180px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin bodegas. Cargá la primera con "Nueva bodega".
                </TableCell>
              </TableRow>
            )}
            {items.map((w) => (
              <TableRow key={w.id} className={!w.isActive ? 'opacity-60' : ''}>
                <TableCell className="font-medium">{w.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {w.address ?? '—'}
                </TableCell>
                <TableCell>
                  {w.isActive ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent">
                      Activa
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inactiva
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        toggleMut.mutate({ id: w.id, isActive: !w.isActive })
                      }
                      title={w.isActive ? 'Desactivar' : 'Reactivar'}
                    >
                      {w.isActive ? (
                        <PowerOff className="h-4 w-4" />
                      ) : (
                        <Zap className="h-4 w-4 text-emerald-600" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(w)}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (
                          confirm(
                            `¿Eliminar bodega "${w.name}"? Si tiene movimientos, quedará desactivada en lugar de borrarse.`,
                          )
                        ) {
                          removeMut.mutate(w.id);
                        }
                      }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar ${editing.name}` : 'Nueva bodega'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ej: Principal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección (opcional)</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="ej: Av. Providencia 1234, Santiago"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  !form.name.trim() || createMut.isPending || updateMut.isPending
                }
              >
                {editing ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
