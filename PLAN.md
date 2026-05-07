# Plan — Sistema de Gestión de Inventario, Cotizaciones, Ventas y Caja

## Contexto

El cliente es una empresa importadora y comercializadora de **repuestos de autos**. Necesita digitalizar su operación con un sistema **simple, rápido, automatizado y escalable** que le permita:

- Controlar stock en tiempo real con alertas visuales (verde/amarillo/rojo).
- Gestionar el catálogo de repuestos con **compatibilidad vehicular** (marca/modelo/año).
- Registrar entradas de mercadería con proveedores.
- Cotizar a clientes y **enviar cotizaciones directamente por WhatsApp o email**.
- Convertir cotizaciones en ventas con métodos de pago (efectivo/transferencia/tarjeta).
- Llevar el **flujo de caja** consolidado con ingresos automáticos (ventas), egresos automáticos (compras) y gastos manuales (arriendo, transporte, publicidad).
- Ver un **dashboard** con KPIs clave para toma de decisiones (ventas del mes, utilidad, caja disponible, valor inventario, alertas).
- Generar reportes y exportarlos a CSV/PDF.
- Cargar masivamente productos desde Excel y operar con lectores de código de barras.

El resultado debe ser un MVP utilizable y desplegable rápido, con arquitectura escalable para fases siguientes (multi-rol, multi-almacén, e-commerce, app móvil, integración HubSpot).

## Decisiones acordadas


| Tema                       | Decisión                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| País / moneda              | **Chile** (cliente confirma con el término "comuna"); moneda CLP, formato `es-CL`. La utilidad `formatCurrency` está parametrizada para cambiarse rápido si entra otro país.                               |
| Facturación                | Solo documentos internos (cotización, nota de venta, guía de despacho, recibo) — impresión HTML con `@page` CSS para 80mm (térmica) y carta (A4). PDF generado server-side queda como evolución posterior. |
| Flujo de ventas            | Solo administrativo (no POS). Modal de elección "venta o cotización" al iniciar el flujo (entrada unificada).                                                                                              |
| Tenancy                    | Mono-empresa                                                                                                                                                                                               |
| Roles                      | Solo Administrador en MVP, estructura RBAC ligera lista para extender                                                                                                                                      |
| Almacenes                  | **Multi-bodega activado** desde Fase 7.5 (necesario para integración Mercado Libre Full). Hasta entonces, 1 solo almacén `Principal`.                                                                      |
| Compras                    | Solo entradas directas (sin OC formal). Adjuntar factura como archivo. Tiempos de importación: 2-3 meses → módulo de proyección de stock con lead time configurable.                                       |
| Clientes                   | Gestión completa con historial + notas internas. Campos: RUT, nombre, correo, dirección (calle, número, comuna), teléfono. Unicidad de RUT.                                                                |
| Productos                  | Múltiples códigos por producto (interno, universal, fabricante, compatibles, alternativos). Foto del producto. Distinción ORIGINAL/ALTERNATIVO. Compatibilidad por marca/modelo/año de vehículo.           |
| Carga masiva               | Excel `.xlsx`                                                                                                                                                                                              |
| Código de barras           | Esencial: soporte para lector USB y cámara                                                                                                                                                                 |
| Caja                       | Una sola caja consolidada con campo `paymentMethod` (efectivo/transferencia/tarjeta). IVA compra, IVA venta y comisión por tarjeta como categorías predefinidas + auto-registro al cobrar con tarjeta.     |
| Mercado Libre              | Modelado como bodega aparte. Movimientos `TRANSFER_OUT/IN` entre bodegas (no es venta). Integración API real fuera de alcance del MVP — flujo manual.                                                      |
| Envío cotizaciones         | WhatsApp vía `wa.me` + Email vía **Resend**. Botón directo desde la cotización.                                                                                                                            |
| Dashboard                  | Iterativo: KPIs textuales y alertas primero, gráficos en fase posterior                                                                                                                                    |
| HubSpot                    | Pendiente de confirmar alcance con el cliente — fase final                                                                                                                                                 |
| Auth                       | JWT propio en NestJS                                                                                                                                                                                       |
| Hosting                    | Next.js → Vercel · NestJS + MySQL → Railway                                                                                                                                                                |
| UI                         | Tema neutro shadcn/ui · semáforo verde/amarillo/rojo en alertas                                                                                                                                            |
| Almacenamiento de archivos | Disco local en `apps/api/uploads/` durante MVP (servido como estáticos). Migración a S3/Cloudinary queda como evolución cuando se despliegue.                                                              |
| Filtros y paginación       | Convención transversal: filtros se persisten en la URL (`useUrlFilters`), endpoints listan paginado opcional (sin `page`/`pageSize` devuelven array completo para selectores).                             |


## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Hook Form + Zod
- **Backend:** NestJS 10 + TypeScript + TypeORM 0.3 + MySQL 8 + class-validator + Passport (JWT) + bcrypt
- **Subida de archivos:** `@nestjs/platform-express` + `multer` (foto de producto, factura de compra) — se sirve como estáticos durante el MVP.
- **Email transaccional:** Resend (`resend` SDK)
- **Impresión 80mm + carta:** HTML imprimible con CSS `@page` (sin dependencia server-side). Plantillas para cotización, venta y guía de despacho.
- **PDF (cuando se requiera server-side):** `@react-pdf/renderer` o `puppeteer` (decisión postergada hasta Fase 6/7 si la impresión HTML no alcanza).
- **Excel:** `exceljs` (carga masiva + export de productos críticos).
- **Export CSV:** `csv-stringify` (para listas livianas como productos críticos).
- **Códigos de barras:** `@zxing/browser` (cámara) · lectores USB funcionan como teclado nativo · `bwip-js` para generación de etiquetas
- **Gráficos (cuando lleguen):** Recharts
- **Repo:** monorepo con `pnpm` workspaces — `apps/web` + `apps/api` + `packages/shared`

## Modelo de datos (entidades clave)

> Las entidades marcadas **(nuevo)** o **(ampliado)** se introducen en fases ≥ 4 como parte de los nuevos requerimientos del cliente. El modelo base de Fase 1 sigue siendo el de la migración inicial.

