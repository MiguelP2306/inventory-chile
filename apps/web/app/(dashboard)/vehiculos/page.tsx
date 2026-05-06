'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
  listVehicleModels,
  updateVehicleMake,
  updateVehicleModel,
} from '@/lib/catalog-api';

export default function VehiculosPage() {
  return (
    <Tabs defaultValue="makes" className="space-y-4">
      <TabsList>
        <TabsTrigger value="makes">Marcas</TabsTrigger>
        <TabsTrigger value="models">Modelos</TabsTrigger>
      </TabsList>
      <TabsContent value="makes">
        <SimpleNameList
          title="Marcas de vehículo"
          resourceLabel="marca"
          queryKey="vehicle-makes"
          list={listVehicleMakes}
          create={createVehicleMake}
          update={updateVehicleMake}
          remove={deleteVehicleMake}
        />
      </TabsContent>
      <TabsContent value="models">
        <ModelsList />
      </TabsContent>
    </Tabs>
  );
}

function ModelsList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; makeId: string } | null>(
    null,
  );
  const [name, setName] = useState('');
  const [makeId, setMakeId] = useState<string>('');

  const makes = useQuery({ queryKey: ['vehicle-makes'], queryFn: listVehicleMakes });
  const models = useQuery({ queryKey: ['vehicle-models'], queryFn: () => listVehicleModels() });

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

      <div className="rounded-md border bg-card">
        <Table>
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
            {models.data && models.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Sin modelos todavía.
                </TableCell>
              </TableRow>
            )}
            {models.data?.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.make?.name ?? '—'}</TableCell>
                <TableCell>{m.name}</TableCell>
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
                      onClick={() => {
                        if (confirm(`¿Eliminar "${m.make?.name ?? ''} ${m.name}"?`))
                          removeMut.mutate(m.id);
                      }}
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
    </div>
  );
}
