'use client';

import { useQuery } from '@tanstack/react-query';
import { Camera, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CameraScanner } from '@/components/camera-scanner';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  lookupProductByCode,
  quickSearchProducts,
} from '@/lib/catalog-api';

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
}

export function QuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [mac, setMac] = useState(false);

  // Fase 11 — al escanear (cámara o tecleado por el USB), hacemos lookup
  // exacto y si hay match navegamos directo al detalle. Si no, dejamos el
  // texto en el input para que el operador vea matches LIKE.
  const handleScannedCode = async (code: string) => {
    try {
      const match = await lookupProductByCode(code);
      if (match) {
        setOpen(false);
        setQuery('');
        router.push(`/productos/${match.id}`);
      } else {
        setQuery(code);
        toast.warning(
          `Sin match exacto para "${code}" — buscando coincidencias parciales.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`No se pudo buscar: ${msg}`);
    }
  };

  useEffect(() => setMac(isMac()), []);

  // Atajo: Cmd+K (mac) / Ctrl+K (resto). El listener vive en window porque
  // queremos abrirlo desde cualquier parte del dashboard.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Debounce de 250ms para no saturar al backend mientras se tipea.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const results = useQuery({
    queryKey: ['quick-search', debounced],
    queryFn: () => quickSearchProducts(debounced, 10),
    enabled: debounced.length >= 1 && open,
  });

  const onSelect = (id: string) => {
    setOpen(false);
    setQuery('');
    router.push(`/productos/${id}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar producto"
        className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:w-full"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Buscar producto…</span>
        <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline-flex">
          {mac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <div className="flex items-center border-b">
          <CommandInput
            placeholder="SKU, código universal, compatible, nombre…"
            value={query}
            onValueChange={setQuery}
            className="flex-1 border-0"
          />
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            title="Escanear con cámara"
            className="mr-2 inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Camera className="h-3.5 w-3.5" />
            Escanear
          </button>
        </div>
        <CommandList>
          {results.data && results.data.length === 0 && debounced && (
            <CommandEmpty>Sin resultados para “{debounced}”</CommandEmpty>
          )}
          {results.data && results.data.length > 0 && (
            <CommandGroup heading="Productos">
              {results.data.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.sku} ${p.name}`}
                  onSelect={() => onSelect(p.id)}
                >
                  <div className="flex w-full items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {p.name}
                        {!p.isActive && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku}
                        {p.brand?.name ? ` · ${p.brand.name}` : ''}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">${p.price}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      {/* Fase 11 — scanner por cámara, reutiliza el mismo componente que
          ProductPicker. Al detectar un código, lookup exacto → detalle. */}
      <CameraScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScannedCode}
        hint="Apuntá al código del producto que querés abrir."
      />
    </>
  );
}
