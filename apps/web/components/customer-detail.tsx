'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  FileText,
  MessageSquare,
  Send,
  ShoppingCart,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { CustomerForm } from '@/components/forms/customer-form';
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
import { formatCurrency } from '@/lib/format';
import { listCustomerEvents } from '@/lib/lifecycle-api';
import { listQuotations } from '@/lib/quotations-api';
import { listSales } from '@/lib/sales-api';
import type { CustomerDto, LeadEventTypeDto } from '@inventory/shared';

interface Props {
  customer: CustomerDto;
}

/**
 * Ronda 7 — wrapper con tabs para el detalle del cliente. Separa la
 * información personal (form editable) del histórico transaccional y
 * comercial para no acumular todo en un scroll vertical único.
 *
 * Tabs:
 *   - Datos: el CustomerForm tal cual (Fase 4 + 8.5).
 *   - Compras: ventas confirmadas a este cliente.
 *   - Cotizaciones: cotizaciones emitidas a este cliente.
 *   - Histórico: timeline de eventos del lifecycle (lead_events).
 */
export function CustomerDetail({ customer }: Props) {
  return (
    <Tabs defaultValue="datos" className="space-y-4">
      <TabsList>
        <TabsTrigger value="datos">Datos</TabsTrigger>
        <TabsTrigger value="compras">Compras</TabsTrigger>
        <TabsTrigger value="cotizaciones">Cotizaciones</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
      </TabsList>

      <TabsContent value="datos">
        <CustomerForm customer={customer} />
      </TabsContent>

      <TabsContent value="compras">
        <SalesTab customerId={customer.id} />
      </TabsContent>

      <TabsContent value="cotizaciones">
        <QuotationsTab customerId={customer.id} />
      </TabsContent>

      <TabsContent value="historico">
        <HistoryTab customerId={customer.id} />
      </TabsContent>
    </Tabs>
  );
}

// ---------- Compras ----------

function SalesTab({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ['sales', { customerId }],
    queryFn: () => listSales({ customerId, pageSize: 50 }),
  });
  const items = q.data?.items ?? [];

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Este cliente todavía no tiene compras registradas.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table stickyFirstColumn>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs">
                <Link href={`/ventas/${s.id}`} className="hover:underline">
                  {s.number}
                </Link>
              </TableCell>
              <TableCell>
                {new Date(s.date).toLocaleDateString('es-CL', {
                  dateStyle: 'short',
                })}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.items?.length ?? 0}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatCurrency(s.total)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {s.paymentMethod}
              </TableCell>
              <TableCell className="text-xs">
                {s.status === 'CANCELLED' ? (
                  <span className="text-destructive">Cancelada</span>
                ) : s.status === 'PAID' ? (
                  <span className="text-emerald-700 dark:text-emerald-300">
                    Pagada
                  </span>
                ) : (
                  <span className="text-muted-foreground">{s.status}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- Cotizaciones ----------

function QuotationsTab({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ['quotations', { customerId }],
    queryFn: () => listQuotations({ customerId, pageSize: 50 }),
  });
  const items = q.data?.items ?? [];

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Este cliente todavía no tiene cotizaciones.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table stickyFirstColumn>
        <TableHeader>
          <TableRow>
            <TableHead>Número</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Enviada</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((qt) => (
            <TableRow key={qt.id}>
              <TableCell className="font-mono text-xs">
                <Link href={`/cotizaciones/${qt.id}`} className="hover:underline">
                  {qt.number}
                </Link>
              </TableCell>
              <TableCell>
                {new Date(qt.date).toLocaleDateString('es-CL', {
                  dateStyle: 'short',
                })}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatCurrency(qt.total)}
              </TableCell>
              <TableCell className="text-xs">
                <span className="text-muted-foreground">{qt.status}</span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {qt.sentAt
                  ? new Date(qt.sentAt).toLocaleDateString('es-CL', {
                      dateStyle: 'short',
                    })
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- Histórico ----------

const EVENT_META: Record<
  LeadEventTypeDto,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  QUOTATION_CREATED: {
    label: 'Cotización creada',
    icon: FileText,
    cls: 'text-violet-700 dark:text-violet-300',
  },
  QUOTATION_SENT: {
    label: 'Cotización enviada',
    icon: Send,
    cls: 'text-blue-700 dark:text-blue-300',
  },
  SALE_CONFIRMED: {
    label: 'Venta confirmada',
    icon: ShoppingCart,
    cls: 'text-emerald-700 dark:text-emerald-300',
  },
  FOLLOW_UP_TRIGGERED: {
    label: 'Marcado para seguimiento',
    icon: Ban,
    cls: 'text-amber-700 dark:text-amber-300',
  },
  MANUAL_CONTACT: {
    label: 'Contacto manual registrado',
    icon: CheckCircle2,
    cls: 'text-foreground',
  },
  LOST_MARKED: {
    label: 'Marcado como perdido',
    icon: XCircle,
    cls: 'text-destructive',
  },
};

function HistoryTab({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ['customer-events', customerId],
    queryFn: () => listCustomerEvents(customerId),
  });
  const events = q.data ?? [];

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (events.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
        Este cliente todavía no tiene eventos registrados. Los eventos se
        crean automáticamente cuando se cotiza, envía cotización, confirma
        venta o se marca como perdido.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <ol className="divide-y">
        {events.map((e) => {
          const meta = EVENT_META[e.type] ?? {
            label: e.type,
            icon: MessageSquare,
            cls: 'text-muted-foreground',
          };
          const Icon = meta.icon;
          return (
            <li key={e.id} className="flex items-start gap-3 p-4 text-sm">
              <Icon className={`h-5 w-5 shrink-0 ${meta.cls}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`font-medium ${meta.cls}`}>{meta.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.occurredAt).toLocaleString('es-CL', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                {e.refType && e.refId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Referencia: {e.refType} ·{' '}
                    <span className="font-mono">{e.refId.slice(0, 8)}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