```
User (id, name, email, passwordHash, role, isActive)

Supplier (id, name, taxId, email, phone, address, notes)
   -- taxId con unicidad validada en servicio (no índice DB todavía)
Customer (id, name, taxId, email, phone,
          addressStreet, addressNumber, addressCommune,    -- (ampliado, Fase 4)
          internalNotes)
   -- taxId = RUT, con unicidad

Category (id, name, parentId)
Brand   (id, name)            -- marca del repuesto (Bosch, NGK)

VehicleMake   (id, name)              -- Toyota, Ford
VehicleModel  (id, makeId, name)      -- Corolla, Hilux
VehicleFitment (id, productId, modelId, yearFrom, yearTo)

Warehouse (id, name, address)
   -- multi-bodega activado en Fase 7.5; bodega "Mercado Libre Full" como caso

Product (id, sku, partNumber, barcode, name, description,
         categoryId, brandId, supplierId, cost, price,
         minStock, maxStock, location, isActive,
         imageUrl,                                          -- (ampliado, Fase 4B)
         productKind)                                       -- (ampliado, Fase 4B)
   -- productKind: ORIGINAL | ALTERNATIVE

ProductCode (id, productId, code, kind, isPrimary)         -- (nuevo, Fase 4B)
   -- kind: INTERNAL | UNIVERSAL | MANUFACTURER | COMPATIBLE | ALTERNATE
   -- permite múltiples códigos por producto y reasignación cuando la marca cambia el código

Stock (id, productId, warehouseId, quantity)              -- caché actual

InventoryMovement (id, productId, warehouseId, type, qty, unitCost,
                   reference, refId, userId, createdAt)
   -- type: PURCHASE_IN | SALE_OUT | ADJUSTMENT | RETURN_IN | RETURN_OUT
   --        | TRANSFER_OUT | TRANSFER_IN                   -- (ampliado, Fase 7.5)

PurchaseEntry (id, supplierId, date, subtotal, taxAmount, total,
               notes, invoiceUrl, userId)                   -- (ampliado, Fase 5+)
PurchaseEntryItem (id, entryId, productId, qty, unitCost, subtotal)

Quotation (id, number, customerId, date, validUntil, status,
           subtotal, taxAmount, total, notes, userId)        -- (ampliado, Fase 5)
   -- status: DRAFT | SENT | APPROVED | REJECTED | CONVERTED | EXPIRED
QuotationItem (id, quotationId, productId, qty, unitPrice, discount, subtotal)

Sale (id, number, customerId, warehouseId, date,             -- (ampliado, Fase 7)
      subtotal, taxAmount, commissionAmount, total,           -- (ampliado, Fase 5)
      paymentMethod, status, quotationId?, userId)
   -- paymentMethod: CASH | TRANSFER | CARD
   -- status: PENDING | PAID | CANCELLED
   -- warehouseId = bodega de la cual sale el stock (necesario para ML Full)
SaleItem (id, saleId, productId, qty, unitPrice, discount, subtotal, unitCost)
   -- unitCost congelado para reportes de rentabilidad

DispatchNote (id, saleId, number, dispatchedAt, carrier?, trackingNumber?,
              addressStreet?, addressNumber?, addressCommune?, notes?, userId)
   -- (nuevo, Fase 7.7) — guía de despacho con número correlativo (DESP-2026-00001)
   -- decisión a confirmar con cliente: si se requiere o basta con PDF derivado

WarrantyClaim (id, saleItemId, productId, customerId, status,
               openedAt, resolvedAt?, resolution?, notes?, userId)
   -- (nuevo, Fase 7.6) — NO afecta stock; es un seguimiento de garantía
   -- status: OPEN | IN_REVIEW | APPROVED | REJECTED | RESOLVED

CashTransaction (id, date, type, source, sourceId?, description,
                 amount, paymentMethod, expenseCategoryId?, isVoided,
                 userId, createdAt)
   -- type: INCOME | EXPENSE
   -- source: SALE | PURCHASE | MANUAL
ExpenseCategory (id, name)
   -- seedeadas: Arriendo, Transporte, Publicidad, Servicios, Sueldos, Otros
   -- + (Fase 5) IVA Compra, IVA Venta, Comisión Tarjeta

CompanySettings (id, name, address, phone, email, logoUrl, currency,
                 quotationFooter, defaultValidityDays,
                 taxRate,                                    -- (ampliado, Fase 5) ej. 0.19 para IVA Chile
                 cardCommissionRate,                         -- (ampliado, Fase 5) ej. 0.025
                 defaultLeadTimeDays)                        -- (ampliado, Fase 8) ej. 75 días para importación
```

**Reglas críticas de integridad:**

- El stock se calcula a partir de `InventoryMovement` (fuente de verdad). La tabla `Stock` se mantiene como caché actualizado vía transacción al insertar cada movimiento.
- La caja es una sola consolidada. Cada venta marcada como PAID inserta `CashTransaction(INCOME, source=SALE)` automáticamente. Cada `PurchaseEntry` inserta `CashTransaction(EXPENSE, source=PURCHASE)`. Los gastos manuales se insertan con `source=MANUAL`. Cancelar una venta/compra **revierte** la transacción de caja.
- `unitCost` se congela en `SaleItem` al confirmar la venta para que los reportes de rentabilidad sean históricamente correctos aunque cambie el costo del producto después.
- **Transferencias entre bodegas** (Fase 7.5): un movimiento de `TRANSFER_OUT` en la bodega origen y `TRANSFER_IN` en la destino, ambos en la misma transacción. **No** generan `CashTransaction`.
- **Garantías** (Fase 7.6): `WarrantyClaim` es puramente informativo — **no** dispara movimientos de stock. Si la garantía termina en cambio de producto se gestiona como devolución (`RETURN_IN`) + nueva salida.
- **Devoluciones** (Fase 7.6): `RETURN_IN` suma stock, `RETURN_OUT` lo resta. Decisión de qué tipo aplicar según el flujo (devolución de cliente vs. devolución a proveedor).
- **Comisión por tarjeta**: cuando una venta se cobra con `CARD`, el sistema calcula `commissionAmount = total * companySettings.cardCommissionRate` y registra en la misma transacción un `CashTransaction(EXPENSE, source=SALE, expenseCategoryId=Comisión Tarjeta)` ligado al `sale.id`.

## Estructura del repo

