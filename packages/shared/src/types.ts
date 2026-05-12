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

export interface ProductImageDto {
  id: string;
  productId: string;
  url: string;
  isCover: boolean;
  position: number;
  createdAt: string;
}

export type ProductKindDto = 'ORIGINAL' | 'ALTERNATIVE';

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
  // Fase 4B
  universalCode: string | null;
  productKind: ProductKindDto;
  images?: ProductImageDto[];
  compatibleCodes?: string[];
  coverUrl?: string | null;
  // Relaciones
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
    /** @deprecated Desde Fase 7.5, ver `locationCode` per-bodega. */
    location: string | null;
    cost: string;
    price: string;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
  };
  warehouseId: string;
  quantity: number;
  status: StockStatus;
  // Ubicación física dentro de la bodega seleccionada (Fase 7.5).
  // Distinta del `product.location` (global, deprecated).
  locationCode: string | null;
  // Id del row `stocks` — útil para `PATCH /inventory/stock/:id/location`.
  // Puede ser null si el producto nunca tuvo movimientos en esta bodega
  // (caso: producto recién creado en una bodega vacía).
  stockId: string | null;
}

export interface MovementDto {
  id: string;
  type:
    | 'PURCHASE_IN'
    | 'SALE_OUT'
    | 'ADJUSTMENT'
    | 'RETURN_IN'
    | 'RETURN_OUT'
    | 'TRANSFER_OUT'
    | 'TRANSFER_IN';
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
  // Fase 5: descomposición IVA + factura adjunta.
  subtotal: string;
  taxAmount: string;
  invoiceUrl: string | null;
  notes: string | null;
  userId: string;
  supplier?: SupplierDto;
  items?: PurchaseEntryItemDto[];
  user?: { id: string; name: string; email: string };
}

// ---------- Caja, gastos, settings (Fase 5) ----------

export type PaymentMethodDto = 'CASH' | 'TRANSFER' | 'CARD';
export type CashTransactionTypeDto = 'INCOME' | 'EXPENSE';
export type CashTransactionSourceDto = 'SALE' | 'PURCHASE' | 'MANUAL';

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface CashTransactionDto {
  id: string;
  date: string;
  type: CashTransactionTypeDto;
  source: CashTransactionSourceDto;
  sourceId: string | null;
  description: string | null;
  amount: string;
  paymentMethod: PaymentMethodDto;
  expenseCategoryId: string | null;
  expenseCategory?: ExpenseCategoryDto | null;
  isVoided: boolean;
  user?: { id: string; name: string; email: string };
  createdAt: string;
}

export interface CashboxBalanceDto {
  total: string;
  byMethod: {
    CASH: string;
    TRANSFER: string;
    CARD: string;
  };
  income: string;
  expense: string;
}

export interface ExpenseDto {
  id: string;
  number: string;
  date: string;
  categoryId: string;
  category?: ExpenseCategoryDto;
  amount: string;
  paymentMethod: PaymentMethodDto;
  description: string;
  receiptUrl: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  user?: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettingsDto {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  currency: string;
  quotationFooter: string | null;
  defaultValidityDays: number;
  taxRate: string;
  cardCommissionRate: string;
}

// ---------- Cotizaciones (Fase 6) ----------

export type QuotationStatusDto =
  | 'DRAFT'
  | 'SENT'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED'
  | 'EXPIRED';

export interface QuotationItemDto {
  id: string;
  productId: string;
  qty: number;
  unitPrice: string;
  discount: string;
  // Si fue ingresado como porcentaje, queda persistido para imprimir en PDF.
  discountPercent: string | null;
  subtotal: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    partNumber: string | null;
    universalCode: string | null;
    description: string | null;
  };
}

// Vista del cliente para la cotización: si es libre se llenan los snapshots,
// si es del catálogo se popula `customer`. Nunca ambas a la vez.
export interface QuotationCustomerView {
  fromCatalog: boolean;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  customerId: string | null;
}

export interface QuotationDto {
  id: string;
  number: string;
  customerId: string | null;
  customer?: CustomerDto | null;
  customerNameSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  customerEmailSnapshot: string | null;
  customerTaxIdSnapshot: string | null;
  customerView: QuotationCustomerView;
  date: string;
  validUntil: string | null;
  status: QuotationStatusDto;
  subtotal: string;
  taxAmount: string;
  total: string;
  notes: string | null;
  publicToken: string;
  publicUrl: string;
  sentAt: string | null;
  user?: { id: string; name: string; email: string };
  items?: QuotationItemDto[];
  createdAt: string;
  updatedAt: string;
}

