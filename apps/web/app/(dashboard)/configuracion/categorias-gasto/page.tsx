'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import {
  createExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
} from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import type { ExpenseCategoryDto } from '@inventory/shared';

export default function CategoriasGastoPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => listExpenseCategories(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategoryDto | null>(null);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] =
    useState<ExpenseCategoryDto | null>(null);

  const createMut = useMutation({
    mutationFn: (n: string) => createExpenseCategory({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría creada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      updateExpenseCategory(id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría actualizada');
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => deleteExpenseCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría eliminada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setName('');
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) updateMut.mutate({ id: editing.id, n: trimmed });
    else createMut.mutate(trimmed);
  }

  const items = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/configuracion"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Configuración
          </Link>
          <h1 className="text-2xl font-semibold">Categorías de gasto</h1>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setName('');
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nueva categoría
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Las categorías marcadas como{' '}
        <span className="font-medium">sistema</span> son referenciadas por la
        lógica automática (IVA, comisión tarjeta) y no se pueden modificar.
      </p>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={2}>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Sin categorías cargadas.
                </TableCell>
              </TableRow>
            )}
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{c.name}</span>
                    {c.isSystem && (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" />
                        sistema
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {!c.isSystem && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(c);
                          setName(c.name);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar categoría' : 'Nueva categoría'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
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
        title="¿Eliminar categoría de gasto?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si hay
              gastos vinculados a esta categoría la operación va a fallar.
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