```
inventory-management/
├── apps/
│   ├── web/                    # Next.js
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   └── (dashboard)/
│   │   │       ├── page.tsx                # Dashboard principal
│   │   │       ├── productos/
│   │   │       ├── inventario/
│   │   │       ├── compras/
│   │   │       ├── almacenes/              # CRUD Warehouse (Fase 7.5)
│   │   │       ├── transferencias/         # transferencias entre bodegas (Fase 7.5)
│   │   │       ├── clientes/
│   │   │       ├── proveedores/
│   │   │       ├── ventas/                 # incluye cotizaciones (modal de elección)
│   │   │       ├── devoluciones/           # Fase 7.6
│   │   │       ├── garantias/              # Fase 7.6
│   │   │       ├── guias/                  # guías de despacho (Fase 7.7)
│   │   │       ├── caja/
│   │   │       ├── reportes/
│   │   │       ├── proyeccion/             # proyección de stock + críticos (Fase 8)
│   │   │       └── configuracion/
│   │   ├── components/ui/      # shadcn
│   │   ├── components/forms/
│   │   ├── components/print/   # plantillas imprimibles 80mm + carta (Fases 6/7/7.7)
│   │   ├── lib/api.ts
│   │   ├── lib/format.ts       # ✅ formatCurrency
│   │   ├── lib/use-url-filters.ts  # ✅ filtros sincronizados con URL
│   │   └── lib/auth.ts
│   └── api/                    # NestJS
│       ├── src/
│       │   ├── auth/
│       │   ├── users/
│       │   ├── products/
│       │   ├── inventory/
│       │   ├── purchases/
│       │   ├── transfers/      # transferencias entre bodegas (Fase 7.5)
│       │   ├── returns/        # devoluciones (Fase 7.6)
│       │   ├── warranties/     # garantías (Fase 7.6)
│       │   ├── dispatch/       # guías de despacho (Fase 7.7)
│       │   ├── customers/
│       │   ├── suppliers/
│       │   ├── quotations/
│       │   ├── sales/
│       │   ├── cashbox/        # Caja
│       │   ├── reports/
│       │   ├── projection/     # proyección de stock + export críticos (Fase 8)
│       │   ├── dashboard/      # KPIs agregados
│       │   ├── imports/        # carga Excel
│       │   ├── uploads/        # multer: foto producto + factura compra (Fases 4B/5)
│       │   ├── print/          # plantillas HTML 80mm + carta
│       │   ├── notifications/  # Resend (email) + wa.me (WhatsApp link builder)
│       │   ├── settings/
│       │   ├── database/
│       │   │   ├── data-source.ts          # DataSource TypeORM (CLI + runtime)
│       │   │   ├── entities/               # @Entity() classes
│       │   │   ├── migrations/             # generadas con typeorm-ts-node
│       │   │   └── seeds/
│       │   └── common/
│       │       └── fk-error.ts             # ✅ helper FK constraint → 409
│       └── uploads/                        # archivos servidos como estáticos (gitignored)
├── packages/
│   └── shared/                 # tipos DTO/Zod compartidos
├── pnpm-workspace.yaml
└── README.md
```

## Plan de implementación por fases

> Cada fase es un PR/iteración independiente. Después de cada fase verificamos juntos antes de pasar a la siguiente.

### Fase 0 — Bootstrap del monorepo ✅

1. Inicializar pnpm workspace, `apps/web` (Next.js + Tailwind + shadcn), `apps/api` (NestJS), `packages/shared`.
2. ESLint + Prettier + tsconfig base compartido.
3. ~~`docker-compose.yml` con MySQL 8 para desarrollo local.~~ → MySQL local nativo + `scripts/init-db.sql` (decisión revertida durante Fase 0; el cliente prefiere instalación nativa).
4. `.env.example` documentado.
5. README con comandos de arranque + `run.sh` con `build` / `dev` / `stop` / `db:init`.

### Fase 1 — Base de datos y auth ✅

1. Configurar TypeORM: `DataSource` (`apps/api/src/database/data-source.ts`) que se reutiliza en CLI y en `TypeOrmModule.forRootAsync` de NestJS. `synchronize: false` siempre — se trabaja con migraciones explícitas.
2. Definir todas las entidades con decoradores `@Entity()` en `database/entities/` (incluye Caja y CompanySettings). Relaciones `@OneToMany`/`@ManyToOne` con `cascade` y `onDelete` explícitos.
3. Generar migración inicial (`typeorm migration:generate`) y seed: usuario admin, 1 almacén, categorías base, categorías de gasto (arriendo, transporte, publicidad, servicios, otros), `CompanySettings` con datos placeholder.
4. Scripts npm: `db:migrate`, `db:migrate:revert`, `db:migrate:generate`, `db:seed`.
5. Módulo `auth` NestJS: `POST /auth/login`, `POST /auth/refresh`, guard JWT global, decorador `@CurrentUser()`.
6. Frontend: layout protegido, login, tokens en httpOnly cookie + refresh, interceptor axios, redirect en 401.

> Credenciales del admin seedeado: `admin@inventory.local` / `admin123` (overridable vía `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`).

### Fase 2 — Catálogo de productos + compatibilidad vehicular ✅

1. CRUD de `Category`, `Brand`, `VehicleMake`, `VehicleModel`.
2. CRUD de `Product` con búsqueda paginada por SKU/partNumber/barcode/descripción.
3. UI de producto con tabs: *Datos* / *Precios y stock* / *Compatibilidad vehicular* (multi-fila marca + modelo + año desde/hasta).
4. Búsqueda por compatibilidad: "qué tengo para Toyota Corolla 2015".
5. Buscador rápido global con debounce y atajo de teclado (Cmd/Ctrl + K).

### Fase 3 — Inventario (entradas/salidas/ajustes) ✅

1. `InventoryService.applyMovement()` — única vía para mutar stock, transaccional.
2. Endpoint de entrada directa de mercadería (proveedor + items + costos).
3. Endpoint de ajuste manual con motivo.
4. UI de movimientos con filtros (fechas, producto, tipo).
5. Vista de stock con badge **rojo** si `quantity = 0`, **amarillo** si `<= minStock`, **verde** caso contrario.

> Suppliers básico (CRUD) implementado en esta fase porque PurchaseEntry lo requiere; la pantalla de cliente/proveedor con tabs llega en Fase 4.

### Refinamientos transversales aplicados (post-Fase 3) ✅

> Bloque de mejoras aplicadas en respuesta a las primeras observaciones del cliente sobre los módulos ya entregados. **No** introduce schema nuevo — solo lógica, validaciones, UX y patrones reusables que se aprovechan en las fases siguientes.

1. **Manejo unificado de errores de FK** — helper `[apps/api/src/common/fk-error.ts](apps/api/src/common/fk-error.ts)` (`rethrowFkAsConflict`) mapea `ER_ROW_IS_REFERENCED_2` a `ConflictException` con mensaje claro. Aplicado en `categories`, `brands`, `vehicles` (makes y models), `products`, `suppliers`. Ya no se devuelve 500 al intentar borrar entidades referenciadas.
2. **Paginación opcional uniforme** — todos los listados aceptan `page`/`pageSize` y devuelven `PaginatedResult` cuando llegan. Sin esos params devuelven array completo (compatibilidad con selectores). Aplicado a: categorías, marcas, marcas y modelos de vehículo, proveedores, inventario.
3. **Búsqueda libre `q*`* habilitada en categorías, marcas, vehículos (makes/models), proveedores e inventario.
4. **Unicidad de RUT/NIT** validada en `SuppliersService` para `create` y `update` (sin índice DB todavía — la migración llega cuando se haga la fase de clientes).
5. **Frontend — utilidades transversales:**
  - `[apps/web/lib/format.ts](apps/web/lib/format.ts)` — `formatCurrency` con `Intl.NumberFormat`. Corrige el `$100000.00` → `$100.000,00`. Listo para repuntar a `es-CL`/CLP cuando se confirme país.
  - `[apps/web/lib/use-url-filters.ts](apps/web/lib/use-url-filters.ts)` — hook que sincroniza filtros con la URL (`router.replace`, sin agregar al historial). Estados compartibles vía link.
