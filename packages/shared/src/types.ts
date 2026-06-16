// Tipos de respuesta de la API. La API devuelve decimales como string para
// no perder precisión; el frontend los formatea al renderizar.

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  // Ronda 10 — nombre del padre cuando aplica (para mostrar la jerarquía
  // "Padre › Hija" en selects y listados sin un join extra en frontend).
  parentName?: string | null;

  // ===== Stats agregados (presentes solo con ?withStats=true) =====
  // Ronda 11 — campos opcionales calculados sobre productos/stock/ventas.
  //
  // list({ withStats: true }): los 5 conteos lightweight se devuelven con
  // alcance DIRECTO (solo productos cuyo categoryId === c.id). Sin
  // topProducts (caro de calcular por fila).
  //
  // getOne(id, { withStats: true }): los 5 conteos vienen ROLLED-UP
  // (categoría + sus subcategorías de 1 nivel) + topProducts del mes.

  /** Cantidad de productos asociados. Direct en list, rolled-up en getOne. */
  productCount?: number;

  /** Suma de stock × costo unitario sobre productos activos. CLP. */
  inventoryValue?: number;

  /** Productos con stock total = 0 (suma todas las bodegas). */
  outOfStockCount?: number;

  /** Productos con stock > 0 pero < minStock (semáforo amarillo). */
  lowStockCount?: number;

  /** Margen promedio %, 0-100. AVG((price - cost) / price * 100). */
  avgMarginPct?: number;

  /** Top productos por monto facturado en el mes en curso (solo en getOne). */
  topProducts?: Array<{
    id: string;
    sku: string | null;
    name: string;
    units: number;
    amount: number;
    coverUrl: string | null;
  }>;
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
  // Ronda 9 — SKU opcional. Si el operador no lo cargó al crear, el backend
  // asignó `AUTO-AAAA-NNNNN`. El campo solo es `null` durante la creación
  // antes del flush — todas las filas persistidas tienen valor.
  sku: string | null;
  partNumber: string | null;
  barcode: string | null;
  // Código universal opcional y único del producto.
  universalCode: string | null;
  name: string;
  description: string | null;
  // Nota interna del operador (distinta de `description`, que es comercial).
  observation: string | null;
  categoryId: string | null;
  brandId: string | null;
  supplierId: string | null;
  // `cost` es null cuando el rol del usuario no tiene el permiso
  // `PRODUCT_VIEW_COST` (típicamente USER/vendedor). El backend hace defense
  // in depth: aunque el frontend olvide esconder el campo, el valor no
  // llega al cliente. ADMIN siempre lo recibe como string.
  cost: string | null;
  price: string;
  minStock: number;
  location: string | null;
  isActive: boolean;
  // Fase 4B
  productKind: ProductKindDto;
  images?: ProductImageDto[];
  compatibleCodes?: string[];
  coverUrl?: string | null;
  // Stock agregado de todas las bodegas. Lo expone el backend para que la
  // UI de productos pueda mostrarlo sin pedir /inventory/stock por separado.
  currentStock?: number;
  // Relaciones
  category?: CategoryDto | null;
  brand?: BrandDto | null;
  fitments?: VehicleFitmentDto[];
}

/**
 * Stock de un producto en una bodega puntual. Lo devuelve
 * `GET /products/:id/stock` (TODAS las bodegas donde el producto tiene fila de
 * stock), para que el modal "Agregar al bolso" muestre el desglose completo sin
 * depender de la bodega activa.
 */
export interface ProductStockRowDto {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  locationCode: string | null;
}

/**
 * Conteo de relaciones de un producto. Lo consume el modal de confirmación de
 * borrado para informar el impacto (el producto se elimina vía SOFT DELETE, así
 * que estos registros históricos se conservan). `total` es la suma de todos.
 */
