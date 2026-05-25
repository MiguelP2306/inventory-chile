import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { ensureDir, publicUploadUrl, UPLOADS_ROOT } from './upload-config';

/**
 * Resultado de persistir un archivo. Lo que cada controller devuelve al
 * frontend tras subir es esencialmente este shape (más `originalName`).
 *
 * - `url`: lo que se guarda en DB y se sirve al cliente. En driver `local`
 *   es relativa (`/uploads/<subdir>/<file>.ext`); en driver `cloudinary` es
 *   absoluta (`https://res.cloudinary.com/...`).
 * - `filename`: nombre sin path. En cloudinary es `<public_id>.<ext>`.
 */
export interface StoredFile {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

type Driver = 'local' | 'cloudinary';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private driver: Driver = 'local';
  private cloudinary: typeof import('cloudinary').v2 | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const raw = (this.config.get<string>('STORAGE_DRIVER') ?? 'local').toLowerCase();
    if (raw === 'cloudinary') {
      const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
      const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
      const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
      if (!cloudName || !apiKey || !apiSecret) {
        this.logger.warn(
          'STORAGE_DRIVER=cloudinary pero faltan credenciales (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET). Cayendo a driver=local.',
        );
        this.driver = 'local';
        return;
      }
      // Import dinámico para que el driver local no requiera el paquete instalado.
      const mod = await import('cloudinary');
      mod.v2.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.cloudinary = mod.v2;
      this.driver = 'cloudinary';
      this.logger.log(`StorageService driver=cloudinary cloud=${cloudName}`);
    } else {
      this.driver = 'local';
      this.logger.log(`StorageService driver=local root=${UPLOADS_ROOT}`);
    }
  }

  getDriver(): Driver {
    return this.driver;
  }

  /**
   * Persiste un archivo recién subido. Multer entrega el buffer en memoria
   * (todos nuestros storages son `memoryStorage()` desde Fase 12).
   */
  async store(file: Express.Multer.File, subdir: string): Promise<StoredFile> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new Error('Archivo vacío o sin buffer (storage)');
    }
    const ext = extOf(file.originalname, file.mimetype);
    const baseName = randomUUID();
    const filename = `${baseName}${ext}`;

    if (this.driver === 'local') {
      const dir = join(UPLOADS_ROOT, subdir);
      ensureDir(dir);
      const fullPath = join(dir, filename);
      await writeFile(fullPath, file.buffer);
      return {
        url: publicUploadUrl(subdir, filename),
        filename,
        size: file.size,
        mimeType: file.mimetype,
      };
    }

    // driver=cloudinary
    const cld = this.cloudinary!;
    // resource_type=auto detecta image vs raw (PDFs van como `raw`).
    const result = await new Promise<{
      secure_url: string;
      public_id: string;
      bytes: number;
    }>((resolveUp, rejectUp) => {
      const stream = cld.uploader.upload_stream(
        {
          folder: `inventory-chile/${subdir}`,
          public_id: baseName, // sin extensión; Cloudinary la deriva del archivo
          resource_type: 'auto',
          use_filename: false,
          unique_filename: true,
          overwrite: false,
        },
        (err, res) => {
          if (err || !res) return rejectUp(err ?? new Error('Cloudinary upload sin respuesta'));
          resolveUp(res as any);
        },
      );
      stream.end(file.buffer);
    });

    return {
      url: result.secure_url,
      // Conservamos el `<public_id>.<ext>` como nombre lógico — útil para
      // logs/UI. El `public_id` real incluye el folder y lo deduce `delete()`.
      filename: `${result.public_id.split('/').pop()}${ext}`,
      size: result.bytes ?? file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Borra un archivo dada su URL (local o cloudinary). Idempotente: no falla
   * si el archivo no existe. Mantiene el contrato que tenía `unlinkUploadedFile`
   * en `products.service.ts` para que el caller no tenga que decidir nada.
   */
  async delete(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
      if (url.startsWith('/uploads/')) {
        const relative = url.slice('/uploads/'.length);
        const fullPath = join(UPLOADS_ROOT, relative);
        await unlink(fullPath);
        return;
      }
      if (url.startsWith('http') && this.cloudinary) {
        const publicId = extractCloudinaryPublicId(url);
        if (!publicId) return;
        // Probamos primero como `image` (default) y luego como `raw` para PDFs.
        const attempt = async (resourceType: 'image' | 'raw') => {
          await this.cloudinary!.uploader.destroy(publicId, {
            resource_type: resourceType,
            invalidate: true,
          });
        };
        try {
          await attempt('image');
        } catch {
          await attempt('raw');
        }
      }
    } catch (err) {
      // Mismo trato que el unlink original: borrar es best-effort. Un archivo
      // huérfano es mucho menos grave que abortar el delete del registro.
      this.logger.warn(
        `No se pudo borrar archivo ${url}: ${(err as Error).message}`,
      );
    }
  }
}

function extOf(originalName: string, mimeType: string): string {
  const idx = originalName.lastIndexOf('.');
  if (idx >= 0) return originalName.slice(idx).toLowerCase();
  // Fallback por mimetype (raro: el filter ya valida originalName con ext).
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}

/**
 * Extrae el `public_id` de una URL de Cloudinary para poder borrarlo.
 *
 * Cloudinary URL típica:
 *   https://res.cloudinary.com/<cloud>/image/upload/v1717000000/inventory-chile/products/<uuid>.jpg
 *
 * El `public_id` que espera `uploader.destroy()` es lo que va después de
 * `/upload/[v<n>/]` y sin extensión: `inventory-chile/products/<uuid>`.
 */
export function extractCloudinaryPublicId(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx < 0 || uploadIdx === parts.length - 1) return null;
    let after = parts.slice(uploadIdx + 1);
    // Quitar el segmento de versión (`v1234567890`) si está presente.
    if (after[0]?.match(/^v\d+$/)) after = after.slice(1);
    if (after.length === 0) return null;
    const joined = after.join('/');
    // Quitar la extensión del último segmento.
    const dotIdx = joined.lastIndexOf('.');
    return dotIdx > 0 ? joined.slice(0, dotIdx) : joined;
  } catch {
    return null;
  }
}