6. **Pantallas refactorizadas** para usar paginación + filtros en URL:
  - `productos`, `categorias`, `marcas`, `vehiculos`, `inventario`, `inventario/movimientos`, `proveedores`, `compras`.
7. **Productos — fixes de UX**:
  - Removido el mensaje de ayuda obsoleto en stock mínimo.
  - Selector de **año** en filtro "buscar por vehículo compatible" cambiado a `Select` (1980 → año actual + 1).
  - Selectores de año "Desde / Hasta" en compatibilidades del formulario también pasados a `Select`.
  - Validación zod de **duplicados** en compatibilidades (mismo modelo + rango = error inline).
  - Mensaje de error inline por fila cuando "Desde > Hasta".
  - Botón **Eliminar** con confirm modal en la edición de producto.
  - Botón Guardar bloqueado durante `isPending`/`isSubmitting` (sin doble envío).
8. **Movimientos** — botón "Limpiar filtros" (antes no existía).
9. **Compras** — filtro por proveedor en URL.

**Patrones a reusar en fases siguientes:**

- Toda nueva pantalla de listado debe usar `useUrlFilters`.
- Todo nuevo `remove()` que pueda violar FK debe envolverse con `rethrowFkAsConflict`.
- Toda visualización de monto debe pasar por `formatCurrency`.
- Todo nuevo listado que pueda crecer debe paginar.

### Fase 4 — Clientes y proveedores ✅

1. **Migración** ([1778120737933-CustomersAndCommunes.ts](apps/api/src/database/migrations/1778120737933-CustomersAndCommunes.ts)) que:
  - Crea tabla `communes` (catálogo) con índice único `(name, region)`.
  - Agrega `customers.addressStreet` (varchar 200), `addressNumber` (varchar 20), `communeId` (FK a `communes`, ON DELETE RESTRICT).
  - Copia el contenido de la columna vieja `customers.address` → `addressStreet` y luego dropea la columna vieja.
  - Sube `customers.taxId` a `NOT NULL` + agrega índice único `idx_customers_taxid` (con verificación previa: aborta con mensaje claro si hay clientes sin RUT o con RUT duplicado).
  - Agrega índice único `idx_suppliers_taxid` en `suppliers.taxId` (con verificación previa de duplicados).
2. **Catálogo de comunas:** las 346 comunas chilenas seedeadas idempotentemente desde [communes-cl.json](apps/api/src/database/seeds/data/communes-cl.json). Endpoint read-only `GET /communes` con filtro opcional `?region=`.
3. **Validadores compartidos** entre backend ([rut.ts](apps/api/src/common/validators/rut.ts), [phone.ts](apps/api/src/common/validators/phone.ts)) y frontend ([rut.ts](apps/web/lib/validators/rut.ts), [phone.ts](apps/web/lib/validators/phone.ts)):
  - **RUT chileno**: formato + módulo 11 + normalización canónica (`12345678-9`, sin puntos, K mayúscula). Decorador `@IsValidRut()`.
  - **Teléfono**: `libphonenumber-js` con país default Chile. Normalización a E.164 (`+56912345678`). Decorador `@IsValidPhone()`.
4. CRUD de `Customer` (módulo nuevo): listado paginado con búsqueda libre + URL filters, crear/editar con normalización al guardar, eliminar con FK error handling. RUT obligatorio y único; email/teléfono/dirección opcionales.
5. **Suppliers** refactor: validador RUT/teléfono aplicado, normalización al guardar, nuevo endpoint `GET /suppliers/:id/purchases` (paginado por fecha).
6. Detalle de **proveedor** ([proveedores/[id]/page.tsx](apps/web/app/(dashboard)/proveedores/[id]/page.tsx)) con tabs **Datos + Compras** (lista paginada de `PurchaseEntry` filtrada por proveedor).
7. **Detalle de cliente**: vista plana de Datos por ahora — las tabs *Cotizaciones* y *Ventas* llegan en Fase 6/7 cuando esos módulos existan (decisión confirmada con cliente).
8. Pantalla `/clientes` con listado + nuevo + detalle/edición + eliminar (confirm modal).
9. Componente reusable `<CommuneSelect>` (combobox con búsqueda sobre las 346 comunas, agrupadas por región).
10. Sidebar con entrada "Clientes" en sección "Operación".

> **No** se seedea cliente "Consumidor final" (decisión del cliente; el RUT obligatorio aplica también para ventas mostrador).

### Fase 4B — Catálogo extendido (productos con códigos múltiples + foto + tipo)

> Estos campos surgen del segundo bloque de requerimientos del cliente: necesita registrar múltiples códigos por producto (la marca cambia el código a veces, hay códigos universales y compatibles), foto del producto, y distinguir originales de alternativos.

1. **Migración** que agrega:
  - `products.imageUrl` (varchar 500, nullable).
  - `products.productKind` (enum `ORIGINAL | ALTERNATIVE`, default `ORIGINAL`).
  - `products.universalCode` (varchar 80, nullable, index) — código universal directo (decisión a confirmar: campo único vs. tabla múltiple).
  - Tabla `product_codes` (productId FK, code varchar 80, kind enum, isPrimary, índice `(productId, kind)`).
2. **Backend uploads:** módulo `uploads` con `multer`, storage local `apps/api/uploads/products/`, endpoint `POST /uploads/product-image` que devuelve `{ url }`. Servir como estáticos vía `ServeStaticModule`.
3. **API:** `POST /products/:id/codes`, `PATCH /products/:id/codes/:codeId`, `DELETE /products/:id/codes/:codeId`. Validar unicidad `(code, kind)` global cuando `kind=UNIVERSAL` o `MANUFACTURER`.
4. **UI del formulario de producto:**
  - Sub-form de códigos (lista dinámica con tipo + código + isPrimary).
  - Widget de upload de foto con preview.
  - Selector ORIGINAL/ALTERNATIVO.
5. **UI listado de productos:** miniatura de la foto, badge ORIGINAL/ALTERNATIVO, búsqueda extendida que también busca por `code` en `product_codes`.
6. **Decisión pendiente:** "mismo producto con mismo código" — el cliente menciona esto sin contexto suficiente. Confirmar si:
  - (a) quiere permitir duplicados de SKU (cambiar el constraint),
  - (b) quiere que distintos productos compartan un mismo `code` en `product_codes` (ej. dos refacciones equivalentes con el mismo universal), o
  - (c) quiere "fusionar" productos con mismo código en uno solo.

