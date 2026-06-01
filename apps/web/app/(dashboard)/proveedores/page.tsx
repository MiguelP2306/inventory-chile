'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit2, ExternalLink, FileSpreadsheet, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiAbsoluteUrl } from '@/lib/api';
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

/**
 * /proveedores — Rediseño UI (look de ProveedoresView lista + modal).
 *
 * SOLO UI/UX. La lógica es idéntica a la versión previa:
 *  · useUrlFilters + useDebouncedUrlFilter para el search.
 *  · listSuppliersPaginated con paginación server-side.
 *  · createMut/updateMut/removeMut con toApi() y toasts.
 *  · Validación de RUT chileno (isValidRut/normalizeRut) — preservada.
 *  · ConfirmDialog para el borrado.
 *
 * Cambios visuales: header font-black con 3 botones, search en card
 * rounded-2xl, tabla en sheet, footer de paginación y modal custom
 * (overlay blur) replicando el diseño del mock para crear/editar.
 */
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
  const [deleteTarget, setDeleteTarget] = useState<SupplierDto | null>(null);

  const list = useQuery({
    queryKey: ['suppliers', { q: debouncedQ, page }],
    queryFn: () =>
      listSuppliersPaginated({ q: debouncedQ || undefined, page, pageSize: PAGE_SIZE }),
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
      legalName: s.legalName ?? '',
      contactPerson: s.contactPerson ?? '',
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

  const saving = createMut.isPending || updateMut.isPending;
  const inputCls =
    'w-full text-xs font-semibold px-3.5 py-2.5 border border-slate-200 dark:border-slate-850 focus:border-[#2F6BFF] focus:outline-none focus:ring-2 focus:ring-[#2F6BFF]/10 rounded-xl bg-slate-50/40 dark:bg-slate-900/40 text-slate-800 dark:text-white';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============================================================
          HEADER
          ============================================================ */}
      <div className="flex select-none flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white md:text-2xl">
          Proveedores
        </h1>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <a
            href={apiAbsoluteUrl(
              `suppliers/export.xlsx${debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ''}`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <Download className="h-4 w-4" />
            <span>Exportar Excel</span>
          </a>
          <Link
            href="/proveedores/importar"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-[#11151C] dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Importar Excel</span>
          </Link>
          <button
            onClick={startCreate}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#2F6BFF] px-5 py-2.5 font-bold text-white shadow-sm transition-colors hover:bg-[#2F6BFF]/90"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo proveedor</span>
          </button>
        </div>
      </div>

      {/* ============================================================
          SEARCH
          ============================================================ */}
      <div className="flex max-w-[480px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <Search className="ml-1 h-[18px] w-[18px] shrink-0 text-slate-400" />
        <input
          type="text"
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          placeholder="Buscar por nombre, NIT/RUC, email o teléfono"
          className="flex-1 bg-transparent pr-3 text-xs font-medium text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
        />
      </div>

      {/* ============================================================
          TABLA
          ============================================================ */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-850 dark:bg-[#11151C]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/30 font-extrabold uppercase tracking-widest text-slate-400 dark:border-slate-850 dark:text-slate-500">
                <th className="py-4 pl-6">Nombre</th>
                <th className="py-4">Email</th>
                <th className="py-4">Teléfono</th>
                <th className="py-4">NIT/RUC</th>
                <th className="w-[150px] py-4 pr-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 dark:divide-slate-850 dark:text-slate-300">
              {list.isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-6 py-4">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))}

              {!list.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-xs font-bold text-slate-400">
                    No se encontraron proveedores.
                  </td>
                </tr>
              )}

              {items.map((s) => (
                <tr
                  key={s.id}
                  className="transition-colors hover:bg-slate-50/40 dark:hover:bg-slate-900/10"
                >
                  <td className="py-4 pl-6 font-black text-slate-950 dark:text-white">
                    <Link href={`/proveedores/${s.id}`} className="hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-4 text-slate-500">{s.email ?? '—'}</td>
                  <td className="py-4 text-slate-500">{s.phone ?? '—'}</td>
                  <td className="py-4 text-slate-500">{s.taxId ?? '—'}</td>
                  <td className="py-4 pr-6 text-right">
                    <div className="inline-flex justify-end gap-1.5">
                      <Link
                        href={`/proveedores/${s.id}`}
                        title="Ficha proveedor"
                        className="cursor-pointer p-1.5 text-slate-400 transition-colors hover:text-[#2F6BFF]"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => startEdit(s)}
                        title="Edición rápida"
                        className="cursor-pointer p-1.5 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-white"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        title="Eliminar registro"
                        className="cursor-pointer p-1.5 text-slate-400 transition-colors hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer paginación */}
        {total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs font-bold text-slate-400 dark:border-slate-850">
            <span>
              {total} proveedor{total === 1 ? '' : 'es'} · página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
                disabled={page === 1}
                className="cursor-pointer rounded-xl bg-slate-50 px-3.5 py-1.5 text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:disabled:text-slate-700"
              >
                Anterior
              </button>
              <button
                onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
                disabled={page >= totalPages}
                className="cursor-pointer rounded-xl bg-slate-50 px-3.5 py-1.5 text-[11px] text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:disabled:text-slate-700"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          MODAL crear / editar (custom, look del mock)
          ============================================================ */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 dark:border-slate-850 dark:bg-[#11151C]">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-850">
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {editing ? `Editar proveedor: ${editing.name}` : 'Nuevo proveedor'}
              </h2>
              <button
                onClick={close}
                className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-6 text-xs font-semibold">
              {/* Nombre */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ej: Arymar Rosas Aguirre"
                  className={inputCls}
                />
              </div>

              {/* Email + Teléfono */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@proveedor.com"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={form.phone ?? ''}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+54 11 5555-1234"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* RUT + Dirección */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    RUT (opcional)
                  </label>
                  <input
                    type="text"
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
                    className={`${inputCls} ${rutInvalid ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/10' : ''}`}
                  />
                  {rutInvalid && (
                    <p className="text-[10px] font-bold text-rose-500">
                      RUT inválido (formato 12345678-9)
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={form.address ?? ''}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Dirección comercial…"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Razón social + Contacto */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Razón social
                  </label>
                  <input
                    type="text"
                    value={form.legalName ?? ''}
                    onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                    placeholder="ej: Comercializadora del Sur SpA"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Contacto (vendedor)
                  </label>
                  <input
                    type="text"
                    value={form.contactPerson ?? ''}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                    placeholder="ej: María González"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Notas */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Notas
                </label>
                <textarea
                  rows={4}
                  value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Detalles complementarios, plazos de crédito…"
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2.5 pt-4 font-bold">
                <button
                  type="button"
                  onClick={close}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!form.name.trim() || rutInvalid || saving}
                  className="inline-flex cursor-pointer items-center rounded-xl bg-[#2F6BFF] px-6 py-2.5 text-xs text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar proveedor?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.name}</strong>. Si tiene compras asociadas la
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

// Convierte strings vacíos a null para que el backend no los persista como ''.
// (Preservado 1:1 — NOTA: no envía legalName/contactPerson, igual que el original.)
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