// Detalle público de la cotización (sin datos del usuario interno).
// Usado por GET /public/quotations/:token y por la pantalla pública del cliente.
//
// Las `notes` SÍ se incluyen: el campo está pensado para "plazo de entrega,
// observaciones, condiciones de pago" — contenido que el cliente final
// necesita ver. Si en el futuro hace falta separar notas internas de las
// públicas, se agregaría un campo `internalNotes` aparte.
export interface PublicQuotationDto {
  id: string;
  number: string;
  date: string;
  validUntil: string | null;
  status: QuotationStatusDto;
  subtotal: string;
  taxAmount: string;
  total: string;
  notes: string | null;
  customer: {
    name: string;
    taxId: string | null;
    email: string | null;
    phone: string | null;
  };
  items: Array<{
    code: string;
    description: string;
    qty: number;
    unitPrice: string;
    discount: string;
    discountPercent: string | null;
    subtotal: string;
  }>;
  company: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    taxId: string | null;
    quotationFooter: string | null;
  };
  pdfUrl: string;
}

export interface QuotationSendResultDto {
  status: QuotationStatusDto;
  sentAt: string | null;
  // Para WhatsApp es la URL `wa.me/...?text=...`. Para email es null
  // (el envío ya se hizo server-side).
  whatsappUrl?: string;
}

// ---------- Ventas (Fase 7) ----------

export type SaleStatusDto = 'PENDING' | 'PAID' | 'CANCELLED';

export interface SaleItemDto {
  id: string;
  productId: string;
  qty: number;
  unitPrice: string;
  discount: string;
  // Si el operador ingresó el descuento como %, lo persistimos para reimprimir
  // la nota con la misma representación. `discount` siempre tiene el monto.
  discountPercent: string | null;
  subtotal: string;
  // Costo unitario CONGELADO al confirmar la venta (para reportes de
  // rentabilidad históricos cuando el costo del producto cambia luego).
  unitCost: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    partNumber: string | null;
    universalCode: string | null;
  };
}

export interface SaleDto {
  id: string;
  number: string;
  customerId: string;
  customer?: CustomerDto;
  warehouseId: string;
  warehouse?: { id: string; name: string };
  date: string;
  subtotal: string;
  taxAmount: string;
  commissionAmount: string;
  total: string;
  paymentMethod: PaymentMethodDto;
  status: SaleStatusDto;
  notes: string | null;
  quotationId: string | null;
  quotation?: {
    id: string;
    number: string;
  } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy?: { id: string; name: string; email: string } | null;
  user?: { id: string; name: string; email: string };
  items?: SaleItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSaleItemInput {
  productId: string;
  qty: number;
  unitPrice: string;
  // Monto fijo de descuento. Si `discountPercent` viene, se calcula a partir
  // del % y se ignora este campo en el cómputo (pero se guarda igual).
  discount?: string;
  discountPercent?: string | null;
}

export interface CreateSaleInput {
  customerId: string;
  warehouseId?: string;
  paymentMethod: PaymentMethodDto;
  date?: string;
  notes?: string | null;
  // Si se está convirtiendo desde una cotización, mandar su id para que el
  // backend marque la cotización como CONVERTED en la misma transacción.
  quotationId?: string | null;
  items: CreateSaleItemInput[];
}

export interface CancelSaleInput {
  reason: string;
}

// ---------- Bodegas y transferencias (Fase 7.5) ----------

export interface WarehouseDto {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseInput {
  name: string;
  address?: string | null;
}

export interface UpdateWarehouseInput {
  name?: string;
  address?: string | null;
  isActive?: boolean;
}

export type TransferStatusDto = 'COMPLETED' | 'CANCELLED';

export interface TransferItemDto {
  id: string;
  productId: string;
  qty: number;
  unitCost: string | null;
  product?: {
    id: string;
    sku: string;
    name: string;
    partNumber: string | null;
  };
}

export interface TransferDto {
  id: string;
  number: string;
  fromWarehouseId: string;
  fromWarehouse?: { id: string; name: string };
  toWarehouseId: string;
  toWarehouse?: { id: string; name: string };
  date: string;
  notes: string | null;
  status: TransferStatusDto;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy?: { id: string; name: string; email: string } | null;
  user?: { id: string; name: string; email: string };
  items?: TransferItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransferItemInput {
  productId: string;
  qty: number;
}

export interface CreateTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  date?: string;
  notes?: string | null;
  items: CreateTransferItemInput[];
}

export interface CancelTransferInput {
  reason: string;
}
