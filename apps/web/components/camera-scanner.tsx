'use client';

import { BrowserMultiFormatReader } from '@zxing/browser';
import type { Result } from '@zxing/library';
import { Camera, CameraOff, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface CameraScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Callback cuando se decodifica un código exitosamente. El modal se cierra
   * automáticamente después — el caller decide qué hacer (lookup, agregar
   * a venta, navegar a detalle, etc.).
   */
  onDetected: (code: string) => void;
  /** Texto del header del dialog. Default "Escanear código". */
  title?: string;
  /**
   * Texto explicativo bajo el viewport. Útil para diferenciar el contexto
   * ("Apuntá al código de barras del producto a agregar a la venta").
   */
  hint?: string;
}

/**
 * Fase 11 — Modal de escaneo por cámara basado en @zxing/browser.
 *
 * UX:
 *  - Al abrir, pide permiso de cámara y arranca el video.
 *  - Cuando @zxing decodea un código, ejecuta onDetected + cierra el modal.
 *  - Si el browser no soporta MediaDevices o el usuario rechaza el permiso,
 *    muestra un error claro con tip de fallback (lector USB o Cmd+K).
 *
 * Soporta MULTIPLES formatos out-of-the-box (CODE128, EAN-13, EAN-8, QR,
 * Code 39, ITF, etc.) — `BrowserMultiFormatReader` los prueba todos.
 *
 * Performance: el reader se inicia solo cuando el dialog abre. Al cerrar
 * (cualquier vía), se llama `reset()` del reader para liberar la cámara.
 *
 * No se persiste estado: cada apertura es una sesión nueva.
 */
export function CameraScanner({
  open,
  onOpenChange,
  onDetected,
  title = 'Escanear código',
  hint = 'Apuntá la cámara al código de barras o QR.',
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  // `controlsRef` guarda el objeto que devuelve `decodeFromVideoDevice` y
  // que permite frenar el stream con `.stop()`. Sin esto, al cerrar el modal
  // la cámara queda encendida.
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Guardamos el último código detectado para mostrar feedback "Escaneado: X"
  // brevemente antes de cerrar el modal.
  const [lastCode, setLastCode] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // Sin acceso al video o ya frenado — ignorar.
      }
      controlsRef.current = null;
    }
    // Forzar el reset del reader para liberar tracks de la MediaStream.
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      setError(null);
      setLastCode(null);
      return;
    }

    let cancelled = false;
    setStarting(true);
    setError(null);

    (async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setError(
          'Tu navegador no soporta acceso a la cámara. Usá un lector USB o Cmd+K.',
        );
        setStarting(false);
        return;
      }

      try {
        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        // Buscamos cámara trasera primero (mejor para escaneo en mobile).
        // Si no hay enumerateDevices o solo hay una, usamos `undefined` que
        // dispara el default del browser.
        let deviceId: string | undefined;
        try {
          const devices =
            await BrowserMultiFormatReader.listVideoInputDevices();
          const back = devices.find((d) =>
            /back|rear|environment/i.test(d.label),
          );
          deviceId = back?.deviceId ?? devices[0]?.deviceId;
        } catch {
          // enumerateDevices puede fallar si no se concedió permiso aún.
          // Pasamos undefined y dejamos que el browser elija.
        }

        if (cancelled) return;
        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result: Result | undefined, err) => {
            // err viene en cada frame que no detectó nada — es normal, no
            // hacer nada. Sólo nos interesa cuando hay `result`.
            if (cancelled || !result) return;
            const code = result.getText();
            if (!code) return;
            setLastCode(code);
            // Pequeño delay para mostrar el feedback antes de cerrar.
            setTimeout(() => {
              if (cancelled) return;
              onDetected(code);
              onOpenChange(false);
            }, 250);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (/permission|denied|notallowed/i.test(msg)) {
          setError(
            'No diste permiso para usar la cámara. Habilitalo desde la barra del navegador y reintentá.',
          );
        } else {
          setError(`No se pudo iniciar la cámara: ${msg}`);
        }
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onDetected, onOpenChange, stop]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <CameraOff className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-destructive">{error}</p>
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-black',
                  starting && 'animate-pulse',
                )}
              >
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                />
                {/* Marco guía centrado — ayuda al usuario a alinear el código. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-1/3 w-2/3 rounded-md border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
                {lastCode && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white shadow">
                    Escaneado: {lastCode}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
