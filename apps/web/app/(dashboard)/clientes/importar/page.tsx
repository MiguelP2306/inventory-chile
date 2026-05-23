'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  confirmCustomerImport,
  getCustomerImportTemplateUrl,
  previewCustomerImport,
} from '@/lib/imports-api';
import { cn } from '@/lib/utils';
import { formatRutPretty } from '@/lib/validators/rut';
import type {
  CustomerImportPreviewDto,
  CustomerImportResultDto,
} from '@inventory/shared';

/**
 * Carga masiva de clientes vía Excel. Mismo flujo que /productos/importar:
 *  1. Operador descarga la plantilla.
 *  2. Sube el XLSX completado.
 *  3. Backend devuelve preview (conteos + primeras filas + errores).
 *  4. Operador confirma → backend ejecuta UPSERT por RUT.
 *  5. Pantalla de resultado con detalle.
 */
export default function ImportarClientesPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<CustomerImportPreviewDto | null>(null);
  const [result, setResult] = useState<CustomerImportResultDto | null>(null);

  const previewMut = useMutation({
    mutationFn: (f: File) => previewCustomerImport(f),
    onSuccess: setPreview,
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo leer el Excel')),
  });

  const confirmMut = useMutation({
    mutationFn: (f: File) => confirmCustomerImport(f),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(
        `Importación completa: ${data.importedCount} cliente(s)${
          data.failedCount ? ` (${data.failedCount} fallidos)` : ''
        }`,
      );
    },
    onError: (err) =>
      toast.error(apiErrorMessage(err, 'No se pudo importar el Excel')),
  });

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onSelectFile(f: File | null | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Solo se admiten archivos .xlsx');
      return;
    }
    if (f.size === 0) {
      toast.error('El archivo está vacío');
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
    previewMut.mutate(f);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/clientes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Importar clientes</h1>
            <p className="text-sm text-muted-foreground">
              Carga masiva desde Excel (.xlsx). Upsert por RUT: si ya existe,
              se actualiza; si no, se crea.
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <a href={getCustomerImportTemplateUrl()} download>
            <Download className="h-4 w-4" />
            Descargar plantilla
          </a>
        </Button>
      </div>

      {!result && (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-10 text-center transition-colors',
            dragOver
              ? 'border-primary bg-accent/50'
              : 'border-border bg-card hover:bg-accent/20',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onSelectFile(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => onSelectFile(e.target.files?.[0])}
          />
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <div className="text-sm font-medium">
            {file ? file.name : 'Arrastrá un .xlsx acá, o hacé click para elegir'}
          </div>
          <p className="max-w-md text-xs text-muted-foreground">
            Tamaño máximo 5 MB. La primera fila debe ser el header. Descargá
            la plantilla arriba para ver el formato esperado.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="default"
              onClick={() => inputRef.current?.click()}
              disabled={previewMut.isPending || confirmMut.isPending}
            >
              <Upload className="h-4 w-4" />
              Elegir archivo
            </Button>
            {file && (
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={previewMut.isPending || confirmMut.isPending}
              >
                <X className="h-4 w-4" />
                Quitar
              </Button>
            )}
          </div>
        </div>
      )}

      {previewMut.isPending && <Skeleton className="h-40 w-full" />}
      {preview && !result && (
        <PreviewSection
          preview={preview}
          onConfirm={() => file && confirmMut.mutate(file)}
          onCancel={reset}
          loading={confirmMut.isPending}
        />
      )}

      {result && <ResultSection result={result} onAgain={reset} />}
    </div>
  );
}

function PreviewSection({
  preview,
  onConfirm,
  onCancel,
  loading,
}: {
  preview: CustomerImportPreviewDto;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const hasErrors = preview.errorCount > 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total filas" value={String(preview.totalRows)} />
        <StatCard
          label="A crear"
          value={String(preview.createCount)}
          accent="emerald"
        />
        <StatCard
          label="A actualizar"
          value={String(preview.updateCount)}
          accent="blue"
        />
        <StatCard
          label="Errores"
          value={String(preview.errorCount)}
          accent={hasErrors ? 'destructive' : 'neutral'}
        />
      </div>

      {hasErrors && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <div className="font-medium text-destructive">
            {preview.errorCount} fila{preview.errorCount === 1 ? '' : 's'} con errores
            (no se importarán):
          </div>
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto pl-5 text-xs">
            {preview.errors.map((e, i) => (
              <li key={i} className="list-disc">
                Fila {e.rowNumber}
                {e.taxId ? ` (RUT ${e.taxId})` : ''}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.previewRows.length > 0 && (
        <div className="rounded-md border bg-card">
          <div className="border-b p-3 text-sm font-medium">
            Vista previa de las primeras {preview.previewRows.length} filas
            válidas
          </div>
          <Table stickyFirstColumn>
            <TableHeader>
              <TableRow>
                <TableHead>Acción</TableHead>
                <TableHead>RUT</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Comuna</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.previewRows.map((r) => (
                <TableRow key={r.rowNumber}>
                  <TableCell>
                    {r.action === 'create' ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Nuevo
                      </span>
                    ) : (
                      <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                        Actualizar
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatRutPretty(r.taxId)}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate">
                    {r.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.email ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.phone ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.communeName ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={loading || preview.validCount === 0}
        >
          {loading
            ? 'Importando…'
            : `Confirmar e importar ${preview.validCount} cliente${preview.validCount === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}

function ResultSection({
  result,
  onAgain,
}: {
  result: CustomerImportResultDto;
  onAgain: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <div className="font-medium">Importación completada</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Total procesados: <strong>{result.importedCount}</strong>{' '}
            ({result.createdCount} creados, {result.updatedCount} actualizados).
            {result.failedCount > 0 && (
              <>
                {' '}
                <strong>{result.failedCount}</strong> filas con errores no se
                importaron — detalle abajo.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Clientes creados"
          value={String(result.createdCount)}
          accent="emerald"
        />
        <StatCard
          label="Clientes actualizados"
          value={String(result.updatedCount)}
          accent="blue"
        />
        <StatCard
          label="Importados"
          value={String(result.importedCount)}
          accent="violet"
        />
        <StatCard
          label="Fallidos"
          value={String(result.failedCount)}
          accent={result.failedCount > 0 ? 'destructive' : 'neutral'}
        />
      </div>

      {result.failedCount > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <div className="font-medium text-destructive">
            {result.failedCount} fila{result.failedCount === 1 ? '' : 's'} con errores:
          </div>
          <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto pl-5 text-xs">
            {result.errors.map((e, i) => (
              <li key={i} className="list-disc">
                Fila {e.rowNumber}
                {e.taxId ? ` (RUT ${e.taxId})` : ''}: {e.message}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: corregí esas filas en el Excel y subí solo las corregidas
            (las demás se actualizarán sin cambios por el upsert).
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button asChild variant="outline">
          <Link href="/clientes">Ver clientes</Link>
        </Button>
        <Button type="button" onClick={onAgain}>
          Importar otro Excel
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = 'neutral',
}: {
  label: string;
  value: string;
  accent?: 'neutral' | 'emerald' | 'blue' | 'violet' | 'destructive';
}) {
  const CLS: Record<string, string> = {
    neutral: 'text-foreground',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    blue: 'text-blue-700 dark:text-blue-300',
    violet: 'text-violet-700 dark:text-violet-300',
    destructive: 'text-destructive',
  };
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-2 text-2xl font-semibold tabular-nums', CLS[accent])}>
        {value}
      </div>
    </div>
  );
}