### Fase 5 — Caja, gastos, IVA y comisiones

1. **Migración** que agrega:
  - `sales.subtotal`, `sales.taxAmount`, `sales.commissionAmount` (todos `decimal(15,2)`).
  - `purchase_entries.subtotal`, `purchase_entries.taxAmount`.
  - `purchase_entries.invoiceUrl` (varchar 500, nullable) — adjuntar factura.
  - `company_settings.taxRate` (decimal(5,4), default `0.1900` para IVA Chile 19%).
  - `company_settings.cardCommissionRate` (decimal(5,4), default `0.0250`).
2. **Seed** de categorías de gasto adicionales: `IVA Compra`, `IVA Venta`, `Comisión Tarjeta`.
3. CRUD de `ExpenseCategory` (módulo nuevo, patrón simple igual a brands).
4. CRUD de gastos manuales (registro con fecha, categoría, monto, método de pago, descripción, comprobante adjunto opcional).
5. Vista "Libro de caja" con filtros por fecha/tipo/método/origen/categoría, total ingresos, total egresos, saldo del período.
6. **Integración automática:**
  - `PurchaseEntry` confirma → inserta `CashTransaction(EXPENSE, source=PURCHASE)` con monto = `total`. Si tiene `taxAmount`, **NO** se separa en caja (queda registrado en la compra para reportes de IVA).
  - `Sale.confirm()` (Fase 7) → inserta `CashTransaction(INCOME, source=SALE)` con `total`. Si `paymentMethod=CARD`, además inserta automáticamente `CashTransaction(EXPENSE, source=SALE, expenseCategoryId=Comisión Tarjeta)` por el monto `commissionAmount`.
7. Endpoint `GET /cashbox/balance` que devuelve saldo actual y por método de pago.
8. **Adjuntar factura en compras:** widget de upload (mismo módulo `uploads` de Fase 4B), endpoint `POST /uploads/purchase-invoice`. Listado de compras muestra ícono de descarga si tiene factura.

> **Reportes de IVA**: la suma de `sales.taxAmount` por período da el IVA débito; la suma de `purchase_entries.taxAmount` da el IVA crédito. Aprovechado en Fase 8.

### Fase 6 — Cotizaciones y envío

1. **Flujo de entrada unificado:** ruta `/ventas/nueva` (o `/operaciones/nueva`) que **abre un modal** preguntando si lo que se va a registrar es **Venta** o **Cotización**. La pantalla de cotización es la misma estructura que la de venta — solo cambia el endpoint final y los estados.
2. CRUD de `Quotation` + items con cálculo de totales en tiempo real (subtotal, IVA, total).
3. Numeración correlativa (`COT-2026-00001`) configurable desde Settings.
4. Estados: DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CONVERTED.
5. **Plantillas de impresión 80mm + carta:** HTML con CSS `@page` para tirilla térmica (80mm) y carta (A4). Selector "Imprimir" → vista previa del formato. Sin generación PDF server-side por ahora.
6. **Botón Enviar por WhatsApp:** abre `https://wa.me/<phone>?text=<mensaje>` con mensaje predefinido (cliente + número de cotización + ítems resumidos + total + link al detalle público con URL firmada). Flujo solicitado por el cliente: "cargar productos luego número y enviar".
7. **Botón Enviar por email:** envía con Resend usando plantilla HTML, marca cotización como SENT. Si se decide PDF adjunto, llega como evolución posterior — por ahora link al detalle público.
8. Acción "Convertir a venta" → crea `Sale` enlazada y mueve cotización a CONVERTED.

### Fase 7 — Ventas con caja integrada

1. CRUD de `Sale` + items, con:
  - **Selector de bodega** (`warehouseId`) — clave para la integración Mercado Libre Full (Fase 7.5). Si solo hay una bodega activa, se preselecciona.
  - Selector de método de pago (efectivo/transferencia/tarjeta).
  - Cálculo en tiempo real de subtotal, IVA, comisión tarjeta (cuando aplica), total.
2. Modal "Venta o Cotización" al iniciar (mismo flujo descrito en Fase 6 — el modal es compartido).
3. Validación de stock disponible **en la bodega seleccionada** antes de confirmar.
4. Al confirmar (status=PAID), transacción atómica vía `dataSource.transaction(async manager => { ... })`:
  - `applyMovement(SALE_OUT)` por cada ítem (recibe el `manager`, usa `warehouseId` de la venta),
  - congela `unitCost` en cada `SaleItem`,
  - inserta `CashTransaction(INCOME, source=SALE, sourceId=sale.id)` por el `total`,
  - si `paymentMethod=CARD`: inserta también `CashTransaction(EXPENSE, source=SALE, expenseCategoryId=Comisión Tarjeta)` por `commissionAmount`.
5. Cancelación: revierte movimientos de stock **y** anula las transacciones de caja (compensación con monto negativo o `isVoided=true`) — ambas si fue tarjeta.
6. **Plantillas de impresión 80mm + carta** para la nota de venta (HTML con `@page`, mismo enfoque que cotización).
7. Compras también disparan `CashTransaction(EXPENSE, source=PURCHASE)` automáticamente al guardar `PurchaseEntry` (gancho ya preparado en Fase 5).

### Fase 7.5 — Multi-bodega y Mercado Libre Full

> Esta fase habilita el flujo "saco mercadería de mi bodega y la mando a la bodega de Mercado Libre Full" como una **transferencia** (no venta). Cuando ML Full vende, el stock baja de la bodega ML, no de la mía.

1. **Migración** que extiende `InventoryMovementType` con `TRANSFER_OUT` y `TRANSFER_IN` (enum MySQL).
2. CRUD de `Warehouse` en UI (hoy solo existe el seed de "Principal"). Pantalla `/almacenes`.
3. Seed de bodega adicional: `Mercado Libre Full`.
4. **Servicio de transferencias:** `TransfersService.create({ fromWarehouseId, toWarehouseId, items, notes })` que en una transacción atómica:
  - Inserta `InventoryMovement(TRANSFER_OUT, qty=-x)` en bodega origen.
  - Inserta `InventoryMovement(TRANSFER_IN, qty=+x)` en bodega destino.
  - **No** genera `CashTransaction` — no es venta ni gasto.
5. Pantalla "Transferencias entre bodegas" con listado + nuevo + filtros por bodega/fecha.
6. Vista de stock con selector de bodega (hoy implícita la `Principal`).
7. **Decisión a confirmar con cliente:** integración real con API de Mercado Libre vs. registro manual. **Asunción del MVP: manual** — el operador registra la transferencia y la venta posterior en ML Full a mano.

### Fase 7.6 — Devoluciones y garantías

> Cubre el último bloque de requerimientos: devoluciones (suma stock) y garantías (no afectan stock).