export interface ProductRelationsDto {
  movements: number;
  sales: number;
  purchases: number;
  quotations: number;
  warranties: number;
  returns: number;
  transfers: number;
  total: number;
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
    sku: string | null;
    name: string;
    partNumber: string | null;
    barcode: string | null;
    minStock: number;
    /** @deprecated Desde Fase 7.5, ver `locationCode` per-bodega. */
    location: string | null;
    // null cuando el viewer no tiene permiso para ver costos (USER).
    cost: string | null;
    price: string;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
    coverUrl: string | null;
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
    | 'RETURN_IN_DAMAGED'
    // Ronda 8 — eventos audit-only del módulo de guías de despacho y de la
    // cancelación de devoluciones con condición DAMAGED. Ninguno toca stock.
    | 'DISPATCH_OUT'
    | 'DISPATCH_VOIDED'
    | 'RETURN_DAMAGED_CANCELLED';
  qty: number;
  unitCost: string | null;
  reference: string | null;
  refId: string | null;
  createdAt: string;
  product: { id: string; sku: string | null; name: string } | null;
  warehouse: { id: string; name: string } | null;
  user: { id: string; name: string; email: string } | null;
}

// ---------- Movimientos en formato Card (Ronda 13) ----------
// Endpoint `/inventory/movements/cards` agrupa filas de `inventory_movements`
// por `refId` (o por `id` si no tiene) y devuelve cada grupo joineado con su
// entidad padre (Sale, PurchaseEntry, Return, Transfer, DispatchNote) para
// que el frontend muestre cards con toda la info de la transacción sin N+1.

export type MovementTypeDto = MovementDto['type'];

interface MovementProductSummary {
  id: string;
  sku: string | null;
  name: string;
}

interface MovementWarehouseSummary {
  id: string;
  name: string;
}

interface MovementUserSummary {
  id: string;
  name: string;
  email: string;
}

// Movimientos atómicos individuales que componen el grupo. Útil para mostrar
// el detalle expandido (ej. cada SALE_OUT que vino de una venta).
export interface MovementCardEntryDto {
  movementId: string;
  type: MovementTypeDto;
  qty: number;
  unitCost: string | null;
  product: MovementProductSummary;
  warehouse: MovementWarehouseSummary;
  createdAt: string;
}

interface MovementCardBase {
  // Clave del grupo: refId si existe, sino el id del movimiento singleton.
  groupKey: string;
  // Última fecha de los movimientos del grupo — sirve para ordenar.
  latestAt: string;
  user: MovementUserSummary | null;
  movements: MovementCardEntryDto[];
  // Suma de |qty| de todos los movimientos del grupo.
  totalQty: number;
  // Cantidad de líneas de producto en el grupo.
  itemCount: number;
  // True si la card representa un evento que no afecta stock (auditoría):
  // DISPATCH_OUT, DISPATCH_VOIDED, RETURN_IN_DAMAGED, RETURN_DAMAGED_CANCELLED.
  isAuditOnly: boolean;
}

export interface PurchaseMovementCardDto extends MovementCardBase {
  kind: 'PURCHASE';
  purchase: {
    id: string;
    supplier: { id: string; name: string; taxId: string | null } | null;
    warehouse: MovementWarehouseSummary | null;
    date: string;
    total: string;
    subtotal: string;
    taxAmount: string;
    notes: string | null;
    invoices: Array<{
      id: string;
      url: string;
      originalName: string;
      mimeType: string;
    }>;
    items: Array<{
      product: MovementProductSummary;
      qty: number;
      unitCost: string;
      subtotal: string;
    }>;
  };
}

export interface SaleMovementCardDto extends MovementCardBase {
  kind: 'SALE';
  sale: {
    id: string;
    number: string;
    customer: {
      id: string;
      name: string;
      taxId: string | null;
      phone: string | null;
    } | null;
    warehouse: MovementWarehouseSummary;
    date: string;
    paymentMethod:
      | 'CASH'
      | 'TRANSFER'
      | 'CARD_DEBIT'
      | 'CARD_CREDIT'
      | 'PAYMENT_LINK';
    status: 'PENDING' | 'PAID' | 'CANCELLED';
    subtotal: string;
    taxAmount: string;
    commissionAmount: string;
    total: string;
    quotationId: string | null;
    quotationNumber: string | null;
    notes: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    items: Array<{
      product: MovementProductSummary;
      qty: number;
      unitPrice: string;
      discount: string;
      subtotal: string;
    }>;
  };
}

