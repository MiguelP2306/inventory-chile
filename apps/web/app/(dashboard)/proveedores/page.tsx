'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
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
  createSupplier,
  deleteSupplier,
  listSuppliersPaginated,
  updateSupplier,
  type SupplierInput,
} from '@/lib/inventory-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { isValidRut, normalizeRut } from '@/lib/validators/rut';
import type { SupplierDto } from '@inventory/shared';

const PAGE_SIZE = 20;

const empty: SupplierInput = {
  name: '',
  taxId: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
};

export default function ProveedoresPage() {
  const qc = useQueryClient();
  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [form, setForm] = useState<SupplierInput>(empty);

  const list = useQuery({
    queryKey: ['suppliers', { q: debouncedQ, page }],
    queryFn: () =>
      listSuppliersPaginated({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const createMut = useMutation({
    mutationFn: (input: SupplierInput) => createSupplier(toApi(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor creado');
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupplierInput }) =>
      updateSupplier(id, toApi(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor actualizado');
      close();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor eliminado');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function startCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function startEdit(s: SupplierDto) {
    setEditing(s);
    setForm({
      name: s.name,
      taxId: s.taxId ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      address: s.address ?? '',
      notes: s.notes ?? '',
    });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setEditing(null);
    setForm(empty);
  }

  // El RUT del proveedor es opcional (puede ser extranjero sin RUT chileno),
  // pero si viene con contenido debe ser válido — espejo del backend.
  const rutValue = (form.taxId ?? '').trim();
  const rutInvalid = rutValue !== '' && !isValidRut(rutValue);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (rutInvalid) {
      toast.error('RUT inválido (formato 12345678-9)');
      return;
    }
    if (editing) updateMut.mutate({ id: editing.id, input: form });
    else createMut.mutate(form);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </Button>
      </div>

      <Input
        placeholder="Buscar por nombre, NIT/RUC, email o teléfono"
        value={search.value}
        onChange={(e) => search.setValue(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>NIT/RUC</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!list.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <Link href={`/proveedores/${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{s.email ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{s.phone ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{s.taxId ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild title="Ver detalle">
                      <Link href={`/proveedores/${s.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(s)} title="Edición rápida">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`¿Eliminar proveedor "${s.name}"?`)) removeMut.mutate(s.id);
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

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} proveedor{total === 1 ? '' : 'es'} · página {page} de {totalPages}
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

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar ${editing.name}` : 'Nuevo proveedor'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <Field label="Nombre">
              <Input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  value={form.phone ?? ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+54 11 5555-1234"
                />
              </Field>
              <Field label="RUT (opcional)">
                <Input
                  value={form.taxId ?? ''}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && isValidRut(v)) {
                      setForm((f) => ({ ...f, taxId: normalizeRut(v) }));
                    }
                  }}
                  placeholder="12.345.678-9"
                  aria-invalid={rutInvalid}
                  className={rutInvalid ? 'border-destructive' : undefined}
                />
                {rutInvalid && (
                  <p className="text-xs text-destructive">
                    RUT inválido (formato 12345678-9)
                  </p>
                )}
              </Field>
              <Field label="Dirección">
                <Input
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notas">
              <textarea
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  !form.name.trim() ||
                  rutInvalid ||
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
    </div>
  );
}

// Convierte strings vacíos a null para que el backend no los persista como ''.
function toApi(input: SupplierInput): SupplierInput {
  const blank = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null);
  return {
    name: input.name.trim(),
    email: blank(input.email),
    phone: blank(input.phone),
    taxId: blank(input.taxId),
    address: blank(input.address),
    notes: blank(input.notes),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
