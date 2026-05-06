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

| Tema | Decisión |
| --- | --- |
| País / moneda | LATAM genérico, moneda configurable (default USD), formato es-LATAM |
| Facturación | Solo documentos internos (cotización, nota de venta, recibo) en PDF |
| Flujo de ventas | Solo administrativo (no POS) |
| Tenancy | Mono-empresa |
| Roles | Solo Administrador en MVP, estructura RBAC ligera lista para extender |
| Almacenes | 1 solo almacén (modelo permite N a futuro) |
| Compras | Solo entradas directas (sin OC formal) |
| Clientes | Gestión completa con historial + notas internas |
| Carga masiva | Excel `.xlsx` |
| Código de barras | Esencial: soporte para lector USB y cámara |
| Compatibilidad | Productos asociados a marca/modelo/año de vehículo |
| Caja | Una sola caja consolidada con campo `paymentMethod` (efectivo/transferencia/tarjeta) |
| Envío cotizaciones | WhatsApp vía `wa.me` + Email vía **Resend** |
| Dashboard | Iterativo: KPIs textuales y alertas primero, gráficos en fase posterior |
| HubSpot | Pendiente de confirmar alcance con el cliente — fase final |
| Auth | JWT propio en NestJS |
| Hosting | Next.js → Vercel · NestJS + MySQL → Railway |
| UI | Tema neutro shadcn/ui · semáforo verde/amarillo/rojo en alertas |

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Hook Form + Zod
- **Backend:** NestJS 10 + TypeScript + TypeORM 0.3 + MySQL 8 + class-validator + Passport (JWT) + bcrypt
- **Email transaccional:** Resend (`resend` SDK)
- **PDF:** `@react-pdf/renderer`
- **Excel:** `exceljs`
- **Códigos de barras:** `@zxing/browser` (cámara) · lectores USB funcionan como teclado nativo · `bwip-js` para generación de etiquetas
- **Gráficos (cuando lleguen):** Recharts
- **Repo:** monorepo con `pnpm` workspaces — `apps/web` + `apps/api` + `packages/shared`

## Modelo de datos (entidades clave)

```
User (id, name, email, passwordHash, role, isActive)

Supplier (id, name, taxId, email, phone, address, notes)
Customer (id, name, taxId, email, phone, address, internalNotes)

Category (id, name, parentId)
Brand   (id, name)            -- marca del repuesto (Bosch, NGK)

VehicleMake   (id, name)              -- Toyota, Ford
VehicleModel  (id, makeId, name)      -- Corolla, Hilux
VehicleFitment (id, productId, modelId, yearFrom, yearTo)

Warehouse (id, name, address)         -- 1 al inicio

Product (id, sku, partNumber, barcode, name, description,
         categoryId, brandId, supplierId, cost, price,
         minStock, maxStock, location, isActive)

Stock (id, productId, warehouseId, quantity)              -- caché actual

InventoryMovement (id, productId, warehouseId, type, qty, unitCost,
                   reference, refId, userId, createdAt)
   -- type: PURCHASE_IN | SALE_OUT | ADJUSTMENT | RETURN_IN | RETURN_OUT

PurchaseEntry (id, supplierId, date, total, notes, userId)
PurchaseEntryItem (id, entryId, productId, qty, unitCost, subtotal)

Quotation (id, number, customerId, date, validUntil, status, total, notes, userId)
   -- status: DRAFT | SENT | APPROVED | REJECTED | CONVERTED | EXPIRED
QuotationItem (id, quotationId, productId, qty, unitPrice, discount, subtotal)

Sale (id, number, customerId, date, total, paymentMethod, status, quotationId?, userId)
   -- paymentMethod: CASH | TRANSFER | CARD
   -- status: PENDING | PAID | CANCELLED
SaleItem (id, saleId, productId, qty, unitPrice, discount, subtotal, unitCost)
   -- unitCost congelado para reportes de rentabilidad

CashTransaction (id, date, type, source, sourceId?, description,
                 amount, paymentMethod, userId, createdAt)
   -- type: INCOME | EXPENSE
   -- source: SALE | PURCHASE | MANUAL
   -- paymentMethod: CASH | TRANSFER | CARD
ExpenseCategory (id, name)             -- arriendo, transporte, publicidad, otros

CompanySettings (id, name, address, phone, email, logoUrl, currency,
                 quotationFooter, defaultValidityDays)
```

