// Wrappers tipados sobre axios para Carga masiva Excel (Fase 10 + polish
// Mayo 2026: extendido a clientes y proveedores).

import type {
  CustomerImportPreviewDto,
  CustomerImportResultDto,
  ProductImportPreviewDto,
  ProductImportResultDto,
  SupplierImportPreviewDto,
  SupplierImportResultDto,
} from '@inventory/shared';
import { api } from './api';

function uploadMultipart<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  return api
    .post<T>(path, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
}

// ---------- Productos ----------

export const previewProductImport = (file: File) =>
  uploadMultipart<ProductImportPreviewDto>('/imports/products/preview', file);

export const confirmProductImport = (file: File) =>
  uploadMultipart<ProductImportResultDto>('/imports/products/confirm', file);

// ---------- Clientes ----------

export const previewCustomerImport = (file: File) =>
  uploadMultipart<CustomerImportPreviewDto>('/imports/customers/preview', file);

export const confirmCustomerImport = (file: File) =>
  uploadMultipart<CustomerImportResultDto>('/imports/customers/confirm', file);

// ---------- Proveedores ----------

export const previewSupplierImport = (file: File) =>
  uploadMultipart<SupplierImportPreviewDto>('/imports/suppliers/preview', file);

export const confirmSupplierImport = (file: File) =>
  uploadMultipart<SupplierImportResultDto>('/imports/suppliers/confirm', file);

// ---------- URLs públicas para descargar plantillas ----------

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
    /\/$/,
    '',
  );
}

export const getProductImportTemplateUrl = (): string =>
  `${apiBase()}/imports/products/template.xlsx`;

export const getCustomerImportTemplateUrl = (): string =>
  `${apiBase()}/imports/customers/template.xlsx`;

export const getSupplierImportTemplateUrl = (): string =>
  `${apiBase()}/imports/suppliers/template.xlsx`;
