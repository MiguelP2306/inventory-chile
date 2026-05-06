// Tipos de respuesta de la API. La API devuelve decimales como string para
// no perder precisión; el frontend los formatea al renderizar.

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
}

export interface BrandDto {
  id: string;
  name: string;
}

export interface VehicleMakeDto {
  id: string;
  name: string;
}

export interface VehicleModelDto {
  id: string;
  makeId: string;
  name: string;
  make?: VehicleMakeDto;
}

export interface VehicleFitmentDto {
  id: string;
  productId: string;
  modelId: string;
  yearFrom: number | null;
  yearTo: number | null;
  model?: VehicleModelDto;
}

export interface ProductDto {
  id: string;
  sku: string;
  partNumber: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  supplierId: string | null;
  cost: string;
  price: string;
  minStock: number;
  maxStock: number | null;
  location: string | null;
  isActive: boolean;
  category?: CategoryDto | null;
  brand?: BrandDto | null;
  fitments?: VehicleFitmentDto[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
