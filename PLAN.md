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
| Envío cotizaciones         | WhatsApp vía `wa.me` + Email vía **Resend**. Botón directo desde la cotización. WhatsApp es el canal primario de contacto comercial — Fase 8.5 lo formaliza como identificador del lead.                  |
| Dashboard                  | Iterativo: KPIs textuales y alertas primero, gráficos en fase posterior. **KPIs clicables** desde Fase 9 (cada card linkea al detalle). Incluye granularidad de día además de mes.                        |
| HubSpot                    | **Sync bidireccional, sistema como fuente de verdad**. El sistema empuja a HubSpot vía API (`@hubspot/api-client`). Identificador primario: WhatsApp (E.164). Lifecycle automático: `NEW` al crear, `QUOTED` al enviar cotización, `FOLLOW_UP` si pasan N horas sin respuesta (configurable), `WON` al confirmar venta, `LOST` manual. Implementación en Fase 8.5. Refinamientos posteriores (webhook inverso, embeds de marketing) en Fase 13. |
| Seguimiento comercial      | Bandeja `/seguimiento` con tabs **Pendientes** / **Sin respuesta** / **Vencidos** / **Último contacto**. Botones rápidos para abrir WhatsApp y continuar conversación. Lifecycle del lead se calcula automáticamente desde eventos del sistema (crear cotización, enviar, confirmar venta) + cron diario para `FOLLOW_UP` por timeout. Fase 8.5. |
| Responsive móvil           | La operación comercial frecuente se hace desde teléfono (seguimiento, ver stock crítico, registrar venta mostrador). Sidebar pasa a drawer (`<Sheet>` de shadcn) en `<md`, tablas grandes usan scroll horizontal con primera columna sticky o vista de cards. **Ronda 4** transversal cierra brechas antes de Fase 9 (dashboard mobile-first). |
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
          internalNotes,
          source,                                          -- (ampliado, Fase 8.5)
          whatsappPhone,                                   -- (ampliado, Fase 8.5)
          lifecycleStatus,                                 -- (ampliado, Fase 8.5)
          lastContactAt,                                   -- (ampliado, Fase 8.5)
          nextFollowUpAt,                                  -- (ampliado, Fase 8.5)
          lostReason,                                      -- (ampliado, Fase 8.5)
          hubspotContactId)                                -- (ampliado, Fase 8.5)
   -- taxId = RUT, con unicidad
   -- source: WHATSAPP | EMAIL | PHONE | IN_PERSON | OTHER
   -- whatsappPhone: E.164 indexado, usable como upsert key contra HubSpot
   -- lifecycleStatus: NEW | QUOTED | FOLLOW_UP | WON | LOST (Fase 8.5)
   -- hubspotContactId: id del contacto en HubSpot, null si nunca se sincronizó

LeadEvent (id, customerId, type, refType?, refId?, occurredAt, userId?)   -- (nuevo, Fase 8.5)
   -- Bitácora de eventos comerciales que mueven el lifecycle.
   -- type: QUOTATION_CREATED | QUOTATION_SENT | SALE_CONFIRMED | LOST_MARKED
   --        | FOLLOW_UP_TRIGGERED | MANUAL_CONTACT
   -- refType+refId apuntan al documento que disparó el evento (cotización, venta, etc.)

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
                 defaultLeadTimeDays,                        -- (ampliado, Fase 8) ej. 75 días para importación
                 followUpHoursDefault,                       -- (ampliado, Fase 8.5) ej. 48 horas
                 hubspotEnabled,                             -- (ampliado, Fase 8.5) on/off del sync
                 hubspotDefaultOwnerId)                      -- (ampliado, Fase 8.5) owner asignado a leads nuevos en HubSpot
   -- HUBSPOT_API_KEY vive en .env, NUNCA en DB
