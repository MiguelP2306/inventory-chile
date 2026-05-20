'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SimpleNameList } from '@/components/simple-name-list';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  apiErrorMessage,
  createVehicleMake,
  createVehicleModel,
  deleteVehicleMake,
  deleteVehicleModel,
  listVehicleMakes,
  listVehicleMakesPaginated,
  listVehicleModelsPaginated,
  updateVehicleMake,
  updateVehicleModel,
} from '@/lib/catalog-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';

const ALL = '__all__';
const PAGE_SIZE = 20;

export default function VehiculosPage() {
  // Ronda 9 — consolidada en una sola vista. Los modelos viven dentro del
  // detalle de cada marca (`/vehiculos/marcas/[id]`), ya no como tab global.
  return (
    <SimpleNameList
      title="Marcas de vehículo"
      resourceLabel="marca"
      queryKey="vehicle-makes"
      listPaginated={listVehicleMakesPaginated}
      create={createVehicleMake}
      update={updateVehicleMake}
      remove={deleteVehicleMake}
      // Click en el nombre abre /vehiculos/marcas/[id] con los modelos
      // de esa marca + productos compatibles.
      getDetailHref={(item) => `/vehiculos/marcas/${item.id}`}
    />
  );
}

function ModelsList() {
  const qc = useQueryClient();
  const filters = useUrlFilters({
    q: '',
    make: '',
    page: '',
  });
  const { values, setFilters, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const makeFilter = values.make || ALL;
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; makeId: string } | null>(
    null,
  );
  const [name, setName] = useState('');
  const [makeId, setMakeId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    makeName: string;
  } | null>(null);

  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  const models = useQuery({
    queryKey: ['vehicle-models', { q: debouncedQ, make: makeFilter, page }],
    queryFn: () =>
      listVehicleModelsPaginated({
        q: debouncedQ || undefined,
        makeId: makeFilter === ALL ? undefined : makeFilter,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = models.data?.items ?? [];
  const total = models.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const createMut = useMutation({
    mutationFn: () => createVehicleModel({ makeId, name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo creado');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateMut = useMutation({
    mutationFn: () =>
      editing
        ? updateVehicleModel(editing.id, { makeId, name: name.trim() })
        : Promise.reject(new Error('no editing')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo actualizado');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteVehicleModel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle-models'] });
      toast.success('Modelo eliminado');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setName('');
    setMakeId('');
  }

  function startCreate() {
    setEditing(null);
    setName('');
    setMakeId('');
    setOpen(true);
  }

  function startEdit(model: { id: string; name: string; makeId: string }) {
    setEditing(model);
    setName(model.name);
    setMakeId(model.makeId);
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!makeId || !name.trim()) return;
    if (editing) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Modelos de vehículo</h1>
        <Button onClick={startCreate} disabled={!makes.data || makes.data.length === 0}>
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {makes.data && makes.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Primero creá una marca de vehículo en la otra pestaña.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input
          placeholder="Buscar por modelo o marca"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
        />
        <Select
          value={makeFilter}
          onValueChange={(v) => setFilters({ make: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las marcas</SelectItem>
            {makes.data?.map((mk) => (
              <SelectItem key={mk.id} value={mk.id}>
                {mk.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Marca</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </>
            )}
            {!models.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {items.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.make?.name ?? '—'}</TableCell>
                {/* Ronda 7 — click en el nombre del modelo abre el detalle
                    con los productos compatibles. */}
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
                      onClick={() => startEdit({ id: m.id, name: m.name, makeId: m.makeId })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDeleteTarget({
                          id: m.id,
                          name: m.name,
                          makeName: m.make?.name ?? '',
                        })
                      }
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

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} modelo{total === 1 ? '' : 's'} · página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar modelo' : 'Nuevo modelo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Marca</Label>
              <Select value={makeId} onValueChange={setMakeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná una marca" />
                </SelectTrigger>
                <SelectContent>
                  {makes.data?.map((mk) => (
                    <SelectItem key={mk.id} value={mk.id}>
                      {mk.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-name">Nombre del modelo</Label>
              <Input
                id="model-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Corolla"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!makeId || !name.trim() || createMut.isPending || updateMut.isPending}
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
        title="¿Eliminar modelo de vehículo?"
        description={
          deleteTarget ? (
            <>
              Se eliminará{' '}
              <strong>
                {deleteTarget.makeName} {deleteTarget.name}
              </strong>
              . Si tiene compatibilidades de productos asociadas, la
              operación va a fallar.
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
