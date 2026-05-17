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
    | 'TRANSFER_IN'
    // Ronda 7 — devolución de cliente con producto dañado: queda registrada
    // como evento de auditoría pero NO modifica el stock.
    | 'RETURN_IN_DAMAGED';
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

export type CustomerSourceDto =
  | 'WHATSAPP'
  | 'EMAIL'
  | 'PHONE'
  | 'IN_PERSON'
  | 'OTHER';

export type LifecycleStatusDto =
  | 'NEW'
  | 'QUOTED'
  | 'FOLLOW_UP'
  | 'WON'
  | 'LOST';

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
  // ---------- Fase 8.5 ----------
  source: CustomerSourceDto;
  whatsappPhone: string | null;
  lifecycleStatus: LifecycleStatusDto;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  lostReason: string | null;
  hubspotContactId: string | null;
}

// ---------- Fase 8.5 — Seguimiento ----------

export type LeadEventTypeDto =
  | 'QUOTATION_CREATED'
  | 'QUOTATION_SENT'
  | 'SALE_CONFIRMED'
  | 'LOST_MARKED'
  | 'FOLLOW_UP_TRIGGERED'
  | 'MANUAL_CONTACT';

export interface LeadEventDto {
  id: string;
  customerId: string;
  type: LeadEventTypeDto;
  refType: string | null;
  refId: string | null;
  occurredAt: string;
  userId: string | null;
}

export type FollowUpTab =
  | 'pendientes'
  | 'sin-respuesta'
  | 'vencidos'
  | 'ultimo-contacto';

/**
 * Fila de la bandeja `/seguimiento`. Cada fila representa un cliente con
 * lifecycle activo y los datos mínimos para que el operador decida si
 * contactarlo. `latestQuotation` resume la cotización más reciente abierta
 * (DRAFT/SENT/APPROVED) para construir el mensaje WhatsApp con tokens.
 */
export interface FollowUpRowDto {
  customerId: string;
  customerName: string;
  customerTaxId: string;
  whatsappPhone: string | null;
  phone: string | null;
  email: string | null;
  lifecycleStatus: LifecycleStatusDto;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  latestQuotation: {
    id: string;
    number: string;
    total: string;
    publicToken: string;
  } | null;
}

