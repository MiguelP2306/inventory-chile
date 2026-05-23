'use client';

import { useMutation } from '@tanstack/react-query';
import { Camera, Keyboard, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { CameraScanner } from '@/components/camera-scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  apiErrorMessage,
  lookupProductByCode,
} from '@/lib/catalog-api';

/**
 * Fase 11 — Pantalla dedicada de escaneo.
 *
 * Casos de uso:
 *  1. Operador en bodega quiere consultar precio/stock/ubicación de un
 *     producto. Toma el lector USB, escanea, ENTER → navega al detalle.
 *  2. Operador en mostrador usa el celular como scanner: toca "Cámara",
 *     apunta al código → navega al detalle.
 *  3. Si el código no existe, mostramos un cartel claro con tip ("verificá
 *     que el producto esté cargado con ese barcode/SKU").
 *
 * Atajos UX:
 *  - Input con `autoFocus` para que el lector USB inyecte el código sin
 *    intervención adicional.
 *  - Enter dispara el lookup.
 *  - Botón "Cámara" abre el scanner por video (mismo componente que el
 *    ProductPicker).
 */
export default function EscanearPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: (c: string) => lookupProductByCode(c),
    onSuccess: (match, c) => {
      if (match) {
        toast.success(`Encontrado: ${match.name}`);
        router.push(`/productos/${match.id}`);
      } else {
        setLastError(`No hay ningún producto con código exacto "${c}".`);
      }
    },
    onError: (err) => {
      const msg = apiErrorMessage(err, 'No se pudo buscar el código');
      setLastError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setLastError(null);
    lookup.mutate(c);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Escanear</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lookup exacto por SKU, código de barras, PartNumber, código universal
          o código compatible. Si hay match, te llevamos al detalle del
          producto.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Lector USB / input manual */}
        <div className="rounded-md border bg-card p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            Lector USB o ingreso manual
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Conectá el lector USB. Funciona como teclado: al disparar el láser
            el código se escribe en el input y se envía con ENTER.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(code);
            }}
            className="flex items-center gap-2"
          >
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SKU o código de barras"
              disabled={lookup.isPending}
              className="font-mono"
            />
            <Button type="submit" disabled={lookup.isPending || !code.trim()}>
              <Search className="h-4 w-4" />
              {lookup.isPending ? 'Buscando…' : 'Buscar'}
            </Button>
          </form>
        </div>

        {/* Cámara */}
        <div className="rounded-md border bg-card p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Camera className="h-4 w-4 text-muted-foreground" />
            Cámara
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Usá la cámara del celular o webcam. Soporta CODE128, EAN-13, QR y
            otros formatos. El navegador te va a pedir permiso la primera vez.
          </p>
          <Button
            type="button"
            onClick={() => {
              setLastError(null);
              setScannerOpen(true);
            }}
            disabled={lookup.isPending}
          >
            <Camera className="h-4 w-4" />
            Abrir cámara
          </Button>
        </div>
      </div>

      {lastError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">{lastError}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Verificá que el producto esté cargado con ese código. Si necesitás
            buscar por nombre parcial,{' '}
            <Link href="/productos" className="font-medium underline">
              andá al listado de productos
            </Link>
            .
          </p>
        </div>
      )}

      <CameraScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(c) => handleSubmit(c)}
        hint="Apuntá al código del producto. Al detectar, te llevamos al detalle."
      />
    </div>
  );
}
