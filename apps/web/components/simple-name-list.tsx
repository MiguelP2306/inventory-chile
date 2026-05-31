'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import { Input } from '@/components/ui/input';
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
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { PaginatedResult } from '@inventory/shared';

interface NamedItem {
  id: string;
  name: string;
}

interface ListPaginatedParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

interface Props {
  title: string;
  resourceLabel: string; // ej: "categoría", "marca"
  queryKey: string;
  /** Listado paginado: recibe q/page/pageSize y devuelve PaginatedResult. */
  listPaginated: (params: ListPaginatedParams) => Promise<PaginatedResult<NamedItem>>;
  create: (input: { name: string }) => Promise<NamedItem>;
  update: (id: string, input: { name: string }) => Promise<NamedItem>;
  remove: (id: string) => Promise<unknown>;
  pageSize?: number;
  /**
   * Ronda 7 — si está definido, el nombre se renderiza como link al
   * detalle de la entidad. Usado por categorías, marcas y modelos de
   * vehículos para abrir la página de productos asociados.
   */
  getDetailHref?: (item: NamedItem) => string;
}

export function SimpleNameList({
  title,
  resourceLabel,
  queryKey,
  listPaginated,
  create,
  update,
  remove,
  pageSize = 20,
  getDetailHref,
}: Props) {
  const qc = useQueryClient();
  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NamedItem | null>(null);
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<NamedItem | null>(null);

  const query = useQuery({
    queryKey: [queryKey, { q: debouncedQ, page }],
    queryFn: () =>
      listPaginated({ q: debouncedQ || undefined, page, pageSize }),
  });

  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const createMut = useMutation({
    mutationFn: (n: string) => create({ name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${capitalize(resourceLabel)} creada`);
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) => update(id, { name: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${capitalize(resourceLabel)} actualizada`);
      closeDialog();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success(`${capitalize(resourceLabel)} eliminada`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setName('');
  }

  function startCreate() {
    setEditing(null);
    setName('');
    setOpen(true);
  }

  function startEdit(item: NamedItem) {
    setEditing(item);
    setName(item.name);
    setOpen(true);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) updateMut.mutate({ id: editing.id, n: trimmed });
    else createMut.mutate(trimmed);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Nueva
        </Button>
      </div>

      <Input
        placeholder="Buscar por nombre"
        value={search.value}
        onChange={(e) => search.setValue(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </>
            )}
            {!query.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {getDetailHref ? (
                    <Link
                      href={getDetailHref(item)}
                      className="hover:underline"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    item.name
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(item)}
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
            {total} {resourceLabel}{total === 1 ? '' : 's'} · página {page} de {totalPages}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`¿Eliminar ${resourceLabel}?`}
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si tiene
              productos asociados la operación va a fallar — primero
              reasigná o eliminá los productos.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget) await removeMut.mutateAsync(deleteTarget.id);
        }}
      />

      <SoftModal
        open={open}
        onOpenChange={(v) => (v ? setOpen(true) : closeDialog())}
        title={editing ? `Editar ${resourceLabel}` : `Nueva ${resourceLabel}`}
        subtitle={
          editing
            ? `Actualizá el nombre de la ${resourceLabel}`
            : `Registrá una nueva ${resourceLabel} en el sistema`
        }
      >
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div className="space-y-1">
            <label htmlFor="name" className={softLabelClass}>
              Nombre
            </label>
            <input
              id="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={softInputClass}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeDialog}
              className={softSecondaryButtonClass}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMut.isPending || updateMut.isPending || !name.trim()}
              className={`${softPrimaryButtonClass} w-auto px-5`}
            >
              {editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </SoftModal>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
