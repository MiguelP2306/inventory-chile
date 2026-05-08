import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join, resolve } from 'path';
import type { Request } from 'express';
import { diskStorage } from 'multer';

/**
 * Convenciones transversales de uploads (ver README → "Subida de archivos").
 *
 * - Storage en disco local en `apps/api/uploads/<recurso>/`.
 * - Cada archivo se renombra a `<uuid>.<ext>` para evitar path traversal.
 * - El upload validate vive en cada controller — éste solo provee `diskStorage`
 *   y los whitelists/limits por recurso.
 */

// Resuelve a `<repo>/apps/api/uploads/`. `__dirname` en runtime es `dist/uploads`,
// por eso vamos dos niveles arriba.
export const UPLOADS_ROOT = resolve(__dirname, '..', '..', 'uploads');

export const PRODUCT_IMAGES_SUBDIR = 'products';
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ACCEPTED_PRODUCT_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const ACCEPTED_PRODUCT_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

ensureDir(UPLOADS_ROOT);

/**
 * Storage configurado para fotos de producto.
 *
 * - Filtra por MIME type whitelist.
 * - Renombra a `<uuid>.<ext>`.
 * - Crea el directorio si no existe.
 */
export const productImageStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = join(UPLOADS_ROOT, PRODUCT_IMAGES_SUBDIR);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

export function productImageFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (
    !ACCEPTED_PRODUCT_IMAGE_MIMES.has(file.mimetype) ||
    !ACCEPTED_PRODUCT_IMAGE_EXTS.has(ext)
  ) {
    cb(
      new BadRequestException(
        'Formato no permitido. Subí JPG, PNG o WEBP.',
      ),
      false,
    );
    return;
  }
  cb(null, true);
}

/**
 * Devuelve la URL pública relativa para un archivo guardado en
 * `<UPLOADS_ROOT>/<subdir>/<filename>`. Sirve para persistir en `url` del
 * registro y luego servirla via ServeStaticModule.
 */
export function publicUploadUrl(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

// ---------- Documentos: facturas de compra + comprobantes de gasto ----------

export const PURCHASE_INVOICES_SUBDIR = 'purchase-invoices';
export const EXPENSE_RECEIPTS_SUBDIR = 'expense-receipts';
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const ACCEPTED_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const ACCEPTED_DOCUMENT_EXTS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

function makeStorage(subdir: string) {
  return diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(UPLOADS_ROOT, subdir);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  });
}

export const purchaseInvoiceStorage = makeStorage(PURCHASE_INVOICES_SUBDIR);
export const expenseReceiptStorage = makeStorage(EXPENSE_RECEIPTS_SUBDIR);

export function documentFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (
    !ACCEPTED_DOCUMENT_MIMES.has(file.mimetype) ||
    !ACCEPTED_DOCUMENT_EXTS.has(ext)
  ) {
    cb(
      new BadRequestException(
        'Formato no permitido. Subí PDF, JPG, PNG o WEBP.',
      ),
      false,
    );
    return;
  }
  cb(null, true);
}