export interface ReturnMovementCardDto extends MovementCardBase {
  kind: 'RETURN';
  return: {
    id: string;
    number: string;
    type: 'CUSTOMER' | 'SUPPLIER';
    customer: {
      id: string;
      name: string;
      taxId: string | null;
      phone: string | null;
    } | null;
    supplier: { id: string; name: string; taxId: string | null } | null;
    saleOrigin: { id: string; number: string } | null;
    purchaseOrigin: { id: string; date: string } | null;
    warehouse: MovementWarehouseSummary;
    date: string;
    reason: string;
    notes: string | null;
    refundAmount: string;
    paymentMethod:
      | 'CASH'
      | 'TRANSFER'
      | 'CARD_DEBIT'
      | 'CARD_CREDIT'
      | 'PAYMENT_LINK';
    refundMode: 'MONEY' | 'CREDIT' | 'EXCHANGE';
    exchangeDifference: string;
    status: 'COMPLETED' | 'CANCELLED';
    cancelledAt: string | null;
    cancelReason: string | null;
    items: Array<{
      product: MovementProductSummary;
      qty: number;
      unitPrice: string;
      subtotal: string;
      itemCondition: 'RESELLABLE' | 'DAMAGED';
    }>;
  };
}

export interface TransferMovementCardDto extends MovementCardBase {
  kind: 'TRANSFER';
  transfer: {
    id: string;
    number: string;
    fromWarehouse: MovementWarehouseSummary;
    toWarehouse: MovementWarehouseSummary;
    date: string;
    notes: string | null;
    status: 'COMPLETED' | 'CANCELLED';
    cancelledAt: string | null;
    cancelReason: string | null;
    items: Array<{
      product: MovementProductSummary;
      qty: number;
      unitCost: string | null;
    }>;
  };
}

export interface DispatchMovementCardDto extends MovementCardBase {
  kind: 'DISPATCH';
  dispatch: {
    id: string;
    number: string;
    sale: { id: string; number: string };
    customer: { id: string; name: string; taxId: string | null } | null;
    dispatchedAt: string;
    carrier: string | null;
    trackingNumber: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    commune: { id: string; name: string; region: string } | null;
    addressNotes: string | null;
    notes: string | null;
    status: 'ACTIVE' | 'VOIDED';
    // Tipo del movimiento original (DISPATCH_OUT al generar, DISPATCH_VOIDED
    // al anular). Permite distinguir "guía generada" de "guía anulada" como
    // dos cards distintas aunque compartan refId.
    eventType: 'DISPATCH_OUT' | 'DISPATCH_VOIDED';
    voidedAt: string | null;
    voidReason: string | null;
  };
}

export interface AdjustmentMovementCardDto extends MovementCardBase {
  kind: 'ADJUSTMENT';
  // `movements` siempre tiene exactamente 1 entry para ajustes (no se agrupan).
}

// Card de fallback cuando no encontramos la entidad padre — pasa si la
// transacción origen fue eliminada o si el `reference` no matchea ninguna
// tabla conocida. Se muestra con un layout neutral.
export interface OrphanMovementCardDto extends MovementCardBase {
  kind: 'ORPHAN';
  rawType: MovementTypeDto;
  reference: string | null;
  refId: string | null;
}

export type MovementCardDto =
  | PurchaseMovementCardDto
  | SaleMovementCardDto
  | ReturnMovementCardDto
  | TransferMovementCardDto
  | DispatchMovementCardDto
  | AdjustmentMovementCardDto
  | OrphanMovementCardDto;

// ---------- Suppliers ----------