1. **Devoluciones**:
  - Pantalla "Nueva devolución" desde una venta existente. Selecciono ítems a devolver y motivo.
  - Servicio `ReturnsService.createFromSale(saleId, items, reason)` — emite `RETURN_IN` (suma stock a la bodega original de la venta).
  - Devolución a proveedor: `RETURN_OUT` desde compra existente (caso menos frecuente, pero soportado).
  - Listado de devoluciones con filtros por venta/cliente/fecha.
2. **Garantías**:
  - **Migración** que crea tabla `warranty_claims` (entidad `WarrantyClaim`).
  - CRUD de garantías: abrir reclamo desde una `SaleItem`, status `OPEN | IN_REVIEW | APPROVED | REJECTED | RESOLVED`, fecha apertura/cierre, notas, resolución.
  - **No** dispara movimientos de inventario. Si la resolución es "cambio de producto" → operador hace la devolución + nueva salida manualmente.
  - Pantalla "Garantías" con listado, filtros por estado y cliente, detalle.

### Fase 7.7 — Guía de despacho

> Documento aparte de la nota de venta para el despacho físico.

1. **Decisión a confirmar con cliente:** entidad `DispatchNote` con número correlativo (`DESP-2026-00001`) vs. solo PDF derivado de la venta. **Asunción**: entidad ligera (permite reutilizar el patrón y mantener trazabilidad).
2. **Migración** de `dispatch_notes` (1:1 con `Sale`).
3. Generación automática al confirmar venta (o manual con botón "Generar guía").
4. Plantillas de impresión 80mm + carta. La guía muestra: cliente, dirección de entrega (puede diferir del cliente), ítems con cantidades, transportista, número de seguimiento, observaciones.
5. Pantalla `/guias` con listado y reimpresión.

### Fase 8 — Reportes y exportación

1. Stock actual valorizado (costo y precio).
2. Movimientos por período/producto/tipo/bodega.
3. Ventas por producto / cliente / período / bodega.
4. Rentabilidad por producto y categoría (usa `unitCost` congelado).
5. Proveedores y compras.
6. **Productos sin rotación** (sin movimientos de salida en N días).
7. **Rotación de inventario** y valor total inventario.
8. **Estado de resultados** (ventas, costos, gastos, utilidad).
9. **Flujo de caja** por período.
10. **Reporte de IVA**: IVA débito (suma de `sales.taxAmount`) e IVA crédito (suma de `purchase_entries.taxAmount`) por período.
11. **Proyección de stock y productos críticos** (requerimiento explícito del cliente — importan con plazo 2-3 meses):
  - Servicio que calcula por producto: **consumo promedio diario** = movimientos `SALE_OUT` de los últimos 90 días / 90.
    - **Días de cobertura** = `stock actual / consumo diario`. Si el consumo es 0, marca `∞`.
    - **Producto crítico** = días de cobertura ≤ `companySettings.defaultLeadTimeDays` (default 75). Configurable por consulta.
    - Pantalla `/proyeccion` con tabla: SKU, nombre, stock actual, consumo diario, días de cobertura, fecha estimada de quiebre.
    - **Botón "Descargar lista de críticos"** que genera un archivo CSV (vía `csv-stringify`) con SKU, nombre, stock, días de cobertura, sugerencia de pedido. Excel (`exceljs`) si el cliente prefiere `.xlsx`.
12. Exportación CSV y PDF en cada reporte.

### Fase 9 — Dashboard (iterativo)

**Iteración 9.1 — KPIs textuales y alertas (MVP del dashboard):**

- Ventas del mes, utilidad del mes, caja disponible, valor total del inventario.
- Tarjetas con códigos de color: stock crítico (rojo), bajo stock (amarillo), OK (verde).
- Lista de alertas: stock crítico, productos sin rotación 30+ días, gastos del mes vs promedio.

**Iteración 9.2 — Gráficos (después):**

- Tendencia de ventas últimos 30 días (línea, Recharts).
- Top 10 productos vendidos del mes.
- Margen promedio y productos más/menos rentables.
- Ticket promedio, crecimiento de ventas vs mes anterior.

### Fase 10 — Carga masiva Excel

1. `POST /imports/products` recibe `.xlsx` con `exceljs`.
2. Plantilla con columnas: SKU, partNumber, barcode, **universalCode**, nombre, descripción, categoría, marca, costo, precio, stockMin, stockMax, ubicación, **productKind** (ORIGINAL/ALTERNATIVE), **códigos compatibles** (separados por `;`).
3. Validación fila por fila (Zod), reporte de errores legible.
4. Plantilla descargable con encabezados e instrucciones.
5. UI con drag-and-drop, preview de primeras 10 filas, lista de errores antes de confirmar.

### Fase 11 — Códigos de barras y refinamiento de plantillas

1. **Lector USB:** input `autoFocus` + handler `Enter` — funciona out-of-the-box.
2. **Cámara:** componente con `@zxing/browser` para móviles/laptops.
3. **Generación de etiquetas:** PDF imprimible con barcode CODE128 + SKU + nombre + precio (`bwip-js`).
4. Refinar plantillas de cotización, nota de venta y guía de despacho con branding final del cliente (logo, colores, footer legal). Las plantillas funcionales 80mm + carta ya viven desde Fases 6/7/7.7 — esta fase es solo pulido.

### Fase 12 — Deploy

1. **Backend:** Railway con MySQL gestionado, env vars, migraciones automáticas.
2. **Frontend:** Vercel apuntando a `apps/web`, `NEXT_PUBLIC_API_URL`.
3. CORS, rate limiting (`@nestjs/throttler`), logs estructurados.
4. Backup automático diario de MySQL.
5. Dominio + HTTPS.
6. Configurar Resend (dominio verificado para email).

### Fase 13 — Integración HubSpot (alcance a confirmar)

> Pendiente: confirmar con el cliente qué datos sincronizar. Opciones evaluadas:
>
> - Sync de contactos (clientes ↔ HubSpot Contacts).
> - Sync de cotizaciones/ventas como Deals.
> - Solo embed de un formulario HubSpot en el sistema.
>
> Una vez confirmado, implementar con la API de HubSpot (`@hubspot/api-client`), webhook bidireccional si es necesario, y mapeo de campos en Settings.

### Fase 14 — Entregables finales

1. **Manual de uso básico** (PDF/Notion) con flujos: dar de alta producto, registrar entrada, hacer cotización, convertir a venta, registrar gasto, leer dashboard.
2. **Video explicativo** de 5–10 min navegando el sistema (Loom).
3. **Período de soporte 10–15 días** post-entrega para ajustes y bugs detectados en producción.

## Archivos críticos a crear/modificar

**Backend**

