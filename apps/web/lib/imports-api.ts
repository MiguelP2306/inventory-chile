// Wrappers tipados sobre axios para Carga masiva Excel (Fase 10).

import type {
  ProductImportPreviewDto,
  ProductImportResultDto,
} from '@inventory/shared';
import { api } from './api';

export const previewProductImport = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api
    .post<ProductImportPreviewDto>('/imports/products/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const confirmProductImport = (file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api
    .post<ProductImportResultDto>('/imports/products/confirm', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  );
}

/**
 * URL pública para descargar la plantilla XLSX con headers + fila de ejemplo
 * + hoja "Instrucciones". El browser hace download nativo.
 */
export function getProductImportTemplateUrl(): string {
  return `${apiBase()}/imports/products/template.xlsx`;
}
