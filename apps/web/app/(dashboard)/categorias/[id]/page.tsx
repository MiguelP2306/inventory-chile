'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FolderInput,
  Link2Off,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
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
import {
  apiErrorMessage,
  bulkUpdateProductCategory,
  createCategory,
  deleteCategory,
  listCategories,
  listProducts,
  updateCategory,
} from '@/lib/catalog-api';
import type { CategoryDto } from '@inventory/shared';
import { formatCurrency } from '@/lib/format';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';

const PAGE_SIZE = 50;

/**
 * Ronda 7 — Detalle de categoría con:
 *  - Listado de productos asociados (tabla con SKU/nombre/marca/precio).
 *  - Selección múltiple via checkboxes (en header + por fila).
 *  - Acciones bulk: "Desvincular" (categoría = null) y "Mover a otra
 *    categoría" (categoría = otra elegida en un select).
 *
 * Las dos acciones llaman al mismo endpoint `PATCH /products/bulk-category`
 * con `categoryId: null` o `categoryId: <uuid>`.
 */
export default function CategoriaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  // Selección persiste solo en memoria (recarga la pierde — aceptable).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = useState<string>('');
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategories(),
  });
  const allCategories = categoriesQ.data ?? [];
  const category = allCategories.find((c) => c.id === id) ?? null;
  const otherCategories = allCategories.filter((c) => c.id !== id);

  const productsQ = useQuery({
    queryKey: ['products', { categoryId: id, q: debouncedQ, page }],
    queryFn: () =>
      listProducts({
        categoryId: id,
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !!id,
  });

  const items = productsQ.data?.items ?? [];
  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((p) => selected.has(p.id)),
    [items, selected],
  );

  function toggleRow(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const it of items) next.delete(it.id);
      } else {
        for (const it of items) next.add(it.id);
      }
      return next;
    });
  }

  const bulkMut = useMutation({
    mutationFn: ({ categoryId }: { categoryId: string | null }) =>
      bulkUpdateProductCategory({
        productIds: Array.from(selected),
        categoryId,
      }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(
        vars.categoryId === null
          ? `${res.updated} producto${res.updated === 1 ? '' : 's'} desvinculado${res.updated === 1 ? '' : 's'}`
          : `${res.updated} producto${res.updated === 1 ? '' : 's'} movido${res.updated === 1 ? '' : 's'}`,
      );
      setSelected(new Set());
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });

  // ---------- Ronda 10 — Subcategorías ----------
  // Solo se muestran si la categoría actual es raíz (parentId === null).
  // Soportamos 1 nivel de anidamiento, así que las subcategorías no pueden
  // tener subcategorías propias.
  const isRoot = category?.parentId == null;

  const subcategoriesQ = useQuery({
    queryKey: ['categories', { parentId: id }],
    queryFn: () => listCategories({ parentId: id }),
    enabled: !!id && isRoot,
  });
  const subcategories = subcategoriesQ.data ?? [];

  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subEditing, setSubEditing] = useState<CategoryDto | null>(null);
  const [subName, setSubName] = useState('');
  const [subDeleteTarget, setSubDeleteTarget] = useState<CategoryDto | null>(
    null,
  );

  function startCreateSub() {
    setSubEditing(null);
    setSubName('');
    setSubDialogOpen(true);
  }
  function startEditSub(s: CategoryDto) {
    setSubEditing(s);
    setSubName(s.name);
    setSubDialogOpen(true);
  }

  const createSubMut = useMutation({
    mutationFn: () => createCategory({ name: subName.trim(), parentId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Subcategoría creada');
      setSubDialogOpen(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo crear')),
  });
  const updateSubMut = useMutation({
    mutationFn: () => updateCategory(subEditing!.id, { name: subName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Subcategoría actualizada');
      setSubDialogOpen(false);
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo actualizar')),
  });
  const deleteSubMut = useMutation({
    mutationFn: (cid: string) => deleteCategory(cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Subcategoría eliminada');
      setSubDeleteTarget(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/categorias">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            {category?.parentName && (
              <span className="text-base font-normal text-muted-foreground">
                {category.parentName} ›{' '}
              </span>
            )}
            {category?.name ?? 'Categoría'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} producto{total === 1 ? '' : 's'} en esta categoría
            {isRoot && subcategories.length > 0 && (
              <>
                {' '}
                · {subcategories.length} subcategoría
                {subcategories.length === 1 ? '' : 's'}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Ronda 10 — Subcategorías (solo si esta categoría es raíz). */}
      {isRoot && (
        <div className="rounded-md border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="font-medium">Subcategorías</h2>
              <p className="text-xs text-muted-foreground">
                Ej: "Lubricantes sintéticos" dentro de "Lubricantes". Los
                productos pueden asociarse directamente a la subcategoría;
                al filtrar por esta categoría también se incluyen los
                productos de sus subcategorías.
              </p>
            </div>
            <Button size="sm" onClick={startCreateSub}>
              <Plus className="h-4 w-4" />
              Nueva subcategoría
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="w-[140px] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subcategoriesQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                </TableRow>
              )}
              {!subcategoriesQ.isLoading && subcategories.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-muted-foreground"
                  >
                    Sin subcategorías. Usá «Nueva subcategoría» para crear la
                    primera.
                  </TableCell>
                </TableRow>
              )}
              {subcategories.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/categorias/${s.id}`}
                      className="hover:underline"
                    >
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditSub(s)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSubDeleteTarget(s)}
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
      )}

      {/* Dialog crear/editar subcategoría */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {subEditing
                ? `Editar ${subEditing.name}`
                : `Nueva subcategoría de ${category?.name ?? '—'}`}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!subName.trim()) return;
              if (subEditing) updateSubMut.mutate();
              else createSubMut.mutate();
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label htmlFor="sub-name">Nombre</Label>
              <Input
                id="sub-name"
                autoFocus
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="ej: Lubricantes sintéticos"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSubDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  !subName.trim() ||
                  createSubMut.isPending ||
                  updateSubMut.isPending
                }
              >
                {subEditing ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!subDeleteTarget}
        onOpenChange={(o) => !o && setSubDeleteTarget(null)}
        title="¿Eliminar subcategoría?"
        description={
          subDeleteTarget
            ? `Eliminará "${subDeleteTarget.name}". Si tiene productos asociados, la operación devolverá un error y deberás reasignarlos primero.`
            : ''
        }
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (subDeleteTarget)
            await deleteSubMut.mutateAsync(subDeleteTarget.id);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por SKU o nombre"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          className="max-w-md"
        />
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border bg-accent/30 px-3 py-1.5 text-sm">
            <span>
              {selected.size} producto{selected.size === 1 ? '' : 's'}{' '}
              seleccionado{selected.size === 1 ? '' : 's'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setUnlinkOpen(true)}
              disabled={bulkMut.isPending}
            >
              <Link2Off className="h-4 w-4" />
              Desvincular
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMoveTargetId('');
                setMoveOpen(true);
              }}
              disabled={bulkMut.isPending || otherCategories.length === 0}
            >
              <FolderInput className="h-4 w-4" />
              Mover a otra categoría
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Limpiar selección
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  className="h-4 w-4 cursor-pointer"
                  aria-label="Seleccionar todos en esta página"
                />
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead className="text-right">Precio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productsQ.isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!productsQ.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin productos en esta categoría.
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleRow(p.id)}
                    className="h-4 w-4 cursor-pointer"
                    aria-label={`Seleccionar ${p.sku}`}
                  />
                </TableCell>
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

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            página {page} de {totalPages}
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
              onClick={() =>
                setFilter('page', String(Math.min(totalPages, page + 1)))
              }
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Confirmar desvincular */}
      <ConfirmDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="¿Desvincular productos de esta categoría?"
        description={
          <>
            Los <strong>{selected.size}</strong> producto
            {selected.size === 1 ? '' : 's'} seleccionado
            {selected.size === 1 ? '' : 's'} quedarán sin categoría asignada.
            Podrás reasignarlos después desde el detalle del producto o de
            otra categoría.
          </>
        }
        confirmLabel="Desvincular"
        onConfirm={async () => {
          await bulkMut.mutateAsync({ categoryId: null });
        }}
      />

      {/* Mover a otra categoría */}
      <ConfirmDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title="Mover productos a otra categoría"
        description={
          <div className="space-y-3">
            <p>
              Los <strong>{selected.size}</strong> producto
              {selected.size === 1 ? '' : 's'} seleccionado
              {selected.size === 1 ? '' : 's'} se moverán a la categoría
              elegida.
            </p>
            <Select value={moveTargetId} onValueChange={setMoveTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí categoría destino" />
              </SelectTrigger>
              <SelectContent>
                {otherCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        confirmLabel="Mover"
        onConfirm={async () => {
          if (!moveTargetId) {
            toast.error('Elegí una categoría destino');
            throw new Error('no target');
          }
          await bulkMut.mutateAsync({ categoryId: moveTargetId });
        }}
      />
    </div>
  );
}
