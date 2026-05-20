'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import {
  apiErrorMessage,
  createVehicleModel,
  deleteVehicleModel,
  listVehicleMakes,
  listVehicleModels,
  productsByVehicle,
  updateVehicleModel,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import type { VehicleModelDto } from '@inventory/shared';

/**
 * Detalle de marca de vehículo. Muestra:
 *  - Modelos de esa marca con CRUD inline (Ronda 9).
 *  - Productos compatibles con cualquier modelo de esa marca (lista grande).
 */
export default function VehicleMakeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const makesQ = useQuery({
    queryKey: ['vehicle-makes'],
    queryFn: listVehicleMakes,
  });
  const make = (makesQ.data ?? []).find((m) => m.id === id) ?? null;

  const modelsQ = useQuery({
    queryKey: ['vehicle-models', id],
    queryFn: () => listVehicleModels(id),
    enabled: !!id,
  });
  const models = modelsQ.data ?? [];

  // Ronda 9 — estado del dialog de crear/editar modelo.
  const [editing, setEditing] = useState<VehicleModelDto | null>(null);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [modelName, setModelName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VehicleModelDto | null>(null);

  function startCreate() {
    setEditing(null);
    setModelName('');
    setModelDialogOpen(true);
  }
  function startEdit(m: VehicleModelDto) {
    setEditing(m);
    setModelName(m.name);
    setModelDialogOpen(true);
  }

  const createMut = useMutation({
    mutationFn: () => createVehicleModel({ makeId: id, name: modelName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo creado');
      setModelDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateMut = useMutation({
    mutationFn: () =>
      updateVehicleModel(editing!.id, { name: modelName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo actualizado');
      setModelDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const deleteMut = useMutation({
    mutationFn: (mid: string) => deleteVehicleModel(mid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo eliminado');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  // Productos compatibles con cualquier modelo de esta marca.
  const productsQ = useQuery({
    queryKey: ['products-by-vehicle', { makeId: id }],
    queryFn: () => productsByVehicle({ makeId: id }),
    enabled: !!id,
  });
  const products = productsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/vehiculos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{make?.name ?? 'Marca'}</h1>
          <p className="text-sm text-muted-foreground">
            {models.length} modelo{models.length === 1 ? '' : 's'} ·{' '}
            {products.length} producto{products.length === 1 ? '' : 's'}{' '}
            compatible{products.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Modelos — Ronda 9 con CRUD inline. */}
      <div className="rounded-md border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-medium">Modelos de {make?.name ?? '—'}</h2>
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Nuevo modelo
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Modelo</TableHead>
              <TableHead className="w-[180px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelsQ.isLoading && (
              <TableRow>
                <TableCell colSpan={2}>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
              </TableRow>
            )}
            {!modelsQ.isLoading && models.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="text-center text-muted-foreground"
                >
                  Sin modelos. Usá «Nuevo modelo» arriba para agregar.
                </TableCell>
              </TableRow>
            )}
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link
                    href={`/vehiculos/modelos/${m.id}`}
                    className="hover:underline"
                  >
                    {m.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(m)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(m)}
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

      {/* Dialog crear/editar modelo */}
      <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar ${editing.name}` : 'Nuevo modelo'}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!modelName.trim()) return;
              if (editing) updateMut.mutate();
              else createMut.mutate();
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label htmlFor="model-name">Nombre del modelo</Label>
              <Input
                id="model-name"
                autoFocus
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="ej: Corolla, Hilux, S10"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModelDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  !modelName.trim() ||
                  createMut.isPending ||
                  updateMut.isPending
                }
              >
                {editing ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar modelo?"
        description={
          deleteTarget
            ? `Esto eliminará el modelo "${deleteTarget.name}". Si está referenciado por productos, la operación devolverá un error.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget) await deleteMut.mutateAsync(deleteTarget.id);
        }}
      />

      {/* Productos compatibles */}
      <div className="rounded-md border bg-card">
        <div className="border-b p-4">
          <h2 className="font-medium">Productos compatibles</h2>
        </div>
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Marca producto</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productsQ.isLoading && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!productsQ.isLoading && products.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Ningún producto del catálogo es compatible con esta marca.
                </TableCell>
              </TableRow>
            )}
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/productos/${p.id}`} className="hover:underline">
                    {p.sku}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/productos/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.brand?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(p.price)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