- `apps/api/src/database/data-source.ts` — DataSource TypeORM compartido por CLI y app (Fase 1). ✅
- `apps/api/src/database/entities/*.entity.ts` — entidades con decoradores `@Entity()` (Fase 1+). ✅
- `apps/api/src/database/migrations/` — migraciones SQL versionadas (Fase 1+). ✅
- `apps/api/src/common/fk-error.ts` — helper que mapea violaciones FK MySQL a `ConflictException`. Aplicado transversalmente. ✅
- `apps/api/src/inventory/inventory.service.ts` — `applyMovement(manager, ...)` transaccional, **única fuente de mutación de stock** (Fase 3). ✅
- `apps/api/src/uploads/` — módulo `multer` para foto de producto y factura de compra (Fase 4B + 5).
- `apps/api/src/transfers/transfers.service.ts` — transferencias entre bodegas (Fase 7.5).
- `apps/api/src/cashbox/cashbox.service.ts` — `recordTransaction(manager, ...)` y `voidTransaction(manager, ...)`, **única fuente de mutación de caja** (Fase 5).
- `apps/api/src/sales/sales.service.ts` — `confirm()` envuelve todo en `dataSource.transaction()`: movimientos de stock + transacciones de caja (incluida comisión tarjeta) atómicos (Fase 7).
- `apps/api/src/returns/returns.service.ts` — flujo de devoluciones (Fase 7.6).
- `apps/api/src/warranties/` — CRUD de `WarrantyClaim` (Fase 7.6).
- `apps/api/src/dispatch/` — `DispatchNote` con número correlativo (Fase 7.7).
- `apps/api/src/notifications/whatsapp.util.ts` — builder de URLs `wa.me` con encoding correcto (Fase 6).
- `apps/api/src/notifications/email.service.ts` — wrapper sobre Resend con plantillas (Fase 6).
- `apps/api/src/projection/projection.service.ts` — proyección de stock + lista de críticos + export CSV (Fase 8).
- `apps/api/src/imports/products-import.service.ts` — parser Excel + validación (Fase 10).
- `apps/api/src/dashboard/dashboard.service.ts` — agregaciones SQL para KPIs (Fase 9).
- `apps/api/src/print/templates/` — plantillas HTML 80mm + carta para cotización, nota de venta y guía de despacho (Fases 6, 7, 7.7). El `pdf/` original solo se usa si se decide PDF server-side.

**Frontend**

- `apps/web/lib/api.ts` — cliente HTTP con interceptor JWT y refresh (Fase 1). ✅
- `apps/web/lib/format.ts` — `formatCurrency` con `Intl.NumberFormat` (refinamientos post-Fase 3). ✅
- `apps/web/lib/use-url-filters.ts` — filtros sincronizados con URL (refinamientos post-Fase 3). ✅
- `apps/web/components/forms/product-form.tsx` — sub-form de compatibilidad + códigos múltiples + foto + ORIGINAL/ALT (Fase 2 ✅ + ampliación Fase 4B).
- `apps/web/components/forms/customer-form.tsx` — RUT + dirección desglosada (Fase 4).
- `apps/web/components/forms/sale-quotation-form.tsx` — formulario unificado venta/cotización con modal de selección (Fases 6 + 7).
- `apps/web/components/print/` — vistas imprimibles 80mm + carta (Fases 6, 7, 7.7).
- `apps/web/app/(dashboard)/page.tsx` — dashboard principal (Fase 9).
- `packages/shared/src/dtos/` — Zod schemas reutilizables.

## Verificación end-to-end

Al cierre de cada fase:

- **Fase 1:** login con admin seedeado, refresh funciona, página protegida redirige si no hay sesión.
- **Fase 2:** crear producto con 3 vehículos compatibles, búsqueda por modelo lo encuentra.
- **Fase 3:** entrada de 100 unidades + ajuste de -5, stock final correcto, semáforo cambia color al cruzar `minStock`.
- **Refinamientos post-Fase 3:** intentar borrar categoría con productos asociados devuelve 409 con mensaje claro (no 500). Filtros aplicados se mantienen al recargar la página. Productos muestran `$100.000,00` (no `$100000.00`). Botón Guardar bloqueado durante submit.
- **Fase 4:** cliente con RUT chileno valida formato y dígito verificador; teléfono internacional valida; notas internas se guardan; intentar duplicar RUT devuelve 409.
- **Fase 4B:** producto con 3 códigos (interno + universal + 2 compatibles); foto subida y visible en miniatura; búsqueda por código universal lo encuentra.
- **Fase 5:** registrar gasto manual de arriendo, aparece en libro de caja, saldo se actualiza. Compra con factura adjunta se descarga desde el listado. Reporte de IVA muestra crédito esperado.
- **Fase 6:** modal "venta o cotización" aparece; crear cotización, click en imprimir muestra previsualización 80mm y carta; click en WhatsApp abre `wa.me` con mensaje correcto; click en email envía con Resend (revisar inbox).
- **Fase 7:** confirmar venta efectivo → stock baja **de la bodega seleccionada**, caja sube, libro de caja muestra ingreso. Confirmar venta tarjeta → caja sube por total y baja por comisión. Cancelar venta → stock vuelve, caja se compensa. Compra → caja baja.
- **Fase 7.5:** crear bodega "Mercado Libre", transferir 10 unidades desde "Principal" → stock baja en Principal y sube en ML; movimiento aparece en `/inventario/movimientos` con tipo `TRANSFER`. Vender un producto eligiendo bodega ML → solo baja stock de ML.
- **Fase 7.6:** desde una venta abrir devolución de 1 ítem → `RETURN_IN` se registra y stock sube. Abrir reclamo de garantía → aparece en listado, no toca stock; cambiar status a RESOLVED se persiste.
- **Fase 7.7:** generar guía de despacho de una venta → número correlativo asignado; impresión 80mm y carta abren la vista correcta.
- **Fase 8:** cada reporte exporta CSV y PDF abribles. Estado de resultados cuadra contra movimientos. **Pantalla "Proyección"** muestra productos críticos correctamente y la descarga CSV se abre en Excel con datos coherentes.
- **Fase 9:** dashboard muestra valores coherentes con los reportes; alertas semáforo cambian al producir condiciones.
- **Fase 10:** subir Excel de 50 productos con códigos múltiples y `productKind`, ver preview, confirmar; Excel con errores muestra fila/motivo.
- **Fase 11:** lector USB y cámara identifican producto; etiqueta imprime con barcode legible.
- **Fase 12:** producción accesible vía dominio, login funciona, datos persisten tras redeploy, email de Resend llega desde dominio verificado.
- **Fase 13:** (al confirmar alcance) cliente creado en sistema aparece en HubSpot.
- **Fase 14:** manual cubre todos los flujos clave; video reproducible; soporte activo durante el período acordado.

## Decisiones pendientes con el cliente

> Confirmar antes de iniciar las fases correspondientes. Cada decisión bloquea o influye una migración o un flujo concreto.


