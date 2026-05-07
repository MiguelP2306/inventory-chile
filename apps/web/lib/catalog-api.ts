// Wrappers tipados sobre el cliente axios para los recursos de catálogo.
// Cada función devuelve la data lista para TanStack Query.

import type {
  BrandDto,
  CategoryDto,
  PaginatedResult,
  ProductDto,
  VehicleMakeDto,
  VehicleModelDto,
} from '@inventory/shared';
import { api } from './api';

// Listados sin params devuelven array completo (selectores). Si se pasan
// `page` o `pageSize`, el backend cambia a `PaginatedResult` y exponemos
// helpers `*Paginated` con tipo correcto.

export interface ListPaginationParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

// ---------- Categories ----------
export const listCategories = () =>
  api.get<CategoryDto[]>('/categories').then((r) => r.data);

export const listCategoriesPaginated = (params: ListPaginationParams) =>
  api
    .get<PaginatedResult<CategoryDto>>('/categories', { params })
    .then((r) => r.data);

export const createCategory = (input: { name: string; parentId?: string | null }) =>
  api.post<CategoryDto>('/categories', input).then((r) => r.data);

export const updateCategory = (id: string, input: { name?: string; parentId?: string | null }) =>
  api.patch<CategoryDto>(`/categories/${id}`, input).then((r) => r.data);

export const deleteCategory = (id: string) =>
  api.delete(`/categories/${id}`).then((r) => r.data);

// ---------- Brands ----------
export const listBrands = () => api.get<BrandDto[]>('/brands').then((r) => r.data);

export const listBrandsPaginated = (params: ListPaginationParams) =>
  api
    .get<PaginatedResult<BrandDto>>('/brands', { params })
    .then((r) => r.data);

export const createBrand = (input: { name: string }) =>
  api.post<BrandDto>('/brands', input).then((r) => r.data);

export const updateBrand = (id: string, input: { name: string }) =>
  api.patch<BrandDto>(`/brands/${id}`, input).then((r) => r.data);

export const deleteBrand = (id: string) =>
  api.delete(`/brands/${id}`).then((r) => r.data);

// ---------- Vehicle makes/models ----------
export const listVehicleMakes = () =>
  api.get<VehicleMakeDto[]>('/vehicles/makes').then((r) => r.data);

export const listVehicleMakesPaginated = (params: ListPaginationParams) =>
  api
    .get<PaginatedResult<VehicleMakeDto>>('/vehicles/makes', { params })
    .then((r) => r.data);

export const createVehicleMake = (input: { name: string }) =>
  api.post<VehicleMakeDto>('/vehicles/makes', input).then((r) => r.data);

export const updateVehicleMake = (id: string, input: { name: string }) =>
  api.patch<VehicleMakeDto>(`/vehicles/makes/${id}`, input).then((r) => r.data);

export const deleteVehicleMake = (id: string) =>
  api.delete(`/vehicles/makes/${id}`).then((r) => r.data);

export const listVehicleModels = (makeId?: string) =>
  api
    .get<VehicleModelDto[]>('/vehicles/models', { params: makeId ? { makeId } : {} })
    .then((r) => r.data);

export const listVehicleModelsPaginated = (
  params: ListPaginationParams & { makeId?: string },
) =>
  api
    .get<PaginatedResult<VehicleModelDto>>('/vehicles/models', { params })
    .then((r) => r.data);

export const createVehicleModel = (input: { makeId: string; name: string }) =>
  api.post<VehicleModelDto>('/vehicles/models', input).then((r) => r.data);

export const updateVehicleModel = (
  id: string,
  input: { makeId?: string; name?: string },
) => api.patch<VehicleModelDto>(`/vehicles/models/${id}`, input).then((r) => r.data);

export const deleteVehicleModel = (id: string) =>
  api.delete(`/vehicles/models/${id}`).then((r) => r.data);

// ---------- Products ----------
export interface ListProductsParams {
  q?: string;
  categoryId?: string;
  brandId?: string;
  page?: number;
  pageSize?: number;
}

export const listProducts = (params: ListProductsParams = {}) =>
  api
    .get<PaginatedResult<ProductDto>>('/products', { params })
    .then((r) => r.data);

export const getProduct = (id: string) =>
  api.get<ProductDto>(`/products/${id}`).then((r) => r.data);

export interface FitmentInput {
  modelId: string;
  yearFrom?: number | null;
  yearTo?: number | null;
}

export interface ProductInput {
  sku: string;
  name: string;
  partNumber?: string | null;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  supplierId?: string | null;
  cost?: string;
  price?: string;
  minStock?: number;
  maxStock?: number | null;
  location?: string | null;
  isActive?: boolean;
  fitments?: FitmentInput[];
}

export const createProduct = (input: ProductInput) =>
  api.post<ProductDto>('/products', input).then((r) => r.data);

export const updateProduct = (id: string, input: Partial<ProductInput>) =>
  api.patch<ProductDto>(`/products/${id}`, input).then((r) => r.data);

export const deleteProduct = (id: string) =>
  api.delete(`/products/${id}`).then((r) => r.data);

export const productsByVehicle = (params: { makeId?: string; modelId?: string; year?: number }) =>
  api
    .get<ProductDto[]>('/products/by-vehicle', { params })
    .then((r) => r.data);

export const quickSearchProducts = (q: string, limit = 10) =>
  api
    .get<ProductDto[]>('/products/quick-search', { params: { q, limit } })
    .then((r) => r.data);

// Helper de errores para mostrar en toasts
export function apiErrorMessage(err: unknown, fallback = 'Error inesperado') {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(', ');
  return fallback;
}