export interface SupplierDto {
  id: string;
  name: string;
  taxId: string | null;
  // Ronda 9 — razón social formal + nombre de la persona de contacto.
  legalName: string | null;
  contactPerson: string | null;
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
  // Fase 12 — borrador ("cliente libre"): creado solo con nombre, se completa
  // luego. Oculto de listados/selectores normales salvo que se pidan.
  isDraft: boolean;
  // Ronda 9 — RUT opcional para soportar clientes lite (sólo WhatsApp).
  // SalesService.create bloquea facturar a clientes sin RUT.
  taxId: string | null;
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
  customerTaxId: string | null;
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
    // Ronda 10 — estado actual de la cotización + fecha de creación.
    // El badge de /seguimiento ahora muestra este status (en vez del
    // `lifecycleStatus` del Customer) para mantener consistencia con
    // los estados visibles en /cotizaciones.
    status: QuotationStatusDto;
    createdAt: string;
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
  product?: { id: string; sku: string | null; name: string };
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

// Ronda 9 — `CARD` se desdobló en débito, crédito y link de pago. Las
// comisiones se configuran por separado en CompanySettings.
export type PaymentMethodDto =
  | 'CASH'
  | 'TRANSFER'
  | 'CARD_DEBIT'
  | 'CARD_CREDIT'
  | 'PAYMENT_LINK';
export type CashTransactionTypeDto = 'INCOME' | 'EXPENSE';
export type CashTransactionSourceDto =
  | 'SALE'
  | 'PURCHASE'
  | 'MANUAL'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  // Fase 12 — capital inicial de la empresa (registrado una sola vez).
  | 'OPENING';

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
  /** @deprecated desde Ronda 9 — usar `cardCreditCommissionRate`. */
  cardCommissionRate: string;
  cardDebitCommissionRate: string;
  cardCreditCommissionRate: string;
  paymentLinkCommissionRate: string;
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
  sku: string | null;
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
  paymentMethod: PaymentMethodDto;
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
  | 'PURCHASE_RETURN'
  | 'OPENING';

export interface ReportCashFlowRowDto {
  id: string;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  source: CashFlowSourceDto;
  paymentMethod: PaymentMethodDto;
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
  // Ronda 9 — productId puede ser null para "productos temporales" creados
  // al vuelo dentro de la cotización. En ese caso los campos `tempProduct*`
  // contienen los datos snapshot. La conversión a venta bloquea hasta que
  // todos los items tengan un productId real.
  productId: string | null;
  isTemporary: boolean;
  tempProductName: string | null;
  tempProductSku: string | null;
  tempProductPartNumber: string | null;
  qty: number;
  unitPrice: string;
  discount: string;
  // Si fue ingresado como porcentaje, queda persistido para imprimir en PDF.
  discountPercent: string | null;
  subtotal: string;
  product?: {
    id: string;
    sku: string | null;
    name: string;
    partNumber: string | null;
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
    sku: string | null;
    name: string;
    partNumber: string | null;
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
  // Cuando el viewer no tiene `SALE_VIEW_FINANCIAL_BREAKDOWN` (USER), el
  // backend devuelve null en estos campos. El frontend muestra solo `total`.
  subtotal: string | null;
  taxAmount: string | null;
  commissionAmount: string | null;
  total: string;
  paymentMethod: PaymentMethodDto | null;
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
    sku: string | null;
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
// Ronda 9 — modo de reembolso de la devolución.
//  - MONEY: dinero (compatibilidad con devoluciones previas).
//  - CREDIT: sólo válido en devoluciones a proveedor; genera SupplierCredit.
//  - EXCHANGE: sólo válido en devoluciones de cliente; usa replacementItems.
export type RefundModeDto = 'MONEY' | 'CREDIT' | 'EXCHANGE';

export interface ReturnReplacementItemDto {
  id: string;
  productId: string;
  qty: number;
  unitPrice: string;
  unitCost: string;
  subtotal: string;
  product?: {
    id: string;
    sku: string | null;
    name: string;
    partNumber: string | null;
  };
}

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
    sku: string | null;
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
  // Ronda 9 — modo de reembolso + datos derivados.
  refundMode: RefundModeDto;
  supplierCreditId: string | null;
  exchangeDifference: string;
  replacementItems?: ReturnReplacementItemDto[];
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

export interface CreateReturnReplacementItemInput {
  productId: string;
  qty: number;
  unitPrice: string;
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
  // Ronda 9 — modo de reembolso. Default MONEY.
  refundMode?: RefundModeDto;
  // Si refundMode=EXCHANGE (sólo CUSTOMER): items que el cliente se lleva
  // a cambio. La diferencia bruta se cobra/reembolsa automáticamente.
  replacementItems?: CreateReturnReplacementItemInput[];
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
  product?: { id: string; sku: string | null; name: string };
  customer?: { id: string; name: string; taxId: string | null };
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
    customer?: { id: string; name: string; taxId: string | null };
    items?: Array<{
      id: string;
      productId: string;
      qty: number;
      product?: { id: string; sku: string | null; name: string };
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

export interface DashboardSalesTrendPointDto {
  date: string; // YYYY-MM-DD
  amount: number;
  count: number;
}

export interface DashboardCashFlowPointDto {
  date: string; // YYYY-MM-DD
  inflow: number;
  outflow: number;
}

export interface DashboardTopProductDto {
  id: string;
  sku: string | null;
  name: string;
  units: number;
  amount: number;
  deltaPct: number | null; // % vs mes anterior; null si el mes anterior fue 0
  coverUrl: string | null;
}

export interface DashboardCategoryBreakdownDto {
  id: string;
  name: string;
  amount: number;
  marginPct: number; // (amount − cogs) / amount × 100
  turnover: number; // cogs_categoría / inventario_promedio_categoría
}

export interface DashboardFollowUpDto {
  id: string; // id de la cotización (para link a /cotizaciones/:id) o customer si no hay cotización
  customerName: string;
  phone: string | null; // whatsappPhone con fallback a phone
  quoteNumber: string;
  amount: number;
  daysSinceLastContact: number;
}

export interface DashboardLifecycleFunnelDto {
  NEW: number;
  QUOTED: number;
  FOLLOW_UP: number;
  WON: number;
  LOST: number;
}

/**
 * Rango temporal del dashboard. Default `hoy`. Persistido en URL como
 * `?range=hoy|7d|30d|mes`. Cuando cambia, casi todos los bloques con
 * semántica temporal del DTO se recalculan (`today` deja de significar
 * literalmente "hoy" y pasa a ser "el rango seleccionado" — el frontend
 * adapta los labels).
 *
 * Estados / contadores que NO son temporales (alerts de stock, embudo
 * lifecycle, valor de inventario) quedan independientes del filtro.
 */
export type DashboardRangeDto = 'hoy' | '7d' | '30d' | 'mes';

export interface DashboardSummaryDto {
  // Rango efectivo aplicado al snapshot. El frontend lo usa para ajustar
  // labels ("Hoy llevás" vs "Últimos 7 días"). Si el cliente manda
  // `?range=xx` inválido, el backend lo normaliza a 'hoy' y lo devuelve acá.
  range: DashboardRangeDto;
  // Métricas del rango seleccionado: ventas, cotizaciones y caja del período.
  // La clave se llama `today` por compatibilidad con la versión anterior del
  // DTO; semánticamente es "current period".
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
  // Series temporales últimos 30 días (huecos rellenados con 0).
  trend: {
    salesByDay: DashboardSalesTrendPointDto[];
    cashFlowByDay: DashboardCashFlowPointDto[];
  };
  top: {
    products: DashboardTopProductDto[]; // top 10 del mes por monto
    categories: DashboardCategoryBreakdownDto[]; // todas las categorías con ventas del mes
  };
  // Top 10 clientes pendientes de seguimiento ordenados por nextFollowUpAt asc
  // (vencidos primero). Incluye snapshot de la última cotización SENT/APPROVED.
  followUps: DashboardFollowUpDto[];
  // Deltas: hoy vs ayer para ventas y caja, mes actual vs mes anterior para
  // utilidad. null cuando el período base es 0 (división indefinida).
  comparison: {
    salesDeltaPct: number | null;
    cashDeltaPct: number | null;
    profitDeltaPct: number | null;
  };
  // Desglose de utilidad del mes. `netSales` y `cogs` son alias de
  // `month.salesSubtotal` y `month.cogs` exportados acá para que el front
  // los consuma como un bloque coherente sin tener que leerlos de dos lugares.
  monthBreakdown: {
    netSales: number;
    cogs: number;
    expenses: number;
  };
  // Embudo lifecycle: NEW/QUOTED/FOLLOW_UP/LOST = conteo del estado ACTUAL,
  // WON = mismo cálculo que `lifecycle.wonThisMonth` (cerrados en el mes).
  lifecycleFunnel: DashboardLifecycleFunnelDto;
}

// ---------- Fase 9 — Reporte sin movimiento ----------

export interface NoMovementRowDto {
  productId: string;
  sku: string | null;
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
  // Código universal opcional y único. Importable/exportable vía Excel.
  universalCode: string | null;
  description: string | null;
  // Nota interna del producto. Importable/exportable vía Excel.
  observation: string | null;
  // Nombre tal como vino en el Excel; al confirmar, si la categoría/marca no
  // existe se crea automáticamente.
  categoryName: string | null;
  brandName: string | null;
  cost: string | null;
  price: string | null;
  minStock: number | null;
  location: string | null;
  productKind: 'ORIGINAL' | 'ALTERNATIVE' | null;
  // Lista de códigos compatibles ya parseados (separados por `;` en el Excel).
  compatibleCodes: string[];
  // Compatibilidad vehicular. Cada string viene en formato
  // "Marca:Modelo" o "Marca:Modelo:AñoFrom-AñoTo" en el Excel; al
  // confirmar, marca/modelo se crean si no existen y se reemplazan los
  // fitments del producto (estrategia replace).
  vehicleModels: VehicleModelImportInput[];
  // Stock por bodega. El Excel trae UNA COLUMNA POR BODEGA (el header es el
  // nombre de la bodega). Cada entrada establece el stock de esa bodega al
  // valor indicado (el importer registra un ADJUSTMENT con el delta). Si la
  // bodega no existe, se crea automáticamente al confirmar.
  warehouseStocks: WarehouseStockImportInput[];
  // Si `action='update'`, el id del producto existente. Null si es create.
  existingProductId: string | null;
}

/**
 * Stock y/o ubicación a establecer en una bodega puntual, parseado de las
 * columnas por-bodega del Excel ("Stock bodega X" y "Ubicación bodega X").
 * `warehouseName` es el nombre de la bodega (lo que sigue al prefijo del
 * header). `quantity` es `null` cuando la celda de stock está vacía (no se
 * toca el stock, solo eventualmente la ubicación). `locationCode` es `null`
 * cuando la celda de ubicación está vacía.
 */
export interface WarehouseStockImportInput {
  warehouseName: string;
  quantity: number | null;
  locationCode: string | null;
}

/**
 * Item de compatibilidad vehicular parseado de la columna `Modelo` del
 * Excel. Si `yearFrom`/`yearTo` vienen null, aplica a cualquier año.
 */
export interface VehicleModelImportInput {
  makeName: string;
  modelName: string;
  yearFrom: number | null;
  yearTo: number | null;
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
  // Nombres de categorías/marcas/bodegas y modelos de vehículo que aparecen en
  // el Excel y todavía NO existen en el sistema. Al confirmar se crean
  // automáticamente. Se muestran en el preview para que el operador sepa qué
  // se va a crear antes de confirmar.
  newCategories: string[];
  newBrands: string[];
  newWarehouses: string[];
  // Modelos de vehículo a crear, formateados "Marca Modelo".
  newVehicleModels: string[];
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
  // Categorías/marcas/bodegas y modelos de vehículo que se crearon como efecto
  // colateral de la importación.
  createdCategories: string[];
  createdBrands: string[];
  createdWarehouses: string[];
  createdVehicleModels: string[];
}

// ---------- Importers de clientes / proveedores (polish Mayo 2026) ----------
//
// Mismo patrón de UX que Fase 10 productos: subir → preview → confirmar.
// Estrategia UPSERT por RUT (taxId) + partial success.

export type ContactImportAction = 'create' | 'update' | 'skip';

export interface ContactImportErrorDto {
  rowNumber: number;
  taxId: string | null;
  message: string;
}

export interface CustomerImportRowDto {
  rowNumber: number;
  action: ContactImportAction;
  taxId: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsappPhone: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  communeName: string | null;
  communeId: string | null; // resuelto en preview por lookup por nombre
  internalNotes: string | null;
  existingCustomerId: string | null;
}

export interface CustomerImportPreviewDto {
  totalRows: number;
  validCount: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  previewRows: CustomerImportRowDto[];
  errors: ContactImportErrorDto[];
}

export interface CustomerImportResultDto {
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: ContactImportErrorDto[];
}

export interface SupplierImportRowDto {
  rowNumber: number;
  action: ContactImportAction;
  taxId: string;
  name: string;
  legalName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  existingSupplierId: string | null;
}

export interface SupplierImportPreviewDto {
  totalRows: number;
  validCount: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  previewRows: SupplierImportRowDto[];
  errors: ContactImportErrorDto[];
}

export interface SupplierImportResultDto {
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: ContactImportErrorDto[];
}

// ---------- Ronda 9: SupplierCredit + Compras KPIs ----------

export type SupplierCreditStatusDto = 'ACTIVE' | 'SPENT' | 'VOIDED';

export interface SupplierCreditDto {
  id: string;
  supplierId: string;
  supplier?: { id: string; name: string };
  sourceReturnId: string | null;
  sourceReturn?: { id: string; number: string } | null;
  amount: string;
  balance: string;
  status: SupplierCreditStatusDto;
  notes: string | null;
  user?: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseCreditApplicationDto {
  id: string;
  purchaseEntryId: string;
  supplierCreditId: string;
  amount: string;
  credit?: { id: string; sourceReturnId: string | null };
  createdAt: string;
}

/**
 * KPIs de compras mostrados arriba de `/compras`. Calculados sobre el mes
 * actual (default) o sobre un rango personalizado.
 */
export interface PurchasesKpisDto {
  // Total bruto de compras del período (excluye devoluciones).
  totalAmount: string;
  // Cantidad de compras del período.
  count: number;
  // Promedio = totalAmount / count. 0 si count=0.
  averageAmount: string;
  // Total devuelto a proveedores en el período (suma de refundAmount de
  // devoluciones type=SUPPLIER no canceladas).
  returnsAmount: string;
  returnsCount: number;
  // Última compra registrada (cualquier período). Útil cuando count=0.
  lastPurchase: {
    id: string;
    date: string;
    total: string;
    supplierName: string;
  } | null;
  // Período usado para el cálculo. ISO strings.
  periodFrom: string;
  periodTo: string;
}

// ---------- Ronda 12: KPIs de ventas ----------

export interface SalesTopProductDto {
  productId: string;
  sku: string | null;
  name: string;
  // Cantidad total de unidades vendidas en el período.
  qty: number;
  // Suma de subtotales (bruto) en el período.
  totalAmount: string;
}

export interface SalesTopCustomerDto {
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  // Cantidad de ventas confirmadas en el período.
  salesCount: number;
  // Suma del total bruto vendido al cliente en el período.
  totalAmount: string;
}

/**
 * KPIs de ventas mostrados arriba de `/ventas`. Calculados sobre el mes
 * actual (default) o sobre un rango personalizado. Excluye ventas
 * canceladas. Las ventas del día se calculan SIEMPRE sobre el día actual
 * (independiente del período de los demás KPIs).
 */
export interface SalesKpisDto {
  // Total vendido en el período (excluye canceladas).
  totalAmount: string;
  count: number;
  averageAmount: string;
  // Total vendido HOY (siempre el día actual del servidor).
  todayAmount: string;
  todayCount: number;
  // Última venta registrada (cualquier período). Útil cuando count=0.
  lastSale: {
    id: string;
    number: string;
    date: string;
    total: string;
    customerName: string;
  } | null;
  // Top 5 productos más vendidos del período (por qty).
  topProducts: SalesTopProductDto[];
  // Top 5 clientes con más ventas en el período.
  topCustomers: SalesTopCustomerDto[];
  periodFrom: string;
  periodTo: string;
}