```

**Reglas críticas de integridad:**

- El stock se calcula a partir de `InventoryMovement` (fuente de verdad). La tabla `Stock` se mantiene como caché actualizado vía transacción al insertar cada movimiento.
- La caja es una sola consolidada. Cada venta marcada como PAID inserta `CashTransaction(INCOME, source=SALE)` automáticamente. Cada `PurchaseEntry` inserta `CashTransaction(EXPENSE, source=PURCHASE)`. Los gastos manuales se insertan con `source=MANUAL`. Cancelar una venta/compra **revierte** la transacción de caja.
- `unitCost` se congela en `SaleItem` al confirmar la venta para que los reportes de rentabilidad sean históricamente correctos aunque cambie el costo del producto después.
- **Transferencias entre bodegas** (Fase 7.5): un movimiento de `TRANSFER_OUT` en la bodega origen y `TRANSFER_IN` en la destino, ambos en la misma transacción. **No** generan `CashTransaction`.
- **Garantías** (Fase 7.6): `WarrantyClaim` es puramente informativo — **no** dispara movimientos de stock. Si la garantía termina en cambio de producto se gestiona como devolución (`RETURN_IN`) + nueva salida.
- **Devoluciones** (Fase 7.6): `RETURN_IN` suma stock, `RETURN_OUT` lo resta. Decisión de qué tipo aplicar según el flujo (devolución de cliente vs. devolución a proveedor).
- **Comisión por tarjeta**: cuando una venta se cobra con `CARD`, el sistema calcula `commissionAmount = total * companySettings.cardCommissionRate` y registra en la misma transacción un `CashTransaction(EXPENSE, source=SALE, expenseCategoryId=Comisión Tarjeta)` ligado al `sale.id`.
- **Lifecycle del lead** (Fase 8.5): los estados se calculan a partir de eventos del sistema, NO se setean manualmente (excepto `LOST`).
  - Crear cotización → `lifecycleStatus = QUOTED`, `lastContactAt = NOW()`, `nextFollowUpAt = NOW() + followUpHoursDefault`. Inserta `LeadEvent(QUOTATION_CREATED)`.
  - Confirmar venta → `lifecycleStatus = WON`. Inserta `LeadEvent(SALE_CONFIRMED)`. El cliente queda fuera de la bandeja de seguimiento.
  - Cron diario (00:30 hora local): detecta clientes con `nextFollowUpAt < NOW()` y `lifecycleStatus IN (QUOTED, FOLLOW_UP)` → si no hay venta confirmada desde el último contacto, marca `FOLLOW_UP` y dispara push a HubSpot. Inserta `LeadEvent(FOLLOW_UP_TRIGGERED)`.
  - Botón manual "Marcar como perdido" → `lifecycleStatus = LOST` + `lostReason`. Inserta `LeadEvent(LOST_MARKED)`.
- **HubSpot push** (Fase 8.5): cada cambio de `lifecycleStatus` o `lastContactAt` encola un job que llama a `PATCH /crm/v3/objects/contacts/<id>` con la propiedad `lifecyclestage` mapeada. Si el contacto no existe (upsert por `whatsappPhone` o `email`), crea el contact y guarda `hubspotContactId`. Idempotente — un retry no duplica.

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
│   │   │       ├── seguimiento/            # bandeja comercial (Fase 8.5)
│   │   │       ├── caja/
│   │   │       ├── reportes/
│   │   │       ├── proyeccion/             # proyección de stock + críticos (Fase 8)
│   │   │       └── configuracion/
│   │   ├── components/ui/      # shadcn
│   │   ├── components/forms/
│   │   ├── components/print/   # plantillas imprimibles 80mm + carta (Fases 6/7/7.7)
│   │   ├── components/mobile-nav.tsx  # drawer responsive (Ronda 4)
│   │   ├── lib/api.ts
│   │   ├── lib/format.ts       # ✅ formatCurrency
│   │   ├── lib/use-url-filters.ts  # ✅ filtros sincronizados con URL
│   │   ├── lib/whatsapp.ts     # builder de URLs wa.me reusado en /seguimiento (Fase 8.5)
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
│       │   ├── lifecycle/      # estados del lead + cron de follow-up (Fase 8.5)
│       │   ├── hubspot/        # cliente API HubSpot + queue + mapping (Fase 8.5)
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

### Fase 4B — Catálogo extendido (códigos múltiples + galería + tipo) ✅

> Surge del segundo bloque de requerimientos del cliente: registrar el código universal del producto + códigos compatibles, galería de fotos, y distinguir originales vs alternativos.

1. **Migración** [`1778122896484-ProductCatalogExtended.ts`](apps/api/src/database/migrations/1778122896484-ProductCatalogExtended.ts) que:
  - Agrega `products.universalCode` (varchar 80, nullable, indexado pero **NO único** — productos equivalentes pueden compartir universal).
  - Agrega `products.productKind` (enum `ORIGINAL | ALTERNATIVE`, NOT NULL, default `ORIGINAL`).
  - Crea tabla `product_images` (id, productId FK CASCADE, url, isCover, position, createdAt) — galería ordenada con flag de portada.
  - Crea tabla `product_codes` (id, productId FK CASCADE, code varchar 80, kind enum) — por ahora solo `kind=COMPATIBLE`. El enum queda extensible sin cambiar schema.
2. **No** agrega columna `products.imageUrl`: la portada se calcula on-the-fly desde `product_images.isCover = TRUE`. Evita duplicar el dato.
3. **Módulo uploads** ([apps/api/src/uploads/upload-config.ts](apps/api/src/uploads/upload-config.ts)) con `multer` + `ServeStaticModule`. Storage local en `apps/api/uploads/products/`. Servidor estático bajo `/api/uploads/*` (mismo prefix que la API). Validaciones: whitelist MIME (`image/jpeg`, `image/png`, `image/webp`), tamaño máximo 10 MB, renombrado automático a `<uuid>.<ext>` para evitar path traversal. Convenciones transversales en [README → Subida de archivos](README.md#subida-de-archivos-uploads).
4. **Endpoints nuevos**:
  - `GET /api/products/:id/images` — listar imágenes del producto.
  - `POST /api/products/:id/images` (multipart, campo `file`) — subir una imagen. La primera del producto se marca cover automáticamente.
  - `PATCH /api/products/:id/images/:imageId/cover` — marcar como portada (desmarca las demás en una transacción).
  - `DELETE /api/products/:id/images/:imageId` — borra registro **y** archivo físico. Si era cover, promueve la siguiente imagen.
  - `PUT /api/products/:id/codes` — reemplaza la lista completa de códigos compatibles (estrategia replace, mismo patrón que fitments).
5. **`ProductsService` extendido**:
  - `getOne()` devuelve también `images`, `compatibleCodes`, `coverUrl`.
  - `list()` y `quickSearch()` adjuntan `coverUrl` por batch (sin N+1) y soportan filtro `productKind`.
  - **Búsqueda libre extendida**: ahora matchea contra `sku`, `partNumber`, `barcode`, `name`, `universalCode` y `product_codes.code` (subquery EXISTS).
  - `remove()` borra archivos físicos del disco después de que la transacción de borrado del producto se commitea.
6. **Frontend**:
  - `ProductDto` ampliado: `universalCode`, `productKind`, `images`, `compatibleCodes`, `coverUrl`.
  - `lib/catalog-api.ts`: helpers `uploadProductImage`, `setProductImageCover`, `deleteProductImage`, `replaceProductCompatibleCodes`, `publicImageUrl()`.
  - `<ProductImageGallery>` ([apps/web/components/product-image-gallery.tsx](apps/web/components/product-image-gallery.tsx)) con drag-drop, preview, marcar portada, eliminar.
  - `<ProductForm>` con 5 tabs: *Datos / Precios y stock / Compatibilidad / **Códigos** / **Imágenes***. Incluye campos `universalCode` y `productKind` en *Datos*. En modo "nuevo" usa `<PendingImagesUploader>` que acumula los `File` en memoria; al hacer "Crear" sigue el [patrón "crear → subir asociado"](README.md#patrón-crear--subir-asociado).
  - Lista de productos: columna nueva con miniatura **40×40** de la cover, filtro ORIGINAL/ALTERNATIVO en URL, badge de tipo en cada fila.
7. **`.gitignore`**: `apps/api/uploads/` ignorado (con `.gitkeep` para preservar el dir).

> **Decisiones del wizard** (todas confirmadas): galería de fotos, solo `COMPATIBLE` en `product_codes`, `universalCode` como columna directa, default `ORIGINAL`, JPG/PNG/WEBP, 10 MB máximo, sin límite de cantidad, tab nueva "Códigos", patrón "crear → subir", miniatura 40×40, filtro de tipo, búsqueda extendida.

### Fase 5 — Caja, gastos, IVA y comisiones ✅

1. **Migración** [`1778230000000-CashboxAndTaxes.ts`](apps/api/src/database/migrations/1778230000000-CashboxAndTaxes.ts) que:
  - Agrega `expense_categories.isSystem` (BOOL DEFAULT 0).
  - Agrega `sales.subtotal`, `sales.taxAmount`, `sales.commissionAmount` (todos `decimal(15,2)`, default 0; se llenan en Fase 7).
  - Agrega `purchase_entries.subtotal`, `purchase_entries.taxAmount`, `purchase_entries.invoiceUrl`.
  - Agrega `company_settings.taxRate` (`decimal(5,4)` default `0.1900`).
  - Agrega `company_settings.cardCommissionRate` (`decimal(5,4)` default `0.0250`).
  - Crea tabla `expenses` (gastos manuales con número correlativo + anulación).
  - Crea tabla `counters` (contadores correlativos por `(kind, year)`, atomic con row lock).
  - **Backfill** de IVA en compras existentes: `subtotal = total/1.19`, `taxAmount = total - subtotal` (asume 19%, idempotente: solo aplica donde subtotal=0 y taxAmount=0).
  - **Backfill** idempotente de `cash_transactions` para cada `purchase_entry` que aún no tenga su transacción (clave: `WHERE NOT EXISTS …` por `sourceId`).
2. **Seed** ([run-seeds.ts](apps/api/src/database/seeds/run-seeds.ts)) actualizado: agrega `IVA Compra`, `IVA Venta`, `Comisión Tarjeta` con `isSystem=true`. CompanySettings nuevo arranca con `currency=CLP`, `taxRate=0.1900`, `cardCommissionRate=0.0250`.
3. **CRUD de `ExpenseCategory`** ([apps/api/src/expense-categories/](apps/api/src/expense-categories/)) con flag `isSystem` que protege las 3 categorías reservadas: no se pueden modificar ni borrar desde la UI.
4. **CRUD de gastos manuales** ([apps/api/src/expenses/](apps/api/src/expenses/)):
  - `POST /expenses` crea el gasto + transacción de caja (`source=MANUAL, type=EXPENSE`) en transacción atómica. Asigna `number = GAS-AAAA-NNNNN` vía `CountersService`.
  - `PATCH /expenses/:id` permite editar **solo** si el gasto pertenece al mes actual; reescribe la `cash_transaction` vinculada en la misma transacción.
  - `POST /expenses/:id/void` marca `voidedAt` + crea transacción compensatoria (INCOME) que cancela la original.
  - Comprobante adjunto opcional vía `POST /uploads/expense-receipt`.
5. **Vista "Libro de caja"** ([/caja](apps/web/app/(dashboard)/caja/page.tsx)) con filtros por fecha/tipo/método/origen/categoría/anuladas + 4 cards de saldo (total + por método CASH/TRANSFER/CARD).
6. **Integración automática:**
  - **Compras** (`PurchaseesService.create`) ahora calcula `subtotal/taxAmount` desde `companySettings.taxRate` (con override) e inserta `CashTransaction(EXPENSE, source=PURCHASE)` por el `total` bruto en la misma transacción atómica. Default `paymentMethod=TRANSFER` (configurable más adelante).
  - **Ventas** (Fase 7): el patrón de integración queda preparado vía `CashboxService.recordTransaction(input, manager?)` y `voidTransaction(id, userId, manager?)`.
7. **Endpoint `GET /cashbox/balance`** que devuelve saldo total + saldo por método + ingresos/egresos acumulados.
8. **Adjuntar factura en compras:** widget en `/compras/nuevo` (mismo whitelist PDF + JPG/PNG/WEBP de uploads de Fase 4B). Endpoint `POST /uploads/purchase-invoice`. Listado de compras muestra ícono de paperclip si tiene factura.
9. **Pantalla Configuración** ([/configuracion](apps/web/app/(dashboard)/configuracion/page.tsx)): edita `taxRate` y `cardCommissionRate` como porcentajes humanos. Link a `/configuracion/categorias-gasto`.

> **Reportes de IVA** (Fase 8): la suma de `sales.taxAmount` por período da el IVA débito; la suma de `purchase_entries.taxAmount` da el IVA crédito. Las columnas ya están listas desde Fase 5.

> **Decisiones de Fase 5 confirmadas con cliente** (ver tabla "Decisiones pendientes" más abajo): IVA configurable; precios brutos; comisión tarjeta única (default 2.5%); cancelación de compras pospuesta a Fase 7; mismos métodos de pago en gastos y ventas; categorías editables con flag `isSystem`; correlativo `GAS-AAAA-NNNNN`; adjuntos PDF + imágenes 10 MB; sin saldo apertura dedicado; edición libre de gastos del mes actual; backfill automático de compras al subir Fase 5; IVA auto-calculado con override.

### Fase 6 — Cotizaciones y envío

> **Decisiones confirmadas con cliente** (mayo 2026): cliente libre permitido (sin guardarse en catálogo) vía `customerId` nullable + columnas snapshot; estado inicial DRAFT con botones separados "Guardar borrador" y "Enviar"; PDF generado server-side con **jsPDF + jsPDF-autotable** y adjuntado al email; WhatsApp vía `wa.me` con link al PDF público (Cloud API de Meta queda como evolución futura); `defaultValidityDays = 15` y cron diario para auto-expirar; sin reserva de stock al cotizar; cotización editable libremente hasta CONVERTED; "Convertir a venta" abre `/ventas/nueva` con form prellenado (Fase 7); link público con token firmado válido = vigencia (`validUntil`); formato Carta default + selector "Imprimir 80mm"; descuentos por línea en monto o %, sin descuento global; mensaje WhatsApp = saludo + número cot + total + link; email HTML simple branded + PDF adjunto; Resend en modo dev (`onboarding@resend.dev`) en MVP, dominio real en Fase 12; modal "Venta o Cotización" con opción "Venta" deshabilitada hasta Fase 7; sidebar → sección "Operación" → "Cotizaciones"; APPROVED/REJECTED se disparan con botones manuales en el detalle; columnas del PDF: Código + Descripción + Cant + P.Unit + Desc + Subtotal.

1. **Flujo de entrada unificado:** ruta `/cotizaciones/nueva` (o `/ventas/nueva` que en Fase 6 redirige al form de cotización). El **modal "Venta o Cotización"** se introduce en esta fase con la opción "Venta" deshabilitada (badge "Próximamente"). En Fase 7 solo se habilita.
2. CRUD de `Quotation` + items con cálculo de totales en tiempo real (subtotal neto, IVA, total bruto). Descuentos por ítem (monto o %). Stock NO se reserva.
3. **Cliente libre vs catálogo**: el form permite elegir un `Customer` del catálogo o llenar datos a mano (nombre + teléfono + email + RUT, todos opcionales en libre). Backend: `customerId` pasa a NULLABLE + columnas snapshot `customerNameSnapshot`, `customerPhoneSnapshot`, `customerEmailSnapshot`, `customerTaxIdSnapshot`.
4. Numeración correlativa (`COT-AAAA-NNNNN`) generada vía `CountersService.nextNumber('QUOTATION', year)` (mismo patrón que gastos en Fase 5).
5. Estados: `DRAFT` → `SENT` (al enviar por email/WhatsApp) → `APPROVED` / `REJECTED` (botones manuales en el detalle) → `CONVERTED` (al convertir a venta) o `EXPIRED` (cron diario cuando `validUntil < hoy` y status ∈ {SENT, APPROVED}).
6. **Vigencia y expiración**: `validUntil = date + companySettings.defaultValidityDays` (default 15). Cron diario marca como EXPIRED las que ya pasaron. Editable libremente hasta CONVERTED.
7. **Generación de PDF server-side** con `jspdf` + `jspdf-autotable`. Formato **Carta** default, selector secundario para **80mm**. Plantilla con: logo de empresa, datos cliente (catálogo o snapshot), tabla de ítems (Código + Descripción + Cant + P.Unit + Desc + Subtotal), totales (subtotal/IVA/total), footer configurable (`companySettings.quotationFooter`).
8. **Endpoint público** `GET /public/quotations/:token` (sin auth): devuelve detalle de la cotización + acceso al PDF descargable. Token firmado con expiración = `validUntil`. Si expira, devuelve 410 Gone con mensaje claro.
9. **Botón Enviar por WhatsApp:** abre `https://wa.me/<phone>?text=<mensaje>` donde el mensaje es: «Hola {nombre}, te envío la cotización {número} por un total de {total}. La podés ver y descargar acá: {link público}». Marca como SENT.
10. **Botón Enviar por email:** envía con Resend (HTML branded simple con logo + datos + link + PDF adjunto). En desarrollo usa `cotizaciones@onresend.dev`; en Fase 12 se pasa al dominio real verificado del cliente. Marca como SENT.
11. **Acción "Convertir a venta"** → en Fase 6 abre `/ventas/nueva?fromQuotation=<id>` que en Fase 7 prellena el form de venta. La cotización solo pasa a CONVERTED cuando la venta se confirma (Fase 7).
12. Pantallas: `/cotizaciones` (listado), `/cotizaciones/nueva`, `/cotizaciones/[id]` (detalle + acciones), `/cotizaciones/[id]/imprimir` (vista imprimible Carta/80mm), `/p/cotizacion/[token]` (público sin auth).

### Fase 7 — Ventas con caja integrada ✅

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

### Fase 7.5 — Multi-bodega y Mercado Libre Full ✅

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
7. **Código de ubicación por bodega** (requerimiento agregado en Fase 7): migración que agrega `Stock.locationCode` (varchar 30, nullable). Cada producto puede tener una ubicación física distinta en cada bodega (pasillo/estante/posición). Editable inline desde `/inventario` con la bodega seleccionada. Búsqueda por código de ubicación. Reemplaza al campo global `Product.location` — durante esta fase se migran los valores existentes del campo viejo al nuevo y se deja el viejo como deprecated.
8. **Decisión a confirmar con cliente:** integración real con API de Mercado Libre vs. registro manual. **Asunción del MVP: manual** — el operador registra la transferencia y la venta posterior en ML Full a mano.

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

### Fase 8.5 — Lead lifecycle + Seguimiento comercial + HubSpot

> Formaliza el flujo comercial real del cliente: la mayoría de las ventas arrancan por WhatsApp y necesitan seguimiento. El sistema lleva la **fuente de verdad** del estado del lead y empuja cambios a HubSpot automáticamente. La operación diaria de seguimiento vive en una bandeja dedicada con botones rápidos de WhatsApp.
>
> Bloquea: Fase 9 (el dashboard depende del concepto de "lead" y "pendientes de seguimiento").

**1. Schema — extensión de `Customer` + entidad nueva `LeadEvent`**

- **Migración** que agrega a `customers`:
  - `source` (enum `WHATSAPP | EMAIL | PHONE | IN_PERSON | OTHER`, default `OTHER`) — canal de primer contacto.
  - `whatsappPhone` (varchar 32 nullable, E.164). Indexado (no único — el mismo número puede aparecer en clientes distintos en casos de error, lo validamos a nivel UI/servicio).
  - `lifecycleStatus` (enum `NEW | QUOTED | FOLLOW_UP | WON | LOST`, default `NEW`). Indexado.
  - `lastContactAt` (datetime nullable).
  - `nextFollowUpAt` (datetime nullable).
  - `lostReason` (text nullable) — solo se llena en `LOST`.
  - `hubspotContactId` (varchar 64 nullable) — id en HubSpot. Se popula al primer sync.
  - Backfill: todos los clientes existentes quedan en `lifecycleStatus = NEW`. Los que ya tienen ventas confirmadas pasan a `WON`. Los que tienen cotizaciones pendientes pasan a `QUOTED` con `lastContactAt = quotation.createdAt` más reciente.
- Tabla nueva `lead_events` (id, customerId FK CASCADE, type enum, refType nullable, refId nullable, occurredAt, userId nullable FK SET NULL).
- `company_settings` agrega `followUpHoursDefault` (int, default 48), `hubspotEnabled` (boolean, default false), `hubspotDefaultOwnerId` (varchar 64, nullable).
- `.env`: `HUBSPOT_API_KEY` (private app token de HubSpot).

**2. Lifecycle automático**

- **Hook en `QuotationsService.create()`**: tras persistir, busca el `customerId` (catálogo) o crea/encuentra cliente desde `customerView` (libre con phone E.164 como upsert key). Setea `lifecycleStatus = QUOTED`, `lastContactAt = NOW()`, `nextFollowUpAt = NOW() + followUpHoursDefault`. Inserta `LeadEvent(QUOTATION_CREATED, refType='quotation', refId)`.
- **Hook en `QuotationsService.markSent()`**: actualiza `lastContactAt = NOW()`, reagenda `nextFollowUpAt`. Inserta `LeadEvent(QUOTATION_SENT)`.
- **Hook en `SalesService.create()`**: tras commit, setea cliente a `lifecycleStatus = WON`, limpia `nextFollowUpAt = NULL`. Inserta `LeadEvent(SALE_CONFIRMED, refType='sale', refId)`. El cliente sale de la bandeja de seguimiento.
- **Cron job diario** ([`apps/api/src/lifecycle/lifecycle-cron.service.ts`](apps/api/src/lifecycle/lifecycle-cron.service.ts)) a las 00:30 hora local: detecta clientes con `nextFollowUpAt < NOW()` y `lifecycleStatus IN (QUOTED, FOLLOW_UP)` y sin venta confirmada desde el último contacto → marca `FOLLOW_UP`. Inserta `LeadEvent(FOLLOW_UP_TRIGGERED)` y encola push a HubSpot.
- **Endpoint `POST /customers/:id/mark-lost`**: marca `LOST` con `lostReason` obligatorio. Inserta `LeadEvent(LOST_MARKED)`. Único cambio manual de estado permitido.
- **Endpoint `POST /customers/:id/touch`**: el operador hace click en "Marcar contacto" tras hablar por WhatsApp → setea `lastContactAt = NOW()`, reagenda `nextFollowUpAt`. Inserta `LeadEvent(MANUAL_CONTACT)`. Vuelve a `QUOTED` si estaba en `FOLLOW_UP`.

**3. Bandeja `/seguimiento`**

- 4 tabs (todas con filtros + búsqueda + paginación):
  - **Pendientes**: `lifecycleStatus IN (QUOTED, FOLLOW_UP)`, `nextFollowUpAt > NOW()`. Orden por `nextFollowUpAt` ASC (más próximos primero).
  - **Sin respuesta**: `lifecycleStatus = QUOTED` y `lastContactAt < NOW() - 24h` (sin haber respondido todavía pero aún no vencido).
  - **Vencidos**: `lifecycleStatus = FOLLOW_UP` (cron ya los marcó). Orden por `nextFollowUpAt` ASC.
  - **Último contacto**: todos los clientes con `lifecycleStatus IN (QUOTED, FOLLOW_UP)` ordenados por `lastContactAt` DESC.
- Columnas por fila: Cliente, último contacto (relativo: "hace 3h"), próximo follow-up, última cotización, estado.
- **Acciones rápidas por fila**:
  - **Botón WhatsApp** (verde) → abre `wa.me/<whatsappPhone>?text=<plantilla>`. La plantilla viene de Settings (texto editable con tokens `{cliente}`, `{cotizacion}`, `{total}`).
  - **Marcar contacto** → `POST /customers/:id/touch`.
  - **Ver cotizaciones del cliente** → navega a `/cotizaciones?customer=<id>`.
  - **Marcar como perdido** → dialog con motivo.

**4. HubSpot push** ([`apps/api/src/hubspot/`](apps/api/src/hubspot/))

- Cliente API via `@hubspot/api-client`.
- **Mapping**:
  - `customer.whatsappPhone` → `phone` en HubSpot.
  - `customer.email` → `email`.
  - `customer.name` → `firstname` + `lastname` (split básico).
  - `customer.lifecycleStatus` → propiedad custom `inventory_lifecycle_status` (creada manualmente en HubSpot por el cliente). El estandar `lifecyclestage` de HubSpot tiene sus propios valores (`subscriber`, `lead`, `customer`, etc.) que no mapean 1:1 — mejor una propiedad propia con nuestros 5 valores.
- **Sync push** vía queue: cada cambio inserta un job. Worker procesa con retries (3 intentos, backoff exponencial). Idempotente: usa `hubspotContactId` si existe, sino upserta por `whatsappPhone` → `email`.
- **Activación**: si `companySettings.hubspotEnabled = false` o `HUBSPOT_API_KEY` no está set, los jobs se descartan silenciosamente (loggea warning). El sistema funciona sin HubSpot.

**5. Configuración**

- Pantalla `/configuracion` (sección nueva "Seguimiento y HubSpot"):
  - Toggle "Activar sincronización con HubSpot".
  - Input `HUBSPOT_API_KEY` (solo write, nunca read — se guarda en `.env` o secrets manager, no en DB).
  - Owner ID por defecto (input texto).
  - "Horas para marcar follow-up" (default 48).
  - Plantilla de mensaje WhatsApp con tokens.
  - Botón "Test sync" que upserta un contacto dummy y reporta el resultado.

**6. Decisiones a confirmar con cliente** (ver "Decisiones pendientes" más abajo):
- Si el lifecycle vive en `Customer` (extensión) o en una entidad `Lead` separada que opcionalmente se promueve a Customer al ganar la venta. Para el MVP de esta fase recomiendo **extensión de Customer** — más simple y suficiente.
- Si los hooks se disparan en transacción atómica (con el create de cotización/venta) o vía queue async. Recomiendo **async vía queue** para no bloquear el response del usuario si HubSpot está caído.

### Fase 9 — Dashboard (iterativo)

> Refinado en respuesta al feedback del cliente (mayo 2026): se prioriza la vista mobile-first, KPIs clicables, granularidad de día además de mes, y la conexión con el lifecycle de Fase 8.5.

**Iteración 9.1 — KPIs textuales y alertas (MVP del dashboard):**

Cards en grid responsive (`grid-cols-1` en mobile, `grid-cols-2` md, `grid-cols-4` lg). **Todos los cards son clicables** — navegan al detalle correspondiente.

- **Operación del día** (granularidad nueva, importante para gestión diaria):
  - **Ventas del día** (count + monto) → click navega a `/ventas?dateFrom=hoy&dateTo=hoy`.
  - **Cotizaciones del día** (count + monto) → click a `/cotizaciones?dateFrom=hoy&dateTo=hoy`.
  - **Caja disponible** (total + por método) → click a `/caja`.
- **Lifecycle / Comercial** (depende de Fase 8.5):
  - **Pendientes de seguimiento** (count de clientes con `lifecycleStatus IN (QUOTED, FOLLOW_UP)`) → click a `/seguimiento` tab "Pendientes".
  - **Vencidos** (count con `lifecycleStatus = FOLLOW_UP`) — destacado en ámbar si > 0 → click a `/seguimiento` tab "Vencidos".
  - **Ventas ganadas del mes** (count de `WON` con `lastContactAt` del mes) → click a `/ventas?status=PAID&dateFrom=mes`.
- **Mes**:
  - Utilidad del mes (ventas - costo de venta - gastos), valor total del inventario, gastos del mes.
- **Alertas (stock + rotación)**:
  - **Stock crítico** (count de productos `out`) — rojo si > 0 → click a `/inventario?status=out`.
  - **Bajo stock** (count `low`) — amarillo si > 0 → click a `/inventario?status=low`.
  - **Productos sin movimiento 30+ días** — click a `/reportes/sin-rotacion` (Fase 8).
  - **Rotación de inventario** (cálculo: COGS / inventario promedio del período) — vínculo a reporte detallado.

**Iteración 9.2 — Gráficos (después):**

- Tendencia de ventas últimos 30 días (línea, Recharts).
- Top 10 productos vendidos del mes.
- Margen promedio y productos más/menos rentables.
- Ticket promedio, crecimiento de ventas vs mes anterior.
- **Embudo del lifecycle** (NEW → QUOTED → WON / LOST) con porcentajes — visualiza la performance comercial.

### Fase 10 — Carga masiva Excel

1. `POST /imports/products` recibe `.xlsx` con `exceljs`.
2. Plantilla con columnas: SKU, partNumber, barcode, **universalCode**, nombre, descripción, categoría, marca, costo, precio, stockMin, stockMax, ubicación, **productKind** (ORIGINAL/ALTERNATIVE), **códigos compatibles** (separados por `;`).
3. Validación fila por fila (Zod), reporte de errores legible.
4. Plantilla descargable con encabezados e instrucciones.
5. UI con drag-and-drop, preview de primeras 10 filas, lista de errores antes de confirmar.

### Fase 11 — Códigos de barras y refinamiento de plantillas

1. **Lector USB:** input `autoFocus` + handler `Enter` — funciona out-of-the-box.
2. **Cámara:** componente con `@zxing/browser` para móviles/laptops.
3. **Generación de etiquetas:** PDF imprimible con barcode CODE128 + SKU + nombre + precio (`bwip-js`). **Formato confirmado con cliente: 50 mm de ancho × 30 mm de alto** para impresora térmica. Endpoint `GET /products/:id/label?format=50x30` y botón "Imprimir etiqueta" en el detalle del producto. Opcional: incluir el `Stock.locationCode` (Fase 7.5) si está definido en la bodega seleccionada — permite que el equipo pegue la etiqueta y se sepa dónde va.
4. Refinar plantillas de cotización, nota de venta y guía de despacho con branding final del cliente (logo, colores, footer legal). Las plantillas funcionales 80mm + carta ya viven desde Fases 6/7/7.7 — esta fase es solo pulido.

### Fase 12 — Deploy

1. **Backend:** Railway con MySQL gestionado, env vars, migraciones automáticas.
2. **Frontend:** Vercel apuntando a `apps/web`, `NEXT_PUBLIC_API_URL`.
3. CORS, rate limiting (`@nestjs/throttler`), logs estructurados.
4. Backup automático diario de MySQL.
5. Dominio + HTTPS.
6. Configurar Resend (dominio verificado para email).

### Fase 13 — HubSpot refinamientos (post-MVP)

> La integración base (push de contactos + lifecycle automático desde nuestro sistema) ya se entrega en **Fase 8.5**. Esta fase agrega los refinamientos que el cliente acepte después de usar la versión 1.0 en producción.
>
> Opciones evaluadas (a confirmar según el uso real):
>
> - **Webhook inverso**: HubSpot avisa al sistema cuando alguien edita el contacto desde el CRM. Útil si el equipo de marketing/ventas toca propiedades fuera del sistema. Requiere endpoint público + verificación de firma.
> - **Sync de Deals**: además de Contacts, exportar Cotizaciones como Deals de HubSpot con su monto y stage propio. Útil para reporting comercial dentro de HubSpot.
> - **Embed de formularios HubSpot**: insertar el formulario de captura de leads de la página pública del cliente en el sistema (pantalla landing pública).
> - **Sync histórico inicial**: cuando el cliente conecta HubSpot, ofrecer un "import inicial" que dispara push de todos los clientes existentes en batch.

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
- **Fase 8.5:** crear cotización para un cliente → su `lifecycleStatus` pasa a `QUOTED`, aparece en `/seguimiento` tab "Pendientes" con `nextFollowUpAt` calculado. Esperar > `followUpHoursDefault` → cron lo mueve a `FOLLOW_UP`, aparece en tab "Vencidos". Click en botón WhatsApp de la fila → abre `wa.me/<phone>` con el mensaje plantilla. Confirmar una venta → `lifecycleStatus = WON`, sale de las bandejas. Marcar manualmente como `LOST` → motivo guardado, fuera de la bandeja. Con `hubspotEnabled=true` y `HUBSPOT_API_KEY` configurada: el contacto aparece o se actualiza en HubSpot con propiedad `inventory_lifecycle_status` correcta.
- **Ronda 4 (responsive):** abrir el sistema en un teléfono → el sidebar desktop desaparece y aparece un botón hamburger arriba a la izquierda que abre un drawer con la misma navegación. Tablas grandes (productos, inventario, ventas, transferencias) hacen scroll horizontal cómodo con primera columna sticky o se transforman en cards en `<md`. Forms (SaleForm, QuotationForm, TransferForm) son operables sin scroll horizontal. FAB de operaciones no se solapa con contenido en mobile.
- **Fase 9:** dashboard muestra valores coherentes con los reportes; alertas semáforo cambian al producir condiciones. **Cada card es clicable** y navega al detalle filtrado. **Vista mobile** sin scroll horizontal — cards se apilan en una columna. Cotizaciones del día y Ventas del día reflejan los registros del día actual. Click en "Pendientes de seguimiento" abre `/seguimiento` tab correcto.
- **Fase 10:** subir Excel de 50 productos con códigos múltiples y `productKind`, ver preview, confirmar; Excel con errores muestra fila/motivo.
- **Fase 11:** lector USB y cámara identifican producto; etiqueta imprime con barcode legible.
- **Fase 12:** producción accesible vía dominio, login funciona, datos persisten tras redeploy, email de Resend llega desde dominio verificado.
- **Fase 13:** refinamientos de HubSpot — al confirmarse alcance — webhook inverso edita un contacto desde HubSpot y se refleja en el sistema; o Deals aparecen sincronizados.
- **Fase 14:** manual cubre todos los flujos clave; video reproducible; soporte activo durante el período acordado.

## Decisiones pendientes con el cliente

> Confirmar antes de iniciar las fases correspondientes. Cada decisión bloquea o influye una migración o un flujo concreto.


| #   | Pregunta                                                                                                                                                         | Fase impactada | Estado                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | ¿Separar `customers.address` en calle / número / comuna o dejar texto libre?                                                                                     | 4              | ✅ Confirmado: **3 columnas separadas**, las 3 opcionales.                                                                |
| 2   | "Mismo producto con mismo código" (frase del cliente) — ¿permitir duplicados de SKU? ¿códigos compartidos entre productos? ¿fusionar productos con mismo código? | 4B             | Pendiente. Asunción: `sku` se mantiene único; `product_codes` permite que distintos productos compartan el mismo `code`. |
| 3   | Comisión por tarjeta: ¿% fijo, por método (débito vs crédito), por venta individual?                                                                             | 5 / 7          | ✅ Confirmado: **% único configurable en CompanySettings, default 2.5%**.                                                  |
| 4   | Tasa de IVA: ¿19% Chile fijo o configurable?                                                                                                                     | 5              | ✅ Confirmado: **configurable desde Configuración, default 19%**.                                                          |
| 5   | Mercado Libre: ¿integración real con API ML o registro manual?                                                                                                   | 7.5            | Pendiente. Asunción: manual.                                                                                             |
| 6   | Almacenamiento de archivos: ¿disco local, S3, Cloudinary?                                                                                                        | 4B / 5         | ✅ Confirmado para MVP: **disco local en `apps/api/uploads/`** (S3/Cloudinary como evolución al desplegar).                |
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
| 22  | Precios netos vs brutos                                                                                                                                          | 5              | ✅ Confirmado: **brutos** (precios y costos incluyen IVA). El sistema descompone al confirmar venta/compra.              |
| 23  | Métodos de pago en gastos manuales                                                                                                                               | 5              | ✅ Confirmado: **mismos 3 que ventas** (CASH/TRANSFER/CARD).                                                              |
| 24  | Cancelación de compras (¿en Fase 5 o más tarde?)                                                                                                                 | 5 / 7          | ✅ Confirmado: **postergada a Fase 7** junto con cancelación de ventas.                                                   |
| 25  | Categorías de gasto: editables o fijas                                                                                                                           | 5              | ✅ Confirmado: **CRUD completo** + flag `isSystem` para las 3 categorías reservadas (no editables ni borrables).          |
| 26  | Numeración de gastos manuales                                                                                                                                    | 5              | ✅ Confirmado: **correlativo `GAS-AAAA-NNNNN`** generado atómicamente vía tabla `counters`.                               |
| 27  | Formatos aceptados en factura/comprobante                                                                                                                        | 5              | ✅ Confirmado: **PDF + JPG/PNG/WEBP**, máx 10 MB.                                                                          |
| 28  | Saldo apertura de caja                                                                                                                                           | 5              | ✅ Confirmado: **sin pantalla dedicada**. El cliente registra el saldo inicial como movimiento manual con categoría "Otros". |
| 29  | Edición de gastos: ¿libre, restringida, solo anular?                                                                                                             | 5              | ✅ Confirmado: **edición libre del mes actual**. Si el gasto es de un mes anterior, solo se puede anular con compensación. |
| 30  | Backfill de compras existentes en `cash_transactions`                                                                                                            | 5              | ✅ Confirmado: **backfill automático e idempotente** en la migración.                                                     |
| 31  | IVA en compras: auto-calculado, override o manual                                                                                                                | 5              | ✅ Confirmado: **auto-calculado desde el total bruto, con override opcional** cuando la factura del proveedor tenga redondeo distinto. |
| 32  | Cliente en cotización: catálogo obligatorio o cliente libre                                                                                                      | 6              | ✅ Confirmado: **cliente libre permitido** (sin guardarse en catálogo). Schema: `customerId` nullable + columnas snapshot. |
| 33  | Estado inicial al guardar cotización                                                                                                                             | 6              | ✅ Confirmado: **DRAFT siempre**; botón "Enviar por email/WhatsApp" la pasa a SENT. Botón "Guardar borrador" disponible. |
| 34  | Generación de PDF (server-side) para email/WhatsApp                                                                                                              | 6              | ✅ Confirmado: **`jspdf` + `jspdf-autotable`**, render server-side. WhatsApp envía link al PDF público (Cloud API queda como evolución). |
| 35  | Vigencia (validUntil) y auto-expiración                                                                                                                          | 6              | ✅ Confirmado: **15 días default + cron diario** que marca EXPIRED las cotizaciones SENT/APPROVED con `validUntil < hoy`. |
| 36  | Reserva de stock al cotizar                                                                                                                                      | 6              | ✅ Confirmado: **no se reserva**. Stock solo baja al confirmar venta (Fase 7). |
| 37  | Edición de cotización después de SENT                                                                                                                            | 6              | ✅ Confirmado: **editable libremente hasta CONVERTED**. Solo CONVERTED y EXPIRED son inmutables. |
| 38  | "Convertir a venta" — flujo                                                                                                                                      | 6 / 7          | ✅ Confirmado: **abre `/ventas/nueva?fromQuotation=<id>` con form prellenado**. Cotización pasa a CONVERTED cuando la venta se confirma. |
| 39  | Vigencia del link público (token firmado)                                                                                                                        | 6              | ✅ Confirmado: **token expira el mismo día que `validUntil`**. Después devuelve 410 Gone. |
| 40  | Formato de impresión default                                                                                                                                     | 6              | ✅ Confirmado: **Carta default + selector secundario "Imprimir 80mm"**. |
| 41  | Descuentos en cotización                                                                                                                                         | 6              | ✅ Confirmado: **por línea (monto o %)**, sin descuento global. |
| 42  | Plantilla de mensaje WhatsApp                                                                                                                                    | 6              | ✅ Confirmado: «Hola {nombre}, te envío la cotización {número} por un total de {total}. La podés ver y descargar acá: {link}». |
| 43  | Plantilla de email                                                                                                                                               | 6              | ✅ Confirmado: **HTML simple branded** (logo + saludo + datos cot + botón "Ver cotización" + PDF adjunto + footer contacto). |
| 44  | Resend — dominio verificado                                                                                                                                      | 6 / 12         | ✅ Confirmado: **modo dev** (`cotizaciones@onresend.dev`) en Fase 6. Dominio real del cliente en Fase 12 (deploy). |
| 45  | Modal "Venta o Cotización" en Fase 6                                                                                                                             | 6              | ✅ Confirmado: **se implementa en Fase 6 con opción "Venta" deshabilitada** (badge "Próximamente"). En Fase 7 se habilita. |
| 46  | Sidebar — ubicación de Cotizaciones                                                                                                                              | 6              | ✅ Confirmado: **sección "Operación" → item "Cotizaciones"**. |
| 47  | Transición a APPROVED / REJECTED                                                                                                                                 | 6              | ✅ Confirmado: **botones manuales en el detalle** (operador marca después de hablar con cliente). Sin acciones públicas en el link del cliente. |
| 48  | Columnas del PDF de cotización                                                                                                                                   | 6              | ✅ Confirmado: **Código + Descripción + Cant + P.Unit + Desc + Subtotal**. |
| 49  | HubSpot — dirección del sync                                                                                                                                     | 8.5            | ✅ Confirmado: **push desde el sistema** (sistema como fuente de verdad). Bidireccional queda para Fase 13 si el cliente lo necesita post-uso. |
| 50  | Identificador primario del lead                                                                                                                                  | 8.5            | ✅ Confirmado: **WhatsApp en E.164** (`customer.whatsappPhone`). Email queda como fallback de upsert. |
| 51  | Estados del lifecycle                                                                                                                                            | 8.5            | ✅ Confirmado: **`NEW` / `QUOTED` / `FOLLOW_UP` / `WON` / `LOST`**. Solo `LOST` es manual; el resto se calcula desde eventos. |
| 52  | Horas para marcar follow-up                                                                                                                                      | 8.5            | Pendiente. Asunción: **48h** default, configurable desde `/configuracion`. |
| 53  | Lifecycle en `Customer` extendido vs entidad `Lead` separada                                                                                                     | 8.5            | Pendiente. Asunción: **extensión de `Customer`** (simplicidad, ventas requieren RUT igual). Si aparecen contactos sin RUT que nunca compran, evaluar entidad aparte. |
| 54  | Hooks lifecycle: sync vs async                                                                                                                                   | 8.5            | Pendiente. Asunción: **async vía queue** para que HubSpot caído no rompa el flujo. |
| 55  | Plantilla de mensaje WhatsApp en la bandeja                                                                                                                      | 8.5            | Pendiente. Asunción: **texto editable** desde `/configuracion` con tokens `{cliente}`, `{cotizacion}`, `{total}`. |
| 56  | KPIs del día en el dashboard                                                                                                                                     | 9              | ✅ Confirmado (mayo 2026): **agregar Ventas del día, Cotizaciones del día, Pendientes de seguimiento, Vencidos, Ventas ganadas, Rotación de inventario**. Todos clicables. |
| 57  | Responsive móvil prioritario                                                                                                                                     | Transversal    | ✅ Confirmado: **operación móvil esperada** (seguimiento desde teléfono, stock crítico, ventas mostrador). Ronda 4 transversal antes de Fase 9 cierra brechas (sidebar drawer, tablas optimizadas). |


## Suposiciones tomadas (avísame si alguna no aplica)

1. Moneda configurable en settings, default **CLP** con formato `es-CL` (`$1.234`). `formatCurrency` está parametrizado.
2. Datos de empresa (nombre, dirección, logo, contacto, footer de cotización, días de validez por defecto, tasa IVA, comisión tarjeta, lead time de importación) editables desde pantalla **Configuración** (creada en Fase 1, refinada en Fase 5).
3. Idioma de interfaz: español. Sin i18n en MVP.
4. Sin manejo de cuenta corriente / pagos parciales en MVP — la venta es PAID o PENDING binario; los anticipos quedan fuera del MVP.
5. Sin lotes ni números de serie por producto en MVP.
6. **Email** se envía desde un dominio verificado en Resend (debes proveer un dominio o usaremos un subdominio del proyecto); plan gratuito de Resend cubre 3.000 emails/mes.
7. **WhatsApp** vía `wa.me`: abre WhatsApp Web/app del operador con mensaje + link al detalle público prellenados; el operador hace click en "enviar". No usa la API oficial (sin costo, sin verificación Meta).
8. **Detalles públicos** de cotización accesibles vía URL firmada con expiración (ej. 30 días) para que el cliente final pueda abrir el link sin login. El detalle es HTML imprimible; un PDF descargable es evolución posterior.
9. **HubSpot — push desde el sistema** (Fase 8.5): nuestro sistema es la fuente de verdad del estado del lead. El sync es one-way (system → HubSpot) en el MVP. El sistema funciona sin HubSpot — si `hubspotEnabled=false` o falta `HUBSPOT_API_KEY`, los jobs de sync se descartan silenciosamente. Refinamientos bidireccionales (webhook inverso, Deals) van en Fase 13 post-uso.
10. **Dashboard iterativo:** la versión 9.1 (KPIs+alertas textuales) es funcional desde Fase 9; los gráficos llegan en 9.2 sin bloquear la entrega del MVP. **Todos los KPIs son clicables** y la vista es mobile-first desde la primera entrega.
11. **Multi-bodega** se activa en Fase 7.5; antes de eso todas las operaciones implícitamente usan la bodega `Principal`.
12. **Garantías no afectan stock**: si la resolución termina en cambio de producto, el operador hace una devolución (`RETURN_IN`) + nueva venta o salida manualmente.
13. **Proyección de stock** usa los últimos 90 días de `SALE_OUT` para calcular consumo promedio. Si el cliente quiere otro rango (ej. 180 días para mitigar estacionalidad), se vuelve configurable.
14. **Mercado Libre Full** se gestiona con flujo manual: transferencia de mi bodega a la bodega ML y luego venta desde la bodega ML. Si más adelante el cliente quiere sincronización automática, se evalúa como integración aparte.
15. **Impresión 80mm + carta** vía HTML con CSS `@page`, sin generar PDF en el servidor en el MVP. Si el cliente final reporta problemas con la impresión desde el navegador, se evalúa pasar a `puppeteer` o `@react-pdf/renderer`.
16. **Lifecycle del lead** (Fase 8.5) vive en `Customer` extendido (no en una entidad `Lead` separada). Decisión motivada por simplicidad y por el hecho de que la mayoría de los clientes terminan siendo Customers reales (con RUT obligatorio para ventas, Fase 7). Si en el futuro hace falta separar contactos sin RUT que nunca llegan a comprar, se puede agregar tabla `Lead` aparte.
17. **Hooks de lifecycle** (Fase 8.5) se disparan **async vía queue** (no en la misma transacción del create de cotización/venta). Razón: el push a HubSpot puede fallar (timeout, API caída) y no queremos abortar la venta del operador por un problema del CRM. La fuente de verdad sigue siendo nuestra DB.
18. **Responsive mobile** (Ronda 4 + transversal): el sistema debe ser operable desde teléfono en flujos comerciales frecuentes (seguimiento, ver stock, registrar venta mostrador). Tablets quedan cubiertas por el mismo breakpoint (`md+` ya muestra layout desktop).

