'use client';

import { useQuery } from '@tanstack/react-query';
import { Camera, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CameraScanner } from '@/components/camera-scanner';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  listProducts,
  lookupProductByCode,
  publicImageUrl,
} from '@/lib/catalog-api';
import { formatCurrency } from '@/lib/format';
import type { ProductDto } from '@inventory/shared';

interface Props {
  onPick: (product: ProductDto) => void;
  buttonLabel?: string;
}

const PAGE_SIZE = 10;

export function ProductPicker({ onPick, buttonLabel = 'Agregar producto' }: Props) {
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);

  // Fase 11 — al escanear un código (USB con ENTER o cámara) hacemos lookup
  // exacto. Si hay match, lo agregamos directamente y cerramos el picker
  // sin pasar por la lista. Si no, ofrecemos buscar con LIKE.
  const handleScannedCode = async (code: string) => {
    try {
      const match = await lookupProductByCode(code);
      if (match) {
        onPick(match);
        setOpen(false);
        toast.success(`Agregado: ${match.name}`);
      } else {
        // Caemos a búsqueda libre para que el operador vea matches parciales.
        setQ(code);
        toast.warning(
          `Sin match exacto para "${code}" — mostramos resultados similares.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`No se pudo buscar: ${msg}`);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Cuando cambia el término de búsqueda, vuelvo a la primera página.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  // Resetear estado al cerrar.
  useEffect(() => {
    if (!open) {
      setQ('');
      setDebouncedQ('');
      setPage(1);
    }
  }, [open]);

  const results = useQuery({
    queryKey: ['product-picker', { q: debouncedQ, page }],
    queryFn: () =>
      listProducts({
        q: debouncedQ || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: open,
  });

  const items = results.data?.items ?? [];
  const total = results.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Elegir producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="SKU, código de barras o nombre · Enter escanea"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  // Fase 11 — al apretar Enter con texto cargado, intentamos
                  // lookup exacto primero (caso típico: lector USB termina con
                  // ENTER). Si hay match, agrega y cierra. Si no, sigue el
                  // flujo normal (la búsqueda LIKE ya mostró matches debajo).
                  if (e.key === 'Enter' && q.trim()) {
                    e.preventDefault();
                    handleScannedCode(q.trim());
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setScannerOpen(true)}
                title="Escanear con cámara"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto">
              {results.isLoading && (
                <>
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </>
              )}
              {!results.isLoading && items.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {debouncedQ ? 'Sin resultados.' : 'No hay productos cargados.'}
                </p>
              )}
              {items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent"
                >
                  <ProductThumbnail
                    src={publicImageUrl(p.coverUrl ?? null)}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.sku}
                      {p.brand?.name ? ` · ${p.brand.name}` : ''}
                      {p.category?.name ? ` · ${p.category.name}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {p.cost != null && (
                      <div>Costo {formatCurrency(p.cost)}</div>
                    )}
                    <div>Precio {formatCurrency(p.price)}</div>
                  </div>
                </button>
              ))}
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {total} producto{total === 1 ? '' : 's'} · página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || results.isFetching}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || results.isFetching}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fase 11 — scanner de cámara reutilizado. Al detectar un código,
          ejecuta `handleScannedCode` (lookup exacto → agregar al picker). */}
      <CameraScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScannedCode}
        hint="Apuntá al código de barras del producto a agregar."
      />
    </>
  );
}