**Reglas críticas de integridad:**
- El stock se calcula a partir de `InventoryMovement` (fuente de verdad). La tabla `Stock` se mantiene como caché actualizado vía transacción al insertar cada movimiento.
- La caja es una sola consolidada. Cada venta marcada como PAID inserta `CashTransaction(INCOME, source=SALE)` automáticamente. Cada `PurchaseEntry` inserta `CashTransaction(EXPENSE, source=PURCHASE)`. Los gastos manuales se insertan con `source=MANUAL`. Cancelar una venta/compra **revierte** la transacción de caja.
- `unitCost` se congela en `SaleItem` al confirmar la venta para que los reportes de rentabilidad sean históricamente correctos aunque cambie el costo del producto después.

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
│   │   │       ├── clientes/
│   │   │       ├── proveedores/
│   │   │       ├── cotizaciones/
│   │   │       ├── ventas/
│   │   │       ├── caja/
│   │   │       ├── reportes/
│   │   │       └── configuracion/
│   │   ├── components/ui/      # shadcn
│   │   ├── components/forms/
│   │   ├── lib/api.ts
│   │   └── lib/auth.ts
│   └── api/                    # NestJS
│       ├── src/
│       │   ├── auth/
│       │   ├── users/
│       │   ├── products/
│       │   ├── inventory/
│       │   ├── purchases/
│       │   ├── customers/
│       │   ├── suppliers/
│       │   ├── quotations/
│       │   ├── sales/
│       │   ├── cashbox/        # Caja
│       │   ├── reports/
│       │   ├── dashboard/      # KPIs agregados
│       │   ├── imports/        # carga Excel
│       │   ├── pdf/
│       │   ├── notifications/  # Resend (email) + wa.me (WhatsApp link builder)
│       │   ├── settings/
│       │   ├── database/
│       │   │   ├── data-source.ts          # DataSource TypeORM (CLI + runtime)
│       │   │   ├── entities/               # @Entity() classes
│       │   │   ├── migrations/             # generadas con typeorm-ts-node
│       │   │   └── seeds/
│       │   └── common/
├── packages/
│   └── shared/                 # tipos DTO/Zod compartidos
├── docker-compose.yml
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

### Fase 3 — Inventario (entradas/salidas/ajustes)
1. `InventoryService.applyMovement()` — única vía para mutar stock, transaccional.
2. Endpoint de entrada directa de mercadería (proveedor + items + costos).
3. Endpoint de ajuste manual con motivo.
4. UI de movimientos con filtros (fechas, producto, tipo).
5. Vista de stock con badge **rojo** si `quantity = 0`, **amarillo** si `<= minStock`, **verde** caso contrario.

### Fase 4 — Clientes y proveedores
1. CRUD de `Customer` con datos fiscales, contacto, **notas internas**.
2. CRUD de `Supplier`.
3. Detalle de cliente con tabs *Datos* / *Cotizaciones* / *Ventas*.
4. Detalle de proveedor con historial de entradas.
5. Validación de teléfono en formato internacional (clave para WhatsApp).

### Fase 5 — Caja y gastos
1. Modelo `CashTransaction` + `ExpenseCategory`.
2. CRUD de gastos manuales (registro con fecha, categoría, monto, método de pago, descripción, comprobante adjunto opcional).
3. Vista "Libro de caja" con filtros por fecha/tipo/método/origen, total ingresos, total egresos, saldo del período.
4. Integración: hook desde `PurchaseEntry` y `Sale.confirm()` ya prepara la inserción automática para fases siguientes.
5. Endpoint `GET /cashbox/balance` que devuelve saldo actual y por método de pago.

