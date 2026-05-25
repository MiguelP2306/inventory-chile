import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import type { Request } from 'express';
import { memoryStorage } from 'multer';

/**
 * Convenciones transversales de uploads (ver README → "Subida de archivos").
 *
 * Desde Fase 12 (deploy), todos los uploads usan `memoryStorage()` de multer
 * y la persistencia final la decide `StorageService` según `STORAGE_DRIVER`:
 *   - `local` (dev): escribe al disco en `apps/api/uploads/<subdir>/<uuid>.<ext>`.
 *   - `cloudinary` (prod): sube a Cloudinary con folder = subdir.
 *
 * Multer en memoria nos da un único path de código; `StorageService` se encarga
 * del resto. En cualquier caso el archivo se renombra a `<uuid>.<ext>` para evitar
 * path traversal.
 */

// Resuelve a `<repo>/apps/api/uploads/` para el driver local. `__dirname` en
// runtime es `dist/uploads`, por eso vamos dos niveles arriba.
export const UPLOADS_ROOT = resolve(__dirname, '..', '..', 'uploads');

export const PRODUCT_IMAGES_SUBDIR = 'products';
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ACCEPTED_PRODUCT_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const ACCEPTED_PRODUCT_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Aseguramos el root para el driver local. En driver=cloudinary este dir no se
// usa, pero crearlo es barato y nos evita un `if` extra al arrancar en dev.
ensureDir(UPLOADS_ROOT);

/**
 * Storage en memoria para fotos de producto. La persistencia final la decide
 * `StorageService.store(file, subdir)` desde el controller/service.
 */
export const productImageStorage = memoryStorage();

export function productImageFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  const ext = extnameFromOriginalName(file.originalname);
  if (
    !ACCEPTED_PRODUCT_IMAGE_MIMES.has(file.mimetype) ||
    !ACCEPTED_PRODUCT_IMAGE_EXTS.has(ext)
  ) {
    cb(
      new BadRequestException('Formato no permitido. Subí JPG, PNG o WEBP.'),
      false,
    );
    return;
  }
  cb(null, true);
}

/**
 * Devuelve la URL pública para un archivo local guardado en
 * `<UPLOADS_ROOT>/<subdir>/<filename>`. Solo aplica al driver local; el driver
 * cloudinary devuelve `secure_url` absoluta desde el SDK.
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

export const purchaseInvoiceStorage = memoryStorage();
export const expenseReceiptStorage = memoryStorage();

export function documentFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  const ext = extnameFromOriginalName(file.originalname);
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

function extnameFromOriginalName(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx).toLowerCase();
}
