'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  apiErrorMessage,
  deleteProductImage,
  listProductImages,
  publicImageUrl,
  setProductImageCover,
  uploadProductImage,
} from '@/lib/catalog-api';
import { cn } from '@/lib/utils';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — espejo del backend
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  productId: string;
}

export function ProductImageGallery({ productId }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const images = useQuery({
    queryKey: ['product-images', productId],
    queryFn: () => listProductImages(productId),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadProductImage(productId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-images', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo subir la imagen')),
  });

  const setCover = useMutation({
    mutationFn: (imageId: string) => setProductImageCover(productId, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-images', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Portada actualizada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo cambiar la portada')),
  });

  const remove = useMutation({
    mutationFn: (imageId: string) => deleteProductImage(productId, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-images', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Imagen eliminada');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'No se pudo eliminar')),
  });

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach((file) => {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`"${file.name}": formato no permitido. JPG, PNG o WEBP únicamente.`);
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`"${file.name}": pesa más de 10 MB.`);
        return;
      }
      upload.mutate(file);
    });
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-md border-2 border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-primary bg-accent/40' : 'border-muted-foreground/30',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          multiple
          onChange={(e) => {
            handleFiles(e.target.files);
            // reset para permitir re-seleccionar el mismo archivo
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
        <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Arrastrá imágenes acá o
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? 'Subiendo...' : 'Elegir archivos'}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          JPG, PNG o WEBP · máximo 10 MB por archivo · sin límite de cantidad
        </p>
      </div>

      {images.data && images.data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.data.map((img) => {
            const url = publicImageUrl(img.url);
            return (
              <div
                key={img.id}
                className="group relative overflow-hidden rounded-md border bg-muted/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url ?? ''}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
                {img.isCover && (
                  <div className="absolute left-2 top-2 rounded bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Portada
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {!img.isCover && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={() => setCover.mutate(img.id)}
                      title="Marcar como portada"
                      disabled={setCover.isPending}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteTarget(img.id)}
                    title="Eliminar"
                    disabled={remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar esta imagen?"
        description="La imagen será eliminada del producto. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (deleteTarget) await remove.mutateAsync(deleteTarget);
        }}
      />
    </div>
  );
}
