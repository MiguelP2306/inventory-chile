'use client';

import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, Plus } from 'lucide-react';
import Link from 'next/link';
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
import { apiAbsoluteUrl } from '@/lib/api';
import { listCustomersPaginated } from '@/lib/customers-api';
import { useDebouncedUrlFilter } from '@/lib/use-debounced-url-filter';
import { useUrlFilters } from '@/lib/use-url-filters';
import { formatPhonePretty } from '@/lib/validators/phone';
import { formatRutPretty } from '@/lib/validators/rut';

const PAGE_SIZE = 20;

export default function ClientesPage() {
  const filters = useUrlFilters({ q: '', page: '' });
  const { values, setFilter } = filters;
  const search = useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] });
  const page = Number(values.page || '1');
  const debouncedQ = (values.q ?? '').trim();

  const list = useQuery({
    queryKey: ['customers', { q: debouncedQ, page }],
    queryFn: () =>
      listCustomersPaginated({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={apiAbsoluteUrl(
                `customers/export.xlsx${
                  debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : ''
                }`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="h-4 w-4" />
              Exportar Excel
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/clientes/importar">
              <FileSpreadsheet className="h-4 w-4" />
              Importar Excel
            </Link>
          </Button>
          <Button asChild>
            <Link href="/clientes/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo cliente
            </Link>
          </Button>
        </div>
      </div>

      <Input
        placeholder="Buscar por nombre, RUT, email o teléfono"
        value={search.value}
        onChange={(e) => search.setValue(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-md border bg-card">
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Comuna</TableHead>
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
            {items.map((c) => (
              <TableRow key={c.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/clientes/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {c.taxId ? formatRutPretty(c.taxId) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.email ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.phone ? formatPhonePretty(c.phone) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.commune?.name ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} cliente{total === 1 ? '' : 's'} · página {page} de {totalPages}
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
    </div>
  );
}
