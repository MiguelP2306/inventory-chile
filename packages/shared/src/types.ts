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

// ---------- Inventario ----------

export type StockStatus = 'ok' | 'low' | 'out';

export interface StockSummary {
  product: {
    id: string;
    sku: string;
    name: string;
    partNumber: string | null;
    barcode: string | null;
    minStock: number;
    maxStock: number | null;
    location: string | null;
    cost: string;
    price: string;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
  };
  warehouseId: string;
  quantity: number;
  status: StockStatus;
}

export interface MovementDto {
  id: string;
  type: 'PURCHASE_IN' | 'SALE_OUT' | 'ADJUSTMENT' | 'RETURN_IN' | 'RETURN_OUT';
  qty: number;
  unitCost: string | null;
  reference: string | null;
  refId: string | null;
  createdAt: string;
  product: { id: string; sku: string; name: string } | null;
  warehouse: { id: string; name: string } | null;
  user: { id: string; name: string; email: string } | null;
}

// ---------- Suppliers ----------

export interface SupplierDto {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

// ---------- Customers ----------

export interface CommuneDto {
  id: string;
  name: string;
  region: string;
}

export interface CustomerDto {
  id: string;
  name: string;
  taxId: string;
  email: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  communeId: string | null;
  commune?: CommuneDto | null;
  internalNotes: string | null;
}

// ---------- Purchases ----------

export interface PurchaseEntryItemDto {
  id: string;
  productId: string;
  qty: number;
  unitCost: string;
  subtotal: string;
  product?: { id: string; sku: string; name: string };
}

export interface PurchaseEntryDto {
  id: string;
  supplierId: string;
  date: string;
  total: string;
  notes: string | null;
  userId: string;
  supplier?: SupplierDto;
  items?: PurchaseEntryItemDto[];
  user?: { id: string; name: string; email: string };
}