export interface FollowUpListDto {
  items: FollowUpRowDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MarkLostInput {
  reason: string;
}

export interface TouchCustomerInput {
  // Notas opcionales para registrar el contexto del contacto.
  notes?: string;
}

export interface HubspotTestResultDto {
  ok: boolean;
  message: string;
  // Si `ok`, devuelve el id del contacto dummy creado/actualizado en HubSpot.
  contactId?: string;
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
  // Ronda 7 — bodega destino de la entrada de mercadería. Puede ser null en
  // compras históricas previas a la migración de Ronda 7 que no se pudieron
  // backfillear.
  warehouseId: string | null;
  date: string;
  total: string;
  // Fase 5: descomposición IVA.
  subtotal: string;
  taxAmount: string;
  notes: string | null;
  userId: string;
  supplier?: SupplierDto;
  warehouse?: { id: string; name: string } | null;
  items?: PurchaseEntryItemDto[];
  user?: { id: string; name: string; email: string };
  // Ronda 7 — archivos de factura (1→N). El frontend renderiza una lista en
  // el detalle de la compra y permite agregar/borrar individualmente.
  invoices?: PurchaseInvoiceDto[];
}

export interface PurchaseInvoiceDto {
  id: string;
  purchaseEntryId: string;
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
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
  // Fase 8 — umbral de cobertura para marcar productos críticos en /proyeccion.
  defaultLeadTimeDays: number;
  // Fase 8.5 — seguimiento + HubSpot.
  followUpHoursDefault: number;
  hubspotEnabled: boolean;
  hubspotDefaultOwnerId: string | null;
  whatsappFollowUpTemplate: string | null;
}

// ---------- Proyección de stock y reportes (Fase 8) ----------

/**
 * Fila de la proyección de stock por producto. El servicio devuelve una por
 * cada producto activo, sumando el stock de todas las bodegas activas.
 *
 * `dailyConsumption` y `coverageDays` pueden ser 0 cuando no hubo ventas en
 * la ventana de consumo (90 días por defecto). En ese caso `coverageDays`
 * se reporta como `null` (interpretado como ∞ por la UI) para evitar
 * NaN/Infinity en el JSON.
 */
export interface ProjectionRowDto {
  productId: string;
  sku: string;
  name: string;
  cost: string;
  totalStock: number;
  // Promedio de unidades vendidas por día, calculado sobre la ventana de
  // consumo (90 días). Redondeado a 4 decimales para legibilidad.
  dailyConsumption: number;
  // Stock / consumo diario. null si consumo = 0 (cobertura infinita).
  coverageDays: number | null;
  // Fecha estimada de quiebre = hoy + coverageDays. null si consumo = 0.
  stockoutDate: string | null;
  // Cantidad sugerida a pedir = consumo_diario × (leadTime + 30) − stockActual.
  // 0 si la fórmula da negativo (stock suficiente).
  suggestedOrder: number;
  // true cuando coverageDays !== null && coverageDays <= leadTimeDays.
  isCritical: boolean;
}

export interface ProjectionResponseDto {
  leadTimeDays: number;
  windowDays: number;
  generatedAt: string;
  rows: ProjectionRowDto[];
}

export interface ReportSalesRowDto {
  id: string;
  number: string;
  date: string;
  customerName: string;
  customerTaxId: string | null;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD';
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  subtotal: string;
  taxAmount: string;
  total: string;
}

export interface ReportSalesResponseDto {
  dateFrom: string | null;
  dateTo: string | null;
  rows: ReportSalesRowDto[];
  // Totales agregan SOLO las ventas no canceladas.
  totalSubtotal: string;
  totalTax: string;
  totalAmount: string;
  countActive: number;
  countCancelled: number;
}

export interface ReportIvaSaleRowDto {
  id: string;
  number: string;
  date: string;
  customerName: string;
  customerTaxId: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
}

export interface ReportIvaPurchaseRowDto {
  id: string;
  date: string;
  supplierName: string;
  supplierTaxId: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
}

export interface ReportIvaResponseDto {
  dateFrom: string | null;
  dateTo: string | null;
  // IVA débito = suma de tax de ventas no canceladas (lo que el negocio debe).
  debit: string;
  // IVA crédito = suma de tax de compras (lo que se puede acreditar).
  credit: string;
  // debit − credit (positivo = a pagar; negativo = a favor).
  balance: string;
  salesRows: ReportIvaSaleRowDto[];
  purchaseRows: ReportIvaPurchaseRowDto[];
}

export type CashFlowSourceDto =
  | 'SALE'
  | 'PURCHASE'
  | 'MANUAL'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN';

export interface ReportCashFlowRowDto {
  id: string;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  source: CashFlowSourceDto;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD';
  description: string;
  amount: string;
  isVoided: boolean;
}

export interface ReportCashFlowResponseDto {
  dateFrom: string | null;
  dateTo: string | null;
  rows: ReportCashFlowRowDto[];
  totalIncome: string;
  totalExpense: string;
  net: string;
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

// ---------- Devoluciones (Fase 7.6) ----------

export type ReturnTypeDto = 'CUSTOMER' | 'SUPPLIER';
export type ReturnStatusDto = 'COMPLETED' | 'CANCELLED';
export type ReturnItemConditionDto = 'RESELLABLE' | 'DAMAGED';

export interface ReturnItemDto {
  id: string;
  productId: string;
  qty: number;
  unitPrice: string;
  unitCost: string;
  subtotal: string;
  itemCondition: ReturnItemConditionDto;
  saleItemId: string | null;
  purchaseEntryItemId: string | null;
  product?: {
    id: string;
    sku: string;
    name: string;
    partNumber: string | null;
  };
}

export interface ReturnDto {
  id: string;
  number: string;
  type: ReturnTypeDto;
  saleId: string | null;
  sale?: { id: string; number: string; customerId: string } | null;
  purchaseEntryId: string | null;
  purchaseEntry?: { id: string; supplierId: string } | null;
  warehouseId: string;
  warehouse?: { id: string; name: string };
  date: string;
  reason: string;
  notes: string | null;
  refundAmount: string;
  paymentMethod: PaymentMethodDto;
  status: ReturnStatusDto;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy?: { id: string; name: string; email: string } | null;
  user?: { id: string; name: string; email: string };
  items?: ReturnItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateReturnItemInput {
  productId: string;
  // Si type=CUSTOMER, saleItemId es obligatorio para validar anti-doble-devolución.
  saleItemId?: string | null;
  // Si type=SUPPLIER, purchaseEntryItemId es obligatorio.
  purchaseEntryItemId?: string | null;
  qty: number;
  unitPrice: string;
  itemCondition: ReturnItemConditionDto;
}

export interface CreateReturnInput {
  type: ReturnTypeDto;
  saleId?: string | null;
  purchaseEntryId?: string | null;
  date?: string;
  reason: string;
  notes?: string | null;
  paymentMethod: PaymentMethodDto;
  items: CreateReturnItemInput[];
}

export interface CancelReturnInput {
  reason: string;
}

/**
 * Cantidad devuelta acumulada de cada SaleItem. Lo consume el form de
 * devolución del cliente para limitar `qty` máxima permitida por línea.
 */
export interface ReturnedQtyDto {
  saleItemId: string;
  qty: number;
}

// ---------- Garantías (Fase 7.6) ----------

export type WarrantyStatusDto =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESOLVED';

export interface WarrantyClaimDto {
  id: string;
  number: string;
  saleItemId: string;
  productId: string;
  customerId: string;
  status: WarrantyStatusDto;
  openedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  notes: string | null;
  linkedReturnId: string | null;
  // Datos relacionados para listado/detalle (cuando se carga con joins):
  sale?: { id: string; number: string } | null;
  product?: { id: string; sku: string; name: string };
  customer?: { id: string; name: string; taxId: string };
  user?: { id: string; name: string; email: string };
  linkedReturn?: { id: string; number: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarrantyClaimInput {
  saleItemId: string;
  notes?: string | null;
}

export interface UpdateWarrantyClaimStatusInput {
  status: WarrantyStatusDto;
  resolution?: string | null;
  notes?: string | null;
}

// ---------- Guías de despacho (Fase 7.7) ----------

export type DispatchStatusDto = 'ACTIVE' | 'VOIDED';

export interface DispatchNoteDto {
  id: string;
  number: string;
  saleId: string;
  sale?: {
    id: string;
    number: string;
    customerId: string;
    customer?: { id: string; name: string; taxId: string };
    items?: Array<{
      id: string;
      productId: string;
      qty: number;
      product?: { id: string; sku: string; name: string };
    }>;
  };
  dispatchedAt: string;
  carrier: string | null;
  trackingNumber: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  communeId: string | null;
  commune?: { id: string; name: string; region: string } | null;
  addressNotes: string | null;
  notes: string | null;
  status: DispatchStatusDto;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy?: { id: string; name: string; email: string } | null;
  user?: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateDispatchNoteInput {
  saleId: string;
  // Si no se manda, el backend usa la fecha actual.
  dispatchedAt?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  // Dirección de entrega (snapshot). Por defecto el frontend la pre-llena con
  // la del cliente, pero puede modificarse para esta guía.
  addressStreet?: string | null;
  addressNumber?: string | null;
  communeId?: string | null;
  addressNotes?: string | null;
  notes?: string | null;
}

export interface VoidDispatchNoteInput {
  reason: string;
}

// ---------- Fase 9 — Dashboard ----------

export interface DashboardSummaryDto {
  today: {
    sales: { count: number; amount: string };
    quotations: { count: number; amount: string };
    cash: {
      total: string;
      byMethod: Record<PaymentMethodDto, string>;
    };
  };
  lifecycle: {
    // Clientes en QUOTED + FOLLOW_UP (independiente de nextFollowUpAt). Es
    // el universo del embudo abierto.
    pendingFollowUp: number;
    // Subset: solo FOLLOW_UP (vencidos por el cron).
    overdueFollowUp: number;
    // Conteo de clientes WON cuyo último contacto cae en el mes actual.
    wonThisMonth: number;
  };
  month: {
    // Utilidad operativa = subtotal_ventas_neto − COGS − gastos.
    profit: string;
    salesSubtotal: string;
    cogs: string;
    expenses: string;
    inventoryValue: string;
  };
  alerts: {
    outOfStock: number;
    lowStock: number;
    noMovement30d: number;
    // Cociente COGS_mes / inventario actual. Marcado como `isApprox` mientras
    // no haya snapshot histórico para promediar inventario.
    inventoryTurnover: string;
    inventoryTurnoverIsApprox: boolean;
  };
}

// ---------- Fase 9 — Reporte sin movimiento ----------

export interface NoMovementRowDto {
  productId: string;
  sku: string;
  name: string;
  // Última vez que el producto tuvo cualquier movimiento (entrada, salida,
  // ajuste, transfer). Null si nunca tuvo.
  lastMovementAt: string | null;
  daysSinceLastMovement: number | null;
  // Stock actual sumando todas las bodegas activas.
  totalStock: number;
  // Costo total del stock detenido: quantity × product.cost.
  inventoryValue: string;
  categoryName: string | null;
  brandName: string | null;
}

export interface NoMovementReportDto {
  days: number;
  rows: NoMovementRowDto[];
  totalProducts: number;
  totalInventoryValue: string;
}

// ---------- Fase 10 — Carga masiva Excel ----------

/**
 * Acción que el importador planea ejecutar para una fila del Excel:
 *  - `create` → SKU no existe en el catálogo, se va a crear.
 *  - `update` → SKU ya existe, se va a actualizar (upsert por SKU).
 *  - `skip`   → fila inválida o vacía, no se procesa.
 */
export type ProductImportAction = 'create' | 'update' | 'skip';

/**
 * Fila parseada del Excel ya validada y lista para mostrar en el preview.
 * Los campos coinciden con el DTO de creación de productos. `null` indica
 * que la columna estaba vacía o no aplica.
 */
export interface ProductImportRowDto {
  rowNumber: number; // número de fila en el Excel (2 = primera fila de datos)
  action: ProductImportAction;
  sku: string;
  name: string;
  partNumber: string | null;
  barcode: string | null;
  universalCode: string | null;
  description: string | null;
  // Nombre tal como vino en el Excel; al confirmar, si la categoría/marca no
  // existe se crea automáticamente.
  categoryName: string | null;
  brandName: string | null;
  cost: string | null;
  price: string | null;
  minStock: number | null;
  maxStock: number | null;
  location: string | null;
  productKind: 'ORIGINAL' | 'ALTERNATIVE' | null;
  // Lista de códigos compatibles ya parseados (separados por `;` en el Excel).
  compatibleCodes: string[];
  // Si `action='update'`, el id del producto existente. Null si es create.
  existingProductId: string | null;
}

export interface ProductImportErrorDto {
  rowNumber: number;
  sku: string | null;
  message: string;
}

/**
 * Resumen del preview: lo que el operador ve ANTES de confirmar. Incluye
 * conteos por tipo de acción, primeras 10 filas para inspección visual,
 * lista completa de errores y los nombres de categorías/marcas que se
 * crearían automáticamente al confirmar.
 */
export interface ProductImportPreviewDto {
  totalRows: number;
  validCount: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  // Primeras 10 filas válidas para que el operador inspeccione antes de
  // confirmar. Si hay menos de 10 válidas, devuelve las que haya.
  previewRows: ProductImportRowDto[];
  errors: ProductImportErrorDto[];
  // Nombres de categorías/marcas que aparecen en el Excel y todavía NO
  // existen en el sistema. Al confirmar se crean automáticamente.
  newCategories: string[];
  newBrands: string[];
}

/**
 * Resultado al confirmar la importación. Reporta cuántas filas se procesaron
 * con éxito (separadas en created/updated) y cuántas fallaron con su detalle.
 * Las filas fallidas NO bloquean las exitosas (partial success).
 */
export interface ProductImportResultDto {
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: ProductImportErrorDto[];
  // Categorías/marcas que se crearon como efecto colateral.
  createdCategories: string[];
  createdBrands: string[];
}
