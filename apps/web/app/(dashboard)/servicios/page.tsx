'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  SoftModal,
  softInputClass,
  softLabelClass,
  softPrimaryButtonClass,
  softSecondaryButtonClass,
} from '@/components/ui/soft-modal';
import {
  apiErrorMessage,
  createService,
  deleteProduct,
  listServices,
  updateService,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import type { ProductDto } from '@inventory/shared';

/**
 * Servicios (envío/flete): productos que NO son inventario. No tienen stock ni
 * costo; su precio se fija libremente al agregarlos a una venta/cotización. El
 * precio acá es solo un valor SUGERIDO por defecto — se puede cambiar en cada
 * documento.
 */
export default function ServiciosPage() {
  const qc = useQueryClient();
  const services = useQuery({
    queryKey: ['services'],
    queryFn: () => listServices(),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDto | null>(null);

  const items = services.data?.items ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            <Truck className="h-6 w-6" />
            Servicios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cargos que se suman a una venta o cotización sin afectar el
            inventario — por ejemplo, envío o flete. El precio se ajusta en cada
            venta.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#2F6BFF] px-5 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-[#2F6BFF]/90 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#11151C]">
        {services.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Todavía no hay servicios. Creá uno (ej: “Envío”) para poder agregarlo
            a tus ventas y cotizaciones.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3 text-right">Precio sugerido</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-50 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                    {s.name}
                    {!s.isActive && (
                      <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatCurrency(s.price)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="Editar"
                        onClick={() => {
                          setEditing(s);
                          setDialogOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <DeleteServiceButton service={s} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        service={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ['services'] })}
      />
    </div>
  );
}

function DeleteServiceButton({ service }: { service: ProductDto }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => deleteProduct(service.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      toast.success('Servicio eliminado');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'No se pudo eliminar')),
  });
  return (
    <button
      title="Eliminar"
      disabled={mut.isPending}
      onClick={() => {
        if (confirm(`¿Eliminar el servicio “${service.name}”?`)) mut.mutate();
      }}
      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function ServiceDialog({
  open,
  onOpenChange,
  service,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  service: ProductDto | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (open) {
      setName(service?.name ?? '');
      setPrice(service ? String(Number(service.price)) : '');
    }
  }, [open, service]);

  const valid = name.trim().length > 0;

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        price: (Number(price) || 0).toFixed(2),
      };
      return service
        ? updateService(service.id, payload)
        : createService(payload);
    },
    onSuccess: () => {
      onSaved();
      toast.success(service ? 'Servicio actualizado' : 'Servicio creado');
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'No se pudo guardar')),
  });

  return (
    <SoftModal
      open={open}
      onOpenChange={onOpenChange}
      title={service ? 'Editar servicio' : 'Nuevo servicio'}
      subtitle="No afecta inventario. El precio es solo un valor sugerido."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) mut.mutate();
        }}
        className="space-y-4 p-5"
      >
        <div className="space-y-1">
          <label htmlFor="svc-name" className={softLabelClass}>
            Nombre
          </label>
          <input
            id="svc-name"
            autoFocus
            placeholder="ej: Envío / Flete"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={softInputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="svc-price" className={softLabelClass}>
            Precio sugerido (CLP)
          </label>
          <input
            id="svc-price"
            type="text"
            inputMode="decimal"
            placeholder="ej: 5000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={softInputClass}
          />
          <p className="text-[11px] text-muted-foreground">
            Podés cambiarlo cada vez que lo agregues a una venta.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={softSecondaryButtonClass}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || mut.isPending}
            className={`${softPrimaryButtonClass} w-auto px-5`}
          >
            {mut.isPending ? 'Guardando…' : service ? 'Guardar' : 'Crear servicio'}
          </button>
        </div>
      </form>
    </SoftModal>
  );
}