### Fase 6 — Cotizaciones y envío
1. CRUD de `Quotation` + items con cálculo de totales en tiempo real.
2. Numeración correlativa (`COT-2026-00001`) configurable desde Settings.
3. Estados: DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CONVERTED.
4. **PDF de cotización** con `@react-pdf/renderer` — encabezado con datos de empresa (logo, NIT/RUC, contacto), ítems, totales, validez, notas.
5. **Botón Enviar por WhatsApp:** abre `https://wa.me/<phone>?text=<mensaje>` con mensaje predefinido y link al PDF público (URL firmada con expiración).
6. **Botón Enviar por email:** envía con Resend usando plantilla HTML, adjunta el PDF, marca cotización como SENT.
7. Acción "Convertir a venta" → crea `Sale` enlazada y mueve cotización a CONVERTED.

### Fase 7 — Ventas con caja integrada
1. CRUD de `Sale` + items, con selector de método de pago (efectivo/transferencia/tarjeta).
2. Validación de stock disponible antes de confirmar.
3. Al confirmar (status=PAID), transacción atómica vía `dataSource.transaction(async manager => { ... })`:
   - `applyMovement(SALE_OUT)` por cada ítem (recibe el `manager`),
   - congela `unitCost` en cada `SaleItem`,
   - inserta `CashTransaction(INCOME, source=SALE, sourceId=sale.id)`.
4. Cancelación: revierte movimientos de stock **y** anula la transacción de caja (compensación con monto negativo o `isVoided=true`).
5. PDF de nota de venta.
6. Compras también disparan `CashTransaction(EXPENSE, source=PURCHASE)` automáticamente al guardar `PurchaseEntry`.

### Fase 8 — Reportes y exportación
1. Stock actual valorizado (costo y precio).
2. Movimientos por período/producto/tipo.
3. Ventas por producto / cliente / período.
4. Rentabilidad por producto y categoría (usa `unitCost` congelado).
5. Proveedores y compras.
6. **Productos sin rotación** (sin movimientos de salida en N días).
7. **Rotación de inventario** y valor total inventario.
8. **Estado de resultados** (ventas, costos, gastos, utilidad).
9. **Flujo de caja** por período.
10. Exportación CSV y PDF en cada reporte.

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
2. Validación fila por fila (Zod), reporte de errores legible.
3. Plantilla descargable con encabezados e instrucciones.
4. UI con drag-and-drop, preview de primeras 10 filas, lista de errores antes de confirmar.

### Fase 11 — Códigos de barras y refinamiento de PDFs
1. **Lector USB:** input `autoFocus` + handler `Enter` — funciona out-of-the-box.
2. **Cámara:** componente con `@zxing/browser` para móviles/laptops.
3. **Generación de etiquetas:** PDF imprimible con barcode CODE128 + SKU + nombre + precio (`bwip-js`).
4. Refinar plantillas de cotización y nota de venta con branding final del cliente.

### Fase 12 — Deploy
1. **Backend:** Railway con MySQL gestionado, env vars, migraciones automáticas.
2. **Frontend:** Vercel apuntando a `apps/web`, `NEXT_PUBLIC_API_URL`.
3. CORS, rate limiting (`@nestjs/throttler`), logs estructurados.
4. Backup automático diario de MySQL.
5. Dominio + HTTPS.
6. Configurar Resend (dominio verificado para email).

### Fase 13 — Integración HubSpot (alcance a confirmar)
> Pendiente: confirmar con el cliente qué datos sincronizar. Opciones evaluadas:
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

