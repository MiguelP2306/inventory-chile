'use client';

import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
}

export function ProductThumbnail({ src, alt = '', size = 40, className }: Props) {
  const dim = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        style={dim}
        className={cn('rounded border bg-muted object-cover', className)}
      />
    );
  }
  const iconSize = Math.max(14, Math.round(size * 0.45));
  return (
    <div
      style={dim}
      aria-label="Producto sin imagen"
      className={cn(
        'flex items-center justify-center rounded border bg-muted/60 text-muted-foreground',
        className,
      )}
    >
      <Package style={{ width: iconSize, height: iconSize }} aria-hidden="true" />
    </div>
  );
}
