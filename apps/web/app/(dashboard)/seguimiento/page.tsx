'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ExternalLink,
  FileText,
  MessageCircle,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { QuotationStatusBadge } from '@/components/quotation-status-badge';
import { MarkLostDialog } from '@/components/mark-lost-dialog';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCompanySettings } from '@/lib/cashbox-api';
import { apiErrorMessage } from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import {
  applyWhatsappTokens,
  buildWhatsappUrl,
  listFollowUps,
  touchCustomer,
} from '@/lib/lifecycle-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import type { FollowUpRowDto, FollowUpTab } from '@inventory/shared';

const TABS: { value: FollowUpTab; label: string }[] = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'sin-respuesta', label: 'Sin respuesta' },
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'ultimo-contacto', label: 'Último contacto' },
];

const PAGE_SIZE = 20;

export default function SeguimientoPage() {
  const qc = useQueryClient();
  const filters = useUrlFilters({ tab: 'pendientes', q: '', page: '' });
  const { values, setFilter, setFilters } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const tab = (values.tab as FollowUpTab) || 'pendientes';
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const [lostTarget, setLostTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const settings = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: getCompanySettings,
    staleTime: 5 * 60_000,
  });

  const followUpsQ = useQuery({
    queryKey: ['follow-ups', { tab, q: debouncedQ, page }],
    queryFn: () =>
      listFollowUps({
        tab,
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const touchMut = useMutation({
    mutationFn: (customerId: string) => touchCustomer(customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow-ups'] });
      toast.success('Contacto registrado');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo marcar')),
  });

  const rows = followUpsQ.data?.items ?? [];
  const total = followUpsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const template =
    settings.data?.whatsappFollowUpTemplate ??
    'Hola {cliente}, te paso de nuevo la cotización {cotizacion} por {total}.';

  function buildWaUrl(row: FollowUpRowDto): string | null {
    const phone = row.whatsappPhone ?? row.phone;
    const message = applyWhatsappTokens(template, {
      cliente: row.customerName,
      cotizacion: row.latestQuotation?.number ?? '',
      total: row.latestQuotation
        ? formatCurrency(row.latestQuotation.total)
        : '',
      link: row.latestQuotation
        ? `${window.location.origin}/p/cotizacion/${row.latestQuotation.publicToken}`
        : '',
    });
    return buildWhatsappUrl(phone, message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Seguimiento comercial</h1>
        <p className="text-sm text-muted-foreground">
          Cotizaciones del día — {new Date().toLocaleDateString('es-CL', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}. Solo se muestran clientes con cotizaciones abiertas creadas
          hoy. El badge refleja el estado actual de la cotización.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setFilters({ tab: v, page: null })}
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search.value}
          onChange={(e) => search.setValue(e.target.value)}
          placeholder="Buscar por nombre, RUT, email o teléfono"
          className="pl-9"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Último contacto</TableHead>
              <TableHead>Próximo follow-up</TableHead>
              <TableHead>Cotización</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {followUpsQ.isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
            {!followUpsQ.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No hay clientes en este estado.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const waUrl = buildWaUrl(row);
              return (
                <TableRow key={row.customerId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Link
                        href={`/clientes/${row.customerId}`}
                        className="font-medium hover:underline"
                      >
                        {row.customerName}
                      </Link>
                      <span className="text-xs text-muted-foreground font-mono">
                        {row.customerTaxId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.lastContactAt ? (
                      <span title={row.lastContactAt}>
                        {relativeTime(row.lastContactAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.nextFollowUpAt ? (
                      <span title={row.nextFollowUpAt}>
                        {relativeTime(row.nextFollowUpAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.latestQuotation ? (
                      <Link
                        href={`/cotizaciones/${row.latestQuotation.id}`}
                        className="text-sm hover:underline"
                      >
                        <span className="font-mono">
                          {row.latestQuotation.number}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          · {formatCurrency(row.latestQuotation.total)}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Ronda 10 — badge = estado de la cotización del día.
                        Si no hay cotización (caso teórico, el EXISTS lo
                        bloquea) cae al lifecycle del Customer. */}
                    {row.latestQuotation ? (
                      <QuotationStatusBadge
                        status={row.latestQuotation.status}
                      />
                    ) : (
                      <LifecycleBadge status={row.lifecycleStatus} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {waUrl ? (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </a>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled
                          title="Sin WhatsApp / teléfono configurado"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => touchMut.mutate(row.customerId)}
                        disabled={touchMut.isPending}
                        title="Marcar contacto"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        asChild
                        title="Ver cotizaciones del cliente"
                      >
                        <Link
                          href={`/cotizaciones?customer=${row.customerId}`}
                        >
                          <FileText className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setLostTarget({
                            id: row.customerId,
                            name: row.customerName,
                          })
                        }
                        title="Marcar como perdido"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} cliente{total === 1 ? '' : 's'} · página {page} de{' '}
            {totalPages}
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

      <MarkLostDialog
        customer={lostTarget}
        open={!!lostTarget}
        onOpenChange={(o) => !o && setLostTarget(null)}
      />
    </div>
  );
}

/**
 * Formato relativo simple para el tab de bandeja: "hace 3h", "en 12h",
 * "hace 2d". Para fechas a más de 7 días devuelve la fecha local corta.
 */
function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const abs = Math.abs(diffMin);
  if (abs < 60) {
    return diffMin >= 0 ? `en ${abs} min` : `hace ${abs} min`;
  }
  if (abs < 60 * 24) {
    const h = Math.round(abs / 60);
    return diffMin >= 0 ? `en ${h}h` : `hace ${h}h`;
  }
  if (abs < 60 * 24 * 7) {
    const d = Math.round(abs / (60 * 24));
    return diffMin >= 0 ? `en ${d}d` : `hace ${d}d`;
  }
  return date.toLocaleDateString('es-CL', { dateStyle: 'medium' });
}