- `apps/api/src/database/data-source.ts` — DataSource TypeORM compartido por CLI y app (Fase 1).
- `apps/api/src/database/entities/*.entity.ts` — entidades con decoradores `@Entity()` (Fase 1).
- `apps/api/src/database/migrations/` — migraciones SQL versionadas (Fase 1+).
- `apps/api/src/inventory/inventory.service.ts` — `applyMovement(manager, ...)` transaccional, **única fuente de mutación de stock**; recibe `EntityManager` para componerse con transacciones externas (Fase 3).
- `apps/api/src/cashbox/cashbox.service.ts` — `recordTransaction(manager, ...)` y `voidTransaction(manager, ...)`, **única fuente de mutación de caja** (Fase 5).
- `apps/api/src/sales/sales.service.ts` — `confirm()` envuelve todo en `dataSource.transaction()`: movimientos de stock + transacción de caja atómicos (Fase 7).
- `apps/api/src/notifications/whatsapp.util.ts` — builder de URLs `wa.me` con encoding correcto (Fase 6).
- `apps/api/src/notifications/email.service.ts` — wrapper sobre Resend con plantillas (Fase 6).
- `apps/api/src/imports/products-import.service.ts` — parser Excel + validación (Fase 10).
- `apps/api/src/dashboard/dashboard.service.ts` — agregaciones SQL para KPIs (Fase 9).
- `apps/api/src/pdf/templates/` — cotización, nota de venta, etiquetas (Fases 6, 7, 11).
- `apps/web/lib/api.ts` — cliente HTTP con interceptor JWT y refresh (Fase 1).
- `apps/web/components/forms/product-form.tsx` — incluye sub-form de compatibilidad vehicular (Fase 2).
- `apps/web/app/(dashboard)/page.tsx` — dashboard principal (Fase 9).
- `packages/shared/src/dtos/` — Zod schemas reutilizables.

## Verificación end-to-end

Al cierre de cada fase:

- **Fase 1:** login con admin seedeado, refresh funciona, página protegida redirige si no hay sesión.
- **Fase 2:** crear producto con 3 vehículos compatibles, búsqueda por modelo lo encuentra.
- **Fase 3:** entrada de 100 unidades + ajuste de -5, stock final correcto, semáforo cambia color al cruzar `minStock`.
- **Fase 4:** cliente con teléfono internacional valida; notas internas se guardan.
- **Fase 5:** registrar gasto manual de arriendo, aparece en libro de caja, saldo se actualiza.
- **Fase 6:** crear cotización, generar PDF, click en WhatsApp abre `wa.me` con mensaje correcto, click en email envía con Resend (revisar inbox).
- **Fase 7:** confirmar venta efectivo → stock baja, caja sube, libro de caja muestra ingreso. Cancelar venta → stock vuelve, caja se compensa. Compra → caja baja.
- **Fase 8:** cada reporte exporta CSV y PDF abribles. Estado de resultados cuadra contra movimientos.
- **Fase 9:** dashboard muestra valores coherentes con los reportes; alertas semáforo cambian al producir condiciones.
- **Fase 10:** subir Excel de 50 productos, ver preview, confirmar; Excel con errores muestra fila/motivo.
- **Fase 11:** lector USB y cámara identifican producto; etiqueta imprime con barcode legible.
- **Fase 12:** producción accesible vía dominio, login funciona, datos persisten tras redeploy, email de Resend llega desde dominio verificado.
- **Fase 13:** (al confirmar alcance) cliente creado en sistema aparece en HubSpot.
- **Fase 14:** manual cubre todos los flujos clave; video reproducible; soporte activo durante el período acordado.

## Suposiciones tomadas (avísame si alguna no aplica)

1. Moneda configurable en settings, default USD, formato `1.234,56`.
2. Datos de empresa (nombre, dirección, logo, contacto, footer de cotización, días de validez por defecto) editables desde pantalla **Configuración** (creada en Fase 1, refinada en Fase 6).
3. Idioma de interfaz: español. Sin i18n en MVP.
4. Sin manejo de cuenta corriente / pagos parciales en MVP — la venta es PAID o PENDING binario; los anticipos quedan fuera del MVP.
5. Sin lotes ni números de serie por producto en MVP.
6. **Email** se envía desde un dominio verificado en Resend (debes proveer un dominio o usaremos un subdominio del proyecto); plan gratuito de Resend cubre 3.000 emails/mes.
7. **WhatsApp** vía `wa.me`: abre WhatsApp Web/app del operador con mensaje + link al PDF prellenados; el operador hace click en "enviar". No usa la API oficial (sin costo, sin verificación Meta).
8. **PDFs públicos** de cotización accesibles vía URL firmada con expiración (ej. 30 días) para que el cliente final pueda abrir el link sin login.
9. **HubSpot** queda como Fase 13 con alcance a definir; el resto del sistema funciona sin esa integración.
10. **Dashboard iterativo:** la versión 9.1 (KPIs+alertas textuales) es funcional desde Fase 9; los gráficos llegan en 9.2 sin bloquear la entrega del MVP.