| #   | Pregunta                                                                                                                                                         | Fase impactada | Estado                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | ¿Separar `customers.address` en calle / número / comuna o dejar texto libre?                                                                                     | 4              | ✅ Confirmado: **3 columnas separadas**, las 3 opcionales.                                                                |
| 2   | "Mismo producto con mismo código" (frase del cliente) — ¿permitir duplicados de SKU? ¿códigos compartidos entre productos? ¿fusionar productos con mismo código? | 4B             | Pendiente. Asunción: `sku` se mantiene único; `product_codes` permite que distintos productos compartan el mismo `code`. |
| 3   | Comisión por tarjeta: ¿% fijo, por método (débito vs crédito), por venta individual?                                                                             | 5 / 7          | Pendiente. Asunción: `cardCommissionRate` único en `CompanySettings`.                                                    |
| 4   | Tasa de IVA: ¿19% Chile fijo o configurable?                                                                                                                     | 5              | Pendiente. Asunción: configurable, default `0.19`.                                                                       |
| 5   | Mercado Libre: ¿integración real con API ML o registro manual?                                                                                                   | 7.5            | Pendiente. Asunción: manual.                                                                                             |
| 6   | Almacenamiento de archivos: ¿disco local, S3, Cloudinary?                                                                                                        | 4B / 5         | Pendiente. Asunción: disco local en `apps/api/uploads/`.                                                                 |
| 7   | Guía de despacho: ¿numeración propia? ¿requisitos legales SII?                                                                                                   | 7.7            | Pendiente. Asunción: entidad `DispatchNote` con correlativo, sin emisión SII.                                            |
| 8   | Impresión 80mm: ¿impresora térmica POS o vista web?                                                                                                              | 6 / 7 / 7.7    | Pendiente. Asunción: HTML con `@page` 80mm.                                                                              |
| 9   | Validación de RUT chileno: ¿formato + DV estricto, o solo formato?                                                                                               | 4              | ✅ Confirmado: **formato + dígito verificador + normalización**.                                                          |
| 10  | Cotización por WhatsApp: "el número" — ¿del cliente o correlativo de la cot?                                                                                     | 6              | Pendiente. Asunción: correlativo asignado al guardar; botón pre-arma mensaje al teléfono del cliente.                    |
| 11  | Validación de teléfono en clientes/proveedores                                                                                                                   | 4              | ✅ Confirmado: `**libphonenumber-js` + E.164**.                                                                           |
| 12  | Comuna: ¿texto libre o catálogo?                                                                                                                                 | 4              | ✅ Confirmado: **catálogo de 346 comunas chilenas** (FK a `communes`).                                                    |
| 13  | Email del cliente: ¿obligatorio? ¿único?                                                                                                                         | 4              | ✅ Confirmado: **opcional, puede repetirse**.                                                                             |
| 14  | RUT cliente: ¿obligatorio?                                                                                                                                       | 4              | ✅ Confirmado: **obligatorio + único** (índice DB).                                                                       |
| 15  | Cliente "Consumidor final" seedeado                                                                                                                              | 4              | ✅ Confirmado: **no se seedea**.                                                                                          |
| 16  | Validación de RUT en proveedores                                                                                                                                 | 4              | ✅ Confirmado: **mismas reglas que clientes** (formato + DV).                                                             |
| 17  | Unicidad de NIT/RUC de proveedores a nivel DB                                                                                                                    | 4              | ✅ Confirmado: **índice único en DB** (no solo servicio).                                                                 |
| 18  | Tabs del detalle de cliente                                                                                                                                      | 4              | ✅ Confirmado: **solo Datos por ahora**. Cotizaciones/Ventas se agregan en sus fases.                                     |
| 19  | Detalle de proveedor con historial de compras                                                                                                                    | 4              | ✅ Confirmado: **sí**, tabs Datos + Compras.                                                                              |
| 20  | "Clientes" en sidebar                                                                                                                                            | 4              | ✅ Confirmado: sección **Operación**.                                                                                     |
| 21  | Notas internas de cliente — ¿aparecen en docs?                                                                                                                   | 4              | ✅ Confirmado: **no**, solo dentro del sistema.                                                                           |


## Suposiciones tomadas (avísame si alguna no aplica)

1. Moneda configurable en settings, default **CLP** con formato `es-CL` (`$1.234`). `formatCurrency` está parametrizado.
2. Datos de empresa (nombre, dirección, logo, contacto, footer de cotización, días de validez por defecto, tasa IVA, comisión tarjeta, lead time de importación) editables desde pantalla **Configuración** (creada en Fase 1, refinada en Fase 5).
3. Idioma de interfaz: español. Sin i18n en MVP.
4. Sin manejo de cuenta corriente / pagos parciales en MVP — la venta es PAID o PENDING binario; los anticipos quedan fuera del MVP.
5. Sin lotes ni números de serie por producto en MVP.
6. **Email** se envía desde un dominio verificado en Resend (debes proveer un dominio o usaremos un subdominio del proyecto); plan gratuito de Resend cubre 3.000 emails/mes.
7. **WhatsApp** vía `wa.me`: abre WhatsApp Web/app del operador con mensaje + link al detalle público prellenados; el operador hace click en "enviar". No usa la API oficial (sin costo, sin verificación Meta).
8. **Detalles públicos** de cotización accesibles vía URL firmada con expiración (ej. 30 días) para que el cliente final pueda abrir el link sin login. El detalle es HTML imprimible; un PDF descargable es evolución posterior.
9. **HubSpot** queda como Fase 13 con alcance a definir; el resto del sistema funciona sin esa integración.
10. **Dashboard iterativo:** la versión 9.1 (KPIs+alertas textuales) es funcional desde Fase 9; los gráficos llegan en 9.2 sin bloquear la entrega del MVP.
11. **Multi-bodega** se activa en Fase 7.5; antes de eso todas las operaciones implícitamente usan la bodega `Principal`.
12. **Garantías no afectan stock**: si la resolución termina en cambio de producto, el operador hace una devolución (`RETURN_IN`) + nueva venta o salida manualmente.
13. **Proyección de stock** usa los últimos 90 días de `SALE_OUT` para calcular consumo promedio. Si el cliente quiere otro rango (ej. 180 días para mitigar estacionalidad), se vuelve configurable.
14. **Mercado Libre Full** se gestiona con flujo manual: transferencia de mi bodega a la bodega ML y luego venta desde la bodega ML. Si más adelante el cliente quiere sincronización automática, se evalúa como integración aparte.
15. **Impresión 80mm + carta** vía HTML con CSS `@page`, sin generar PDF en el servidor en el MVP. Si el cliente final reporta problemas con la impresión desde el navegador, se evalúa pasar a `puppeteer` o `@react-pdf/renderer`.

