# Guía de pruebas — Fases 6 → 8.5 + Ronda 4

Este documento es la guía de QA y testing manual para todo lo construido desde la **Fase 6 (Cotizaciones)** hasta la **Ronda 4 (Responsive móvil)**. Por cada fase encontrás:

1. **Qué es** — propósito del módulo en una línea.
2. **Endpoints backend** — método, ruta, payload, respuesta esperada y errores comunes.
3. **Flujo UI** — pasos en orden para probar end-to-end.
4. **Casos borde** — qué romper para verificar validaciones.

> **Base URL del API:** `http://localhost:4000/api` (todos los endpoints van prefijados con `/api`).
> **Web app:** `http://localhost:3000`.
> **Auth:** cookies httpOnly (`access_token`, `refresh_token`). Toda llamada a un endpoint protegido requiere haber hecho `POST /api/auth/login` antes.
> **IDs:** todos los `:id` son UUID v4. Si pasás algo distinto el endpoint responde `400 Bad Request - Validation failed (uuid is expected)`.

---

## 0. Preparación del entorno

### 0.1 Pre-requisitos

- Node 20.11+ y pnpm 9.12+
- MySQL 8 corriendo en `localhost:3306`
- Base `inventory` creada y usuario `inventory` con permisos (ver `.env.example`)

### 0.2 Reset completo de la base + seed

```bash
# Desde la raíz del repo
cd inventory-chile

# 1) Instalar dependencias
pnpm install

# 2) Recrear la base de datos (esto BORRA datos existentes)
mysql -u inventory -p'Inv3ntory!' -e "DROP DATABASE IF EXISTS inventory; CREATE DATABASE inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3) Correr migraciones (crea tablas, índices, FK)
pnpm --filter @inventory/api db:migrate

# 4) Seed (usuario admin + categorías + marcas + comunas + bodega "Principal")
pnpm --filter @inventory/api db:seed

# 5) Arrancar API + web en modo dev (puerto 4000 y 3000)
pnpm dev
```

### 0.3 Credenciales

| Campo | Valor |
| --- | --- |
| URL web | `http://localhost:3000` |
| Email | `admin@inventory.local` |
| Password | `admin123` |

> Para cambiar credenciales del seed, exportar `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` antes de correr `db:seed`.

### 0.4 Login (necesario antes de cualquier endpoint protegido)

```bash
curl -i -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@inventory.local","password":"admin123"}'
```

**Respuesta 200:**
```json
{ "user": { "id": "uuid", "email": "admin@inventory.local", "role": "admin" } }
```

**Errores:**
- `401 Unauthorized` — credenciales inválidas.
- `400 Bad Request` — email mal formado o password faltante.

Las cookies `access_token` y `refresh_token` se setean automáticamente. Las siguientes llamadas usan `-b cookies.txt` para enviarlas.

### 0.5 Errores comunes en todos los endpoints

| Código | Causa típica |
| --- | --- |
| `400` | Validación de DTO falló (campo requerido, formato inválido, valor fuera de rango). El body incluye `message: [...]` con detalles. |
| `401` | Sin cookie `access_token` o expirada. Re-loguear o usar `POST /api/auth/refresh`. |
| `403` | Cookie válida pero rol insuficiente (a futuro; el MVP usa un solo rol admin). |
| `404` | Recurso no existe o fue eliminado. |
| `409` | Conflicto: RUT duplicado, intentar cancelar algo ya cancelado, etc. |
| `500` | Bug del backend. Revisar logs de la API. |

---

## Fase 6 — Cotizaciones

### Qué es

Crear cotizaciones con cliente del catálogo o **cliente libre** (snapshot de nombre/RUT/email/teléfono). Cada cotización tiene un **link público con token** (`/p/q/:token`) que se envía por WhatsApp o email, y un PDF descargable en formato **Carta (A4)** o **Térmica 80mm**. Lifecycle: `DRAFT` → `SENT` → (`APPROVED` | `REJECTED` | `CONVERTED`).

### Endpoints

#### `GET /api/quotations`
Lista paginada con filtros.

```bash
curl -b cookies.txt "http://localhost:4000/api/quotations?status=DRAFT&dateFrom=2026-05-01&dateTo=2026-05-31&page=1&pageSize=20"
```

**Respuesta 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "number": "COT-2026-00001",
      "status": "DRAFT",
      "customerId": "uuid|null",
      "customerView": { "name": "Repuestos del Sur", "taxId": "76.123.456-7", "phone": "+56912345678", "email": "x@y.cl" },
      "date": "2026-05-16T...",
      "validUntil": "2026-05-31T...",
      "subtotal": "100000.00", "taxAmount": "19000.00", "total": "119000.00",
      "publicUrl": "http://localhost:3000/p/q/<token>",
      "items": [...]
    }
  ],
  "total": 1, "page": 1, "pageSize": 20
}
```

**Query params:** `status` (DRAFT|SENT|APPROVED|REJECTED|CONVERTED), `customerId`, `dateFrom`, `dateTo`, `q` (busca número/cliente/RUT), `page`, `pageSize`.

#### `POST /api/quotations`
Crear cotización.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/quotations \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": null,
    "customerNameSnapshot": "Cliente Libre",
    "customerTaxIdSnapshot": "12.345.678-5",
    "customerPhoneSnapshot": "+56912345678",
    "date": "2026-05-16T15:00:00.000Z",
    "validUntil": "2026-05-31T23:59:59.000Z",
    "notes": "Importación 75 días",
    "items": [
      { "productId": "<uuid-producto>", "qty": 2, "unitPrice": "50000.00", "discount": "0", "discountPercent": null }
    ]
  }'
```

**Respuesta 201:** la cotización completa con `number`, `total` calculado, `publicUrl`, `status=DRAFT`. **Hook lifecycle:** si la cotización tiene `customerId`, el cliente se marca como `QUOTED` con `lastContactAt=now` y `nextFollowUpAt=now+followUpHoursDefault` (Fase 8.5).

**Errores:**
- `400` — `items` vacío, `unitPrice` no es número string, `customerTaxIdSnapshot` con RUT inválido.
- `404` — `productId` no existe.

#### `PATCH /api/quotations/:id`
Editar (sólo en `DRAFT`).

```bash
curl -b cookies.txt -X PATCH http://localhost:4000/api/quotations/<id> \
  -H "Content-Type: application/json" \
  -d '{ "notes": "Actualizado", "items": [...] }'
```

**Errores:**
- `409` — cotización ya enviada/aprobada/convertida (no se permite editar).

#### `DELETE /api/quotations/:id`
Eliminar (sólo en `DRAFT`).

**Errores:** `409` si no está en `DRAFT`.

#### `POST /api/quotations/:id/send/whatsapp`
Genera el link `wa.me` con el mensaje pre-armado. Marca la cotización como `SENT`.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/quotations/<id>/send/whatsapp \
  -H "Content-Type: application/json" \
  -d '{ "to": "+56912345678" }'
```

**Respuesta 200:**
```json
{
  "whatsappUrl": "https://wa.me/56912345678?text=Hola...",
  "status": "SENT",
  "sentAt": "2026-05-16T..."
}
```

**Errores:**
- `400` — `to` faltante y la cotización no tiene `phone` ni en customer ni en snapshot.

#### `POST /api/quotations/:id/send/email`
Genera PDF (Carta) + lo manda por Resend. Marca como `SENT`.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/quotations/<id>/send/email \
  -H "Content-Type: application/json" \
  -d '{ "to": "cliente@example.com" }'
```

**Errores:**
- `400` — `to` faltante y la cotización no tiene email en customer ni snapshot.
- `500` — `RESEND_API_KEY` no configurada o Resend rechazó el envío (chequear logs).

#### `POST /api/quotations/:id/approve` / `POST /api/quotations/:id/reject`
Cambia status a `APPROVED` o `REJECTED`. Reject acepta `{ "notes": "motivo opcional" }`.

#### `POST /api/quotations/:id/convert`
Atajo para abrir el form de venta con prefill (en la UI). En backend, devuelve el DTO completo.

#### `GET /api/quotations/:id/pdf?format=letter|thermal80`
Devuelve el PDF inline (`application/pdf`).

```bash
curl -b cookies.txt "http://localhost:4000/api/quotations/<id>/pdf?format=letter" -o cot.pdf
```

#### `GET /api/p/q/:token` (público — sin auth)
Vista pública de la cotización (lo que ve el cliente al abrir el link).

#### `GET /api/p/q/:token/pdf` (público — sin auth)
PDF descargable público.

### Flujo UI

1. Login en `http://localhost:3000`.
2. Ir a **Cotizaciones** (sidebar → Operación → Cotizaciones).
3. Click **+ Nueva cotización**.
4. Tab **Cliente**: probar dos paths:
   - **Catálogo:** seleccionar cliente del combobox. Aparece nombre + RUT + email.
   - **Libre:** click "Cliente libre". Escribir nombre y RUT. Validar que RUT inválido (ej. `12345678-X`) bloquee con error en rojo.
5. Tab **Items**: agregar producto. Tipear cantidad. Verificar que el badge "Stock: X" aparezca bajo cada cantidad. Si excedés el stock, el badge se pone ámbar y aparece banner "Stock insuficiente" al final (no bloqueante — cotización permite exceso por lead time 2-3 meses).
6. Tab **Notas**: agregar nota opcional.
7. Click **Crear cotización**. Toast verde con número (ej. `COT-2026-00001`).
8. En el detalle: click **WhatsApp** → abre `wa.me` con mensaje pre-armado. Volver, ver que status pasó de `DRAFT` a `SENT`.
9. Click **Imprimir** → dropdown **Carta** o **80mm**. PDF abre en nueva tab.
10. Click **Convertir a venta** → abre form de venta con items + cliente prefilleados.

### Casos borde

- **Cliente libre sin RUT + intentar convertir a venta:** la UI muestra banner amarillo "Registrá al cliente para continuar" y un dialog inline. Si el snapshot trae RUT y existe en catálogo, aparece banner verde "Ya existe — Usar este cliente" o "Crear uno nuevo".
- **Editar cotización ya `SENT`:** los botones de edición desaparecen. El backend devuelve `409` si se fuerza vía API.
- **Eliminar cotización `CONVERTED`:** prohibido (`409`). Sólo `DRAFT` se puede eliminar.

---

## Fase 7 — Ventas

### Qué es

Vender productos con caja integrada. Cada venta atómicamente: descuenta stock, asienta movimiento de inventario tipo `SALE`, crea transacción de caja con método de pago (`CASH`/`TRANSFER`/`CARD`), aplica comisión de tarjeta automática, y opcionalmente marca la cotización origen como `CONVERTED`. Cancelación atómica revierte todo. PDF en formato Carta / 80mm.

### Endpoints

#### `GET /api/sales`
Lista paginada.

```bash
curl -b cookies.txt "http://localhost:4000/api/sales?status=PAID&paymentMethod=CASH&dateFrom=2026-05-01&page=1&pageSize=20"
```

**Query params:** `status` (PAID|PENDING|CANCELLED), `paymentMethod` (CASH|TRANSFER|CARD), `customerId`, `dateFrom`, `dateTo`, `q`, `page`, `pageSize`.

#### `GET /api/sales/available-stock?productIds=<id1>,<id2>&warehouseId=<id>`
Stock disponible por producto en la bodega indicada. Lo usa el SaleForm para mostrar el badge "Stock: X".

#### `POST /api/sales`
Crear venta.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/sales \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "<uuid>",
    "warehouseId": "<uuid-bodega>",
    "paymentMethod": "CARD",
    "date": "2026-05-16T15:00:00.000Z",
    "quotationId": "<uuid-opcional>",
    "items": [{ "productId": "<uuid>", "qty": 2, "unitPrice": "50000.00", "discount": "0", "discountPercent": null }]
  }'
```

**Respuesta 201:** la venta con `number` (ej. `VTA-2026-00001`), `total`, `cashCommissionAmount` (si CARD), `status=PAID`. **Hooks:** marca cotización origen como `CONVERTED` (si vino `quotationId`), marca cliente como `WON` con `nextFollowUpAt=null` (Fase 8.5).

**Errores:**
- `400` — `customerId` faltante (todas las ventas requieren cliente del catálogo).
- `400` — `paymentMethod` inválido.
- `409` — stock insuficiente en la bodega (a diferencia de cotización, en venta el exceso BLOQUEA).
- `404` — `productId` o `customerId` no existe.

#### `POST /api/sales/:id/cancel`
Cancela atómicamente: reintegra stock, anula transacción de caja, marca status `CANCELLED`.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/sales/<id>/cancel \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Cliente se arrepintió, devolución total" }'
```

**Errores:**
- `400` — `reason` < 5 caracteres.
- `409` — venta ya cancelada o tiene devoluciones/guías activas asociadas.

#### `GET /api/sales/:id/pdf?format=letter|thermal80`
PDF de la venta (Carta o térmica 80mm).

### Flujo UI

1. **Ventas** → **+ Nueva venta** (botón directo o FAB → "Venta").
2. Tab **Cliente y pago**:
   - Seleccionar cliente del catálogo (RUT obligatorio — venta mostrador chilena).
   - **Bodega:** verificar que el selector aparezca arriba (Ronda 6). Default = "Principal".
   - **Método de pago:** Efectivo / Transferencia / Tarjeta. Si Tarjeta, mostrar comisión (`cardCommissionRate` de settings).
3. Tab **Items**:
   - Agregar producto. Si excede stock, fila se pinta rojo y banner ámbar arriba dice "Stock insuficiente — cambiá la bodega o ajustá cantidades".
4. Tab **Notas**: opcional.
5. Click **Registrar venta**. Toast verde con número (ej. `VTA-2026-00001`).
6. Ir a `/caja` → verificar que aparece la transacción tipo `IN` con el monto (descontada la comisión si CARD).
7. Ir a `/inventario` → verificar que el stock del producto bajó.
8. Volver a la venta. Click **Imprimir** → Carta o 80mm.
9. Click **Cancelar venta**. Modal pide motivo (≥5 chars). Confirmar. Verificar:
   - Status pasa a `CANCELLED` con tachado en el listado.
   - Stock vuelve.
   - Transacción de caja se marca `isVoided=true`.

### Casos borde

- **Vender con stock=0 en bodega activa:** error `409` con "Stock insuficiente para SKU XXX".
- **Cancelar venta con devolución activa:** error `409` "La venta tiene devoluciones asociadas. Cancelar primero las devoluciones".
- **Convertir cotización con cliente libre sin RUT:** redirige a `/ventas/nueva?fromQuotation=<id>`. SaleForm muestra banner amarillo "Registrá al cliente para continuar" con dialog inline pre-lleno. Después de registrar (o reusar uno existente por RUT), la cotización origen queda con `customerId` setteado y se mantienen los snapshots como histórico.

---

## Fase 7.5 — Multi-bodega + transferencias

### Qué es

Activar bodegas adicionales (en el seed sólo está "Principal"; "Mercado Libre Full" viene seedeada **inactiva**). **Transferencias entre bodegas** con número correlativo `TRA-AAAA-NNNNN`, items con cantidad y costo, descuenta stock origen y suma stock destino atómicamente. Edición inline de `locationCode` por bodega en `/inventario`.

### Endpoints

#### `GET /api/warehouses?active=true`
Lista bodegas (filtro por activas).

#### `GET /api/transfers`
Lista paginada con filtros `status` (`COMPLETED`|`CANCELLED`), `fromWarehouseId`, `toWarehouseId`, `q`, `dateFrom`, `dateTo`.

#### `POST /api/transfers`
Crear transferencia.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "fromWarehouseId": "<uuid>",
    "toWarehouseId": "<uuid>",
    "date": "2026-05-16T15:00:00.000Z",
    "notes": "Reabastecimiento ML Full",
    "items": [{ "productId": "<uuid>", "qty": 5 }]
  }'
```

**Respuesta 201:** transferencia con `number=TRA-2026-00001`, `status=COMPLETED`.

**Errores:**
- `400` — `fromWarehouseId === toWarehouseId` ("Origen y destino deben ser distintos").
- `404` — alguna bodega o producto no existe.
- `409` — stock insuficiente en bodega origen.

#### `POST /api/transfers/:id/cancel`
Cancela y revierte stock.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/transfers/<id>/cancel \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Error en cantidad" }'
```

**Errores:** `409` si ya está cancelada o si stock en destino bajó por una venta posterior (cancelación dejaría stock destino negativo — error explícito).

#### `PATCH /api/inventory/stock/:productId/:warehouseId/location`
Editar `locationCode` por bodega (la celda inline de `/inventario`).

### Flujo UI

1. Ir a **Almacenes** (sidebar → Operación). Activar "Mercado Libre Full" si vas a transferir.
2. Ir a **Inventario** → seleccionar bodega "Principal". Click en la celda "Ubicación" de un producto. Tipear "A-12-3". Enter. Toast "Ubicación actualizada".
3. Ir a **Transferencias** → **+ Nueva transferencia**.
4. Seleccionar **Origen** y **Destino** distintos.
5. Agregar producto. La qty está limitada por el stock del origen.
6. Click **Crear transferencia**. Toast con `TRA-2026-00001`.
7. Verificar:
   - Stock origen bajó.
   - Stock destino subió.
   - En `/inventario/movimientos` aparecen 2 movimientos: `TRANSFER_OUT` y `TRANSFER_IN`.
8. Cancelar transferencia → verificar reversión de stock + movimientos espejo.

### Casos borde

- **Transferir con origen=destino:** UI bloquea el botón. Si forzás vía API → `400`.
- **Cancelar transferencia cuando ya se vendió el stock destino:** `409`.

---

## Fase 7.6 — Devoluciones y garantías

### Qué es

**Devoluciones (`/returns`)** de cliente o proveedor con condición del producto **Vendible** (vuelve al stock) o **Dañado** (no vuelve). Reembolso atómico en caja. **Garantías (`/warranties`)** con lifecycle `OPEN` → `IN_REVIEW` → (`APPROVED` | `REJECTED`) → `RESOLVED`. Las garantías **no afectan stock** por sí mismas — si la resolución implica devolución/cambio, se hace `link-return` a una devolución existente.

### Endpoints — Devoluciones

#### `GET /api/returns`
Lista paginada. Query: `type` (CUSTOMER|SUPPLIER), `status`, `q`, `dateFrom`, `dateTo`.

#### `POST /api/returns`
Crear devolución.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/returns \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CUSTOMER",
    "saleId": "<uuid>",
    "date": "2026-05-16T15:00:00.000Z",
    "reason": "Producto incorrecto",
    "refundMethod": "CASH",
    "items": [{ "saleItemId": "<uuid>", "qty": 1, "condition": "SELLABLE" }]
  }'
```

**Respuesta 201:** devolución con `number=DEV-2026-00001`, transacción de caja tipo `OUT` (egreso).

**Errores:**
- `400` — `qty` excede la cantidad vendida en ese saleItem menos lo ya devuelto.
- `404` — `saleId` o `saleItemId` no existe.
- `409` — venta cancelada (no se permite devolver de venta anulada).

#### `GET /api/returns/by-sale/:saleId/returned-qty`
Devuelve `{ saleItemId: qty }` con lo ya devuelto. Lo usa el form para limitar `qty` máxima.

#### `POST /api/returns/:id/cancel`
Cancela: reintegra stock (si fue `SELLABLE`), revierte transacción de caja.

### Endpoints — Garantías

#### `GET /api/warranties` — listado.

#### `POST /api/warranties`
```bash
curl -b cookies.txt -X POST http://localhost:4000/api/warranties \
  -H "Content-Type: application/json" \
  -d '{ "saleId": "<uuid>", "saleItemId": "<uuid>", "description": "Falla al encender", "claimedAt": "2026-05-16T..." }'
```

**Respuesta 201:** `number=GAR-2026-00001`, `status=OPEN`.

#### `PATCH /api/warranties/:id/status`
Avanzar lifecycle.
```json
{ "status": "APPROVED", "notes": "Reemplazo aprobado" }
```

#### `POST /api/warranties/:id/link-return/:returnId`
Vincular la garantía a una devolución existente que materializa la resolución.

### Flujo UI — Devolución

1. Ir a `/ventas/[id]` de una venta `PAID`. Click **Nueva devolución**.
2. Modal: seleccionar items + qty. Cada item tiene radio "Vendible / Dañado".
3. Seleccionar método de reembolso. Click **Confirmar**.
4. Verificar: la devolución aparece en `/devoluciones`. Caja `/caja` tiene transacción `OUT` con monto. Si `SELLABLE`, stock subió.
5. **Cancelar devolución** desde el detalle → reversión atómica.

### Flujo UI — Garantía

1. Ir a `/ventas/[id]`. Click **Abrir garantía**.
2. Seleccionar item + descripción de la falla. **Crear**.
3. En `/garantias` → cambiar status: `OPEN` → `IN_REVIEW` → `APPROVED`.
4. Si la resolución implica devolución, crear una devolución y luego volver a la garantía y vincular vía botón "Vincular devolución".
5. Cerrar con `RESOLVED`.

### Casos borde

- **Devolver más de lo vendido:** `400`. El form ya bloquea con el max derivado de `returned-qty`.
- **Garantía sin saleItem:** garantía "comodín" sin link directo (campo opcional). Útil si el cliente trae un producto sin boleta — registrarla igual para histórico.

---

## Fase 7.7 — Guías de despacho

### Qué es

Generar **Guía de despacho** con correlativo `DESP-AAAA-NNNNN`, dirección de entrega (default = dirección del cliente, editable), transportista con autocomplete de "transportistas recientes", PDF Carta/80mm. Anulación con motivo. Si la venta origen se cancela, las guías activas se anulan en cascada (motivo: "Venta cancelada — guía anulada automáticamente").

### Endpoints

#### `GET /api/dispatch`
Lista. Query: `status` (ACTIVE|VOID), `q`, `dateFrom`, `dateTo`.

#### `GET /api/dispatch/recent-carriers`
Top 10 transportistas usados recientemente (orden por uso descendente, últimos 90 días).

#### `GET /api/dispatch/by-sale/:saleId/active`
Devuelve la guía ACTIVA de una venta o `null`. Lo usa `/ventas/[id]` para decidir el botón "Generar guía" vs "Ver guía existente".

#### `POST /api/dispatch`
Crear guía.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "saleId": "<uuid>",
    "shipDate": "2026-05-17T10:00:00.000Z",
    "address": "Av. Providencia 1234, Providencia, RM",
    "carrierName": "Starken",
    "carrierContact": "+56 9 1234 5678",
    "trackingNumber": "ST-987654",
    "notes": "Entregar entre 9 y 18"
  }'
```

**Respuesta 201:** guía con `number=DESP-2026-00001`, `status=ACTIVE`.

**Errores:**
- `404` — `saleId` no existe.
- `409` — la venta ya tiene una guía activa (sólo una a la vez; anular la actual primero).
- `409` — venta cancelada.

#### `POST /api/dispatch/:id/void`
Anular.
```json
{ "reason": "Producto no entregado, cliente reagendó" }
```

#### `GET /api/dispatch/:id/pdf?format=letter|thermal80`
PDF.

### Flujo UI

1. Ir a `/ventas/[id]` de venta `PAID`. Botón **Generar guía**.
2. Modal pre-llena dirección con la del cliente; editar si corresponde.
3. Carrier: tipear → aparecen los usados recientes. Seleccionar o tipear uno nuevo.
4. Tracking + notas opcionales. **Generar**.
5. En `/guias` aparece con `number=DESP-2026-00001`. Click → ver detalle. **Imprimir** → Carta o 80mm.
6. **Anular guía** con motivo (≥5 chars).
7. Cancelar la venta origen → verificar que la guía pasó a `VOID` automáticamente con motivo "Venta cancelada — guía anulada automáticamente".

### Casos borde

- **Generar segunda guía mientras una activa existe:** UI muestra "Ver guía existente". API responde `409` si se fuerza.
- **PDF de guía anulada:** se genera con marca de agua "ANULADA" en el header.

---

## Fase 8 — Reportes + proyección de stock

### Qué es

**Proyección de stock crítico** con cálculo `coverageDays = totalStock / dailyConsumption` basado en consumo de los últimos 90 días + `suggestedOrder = max(0, dailyConsumption × (leadTimeDays + 30) − totalStock)`. Default `leadTimeDays=75` (configurable en `/configuracion`). 3 reportes core con CSV: **ventas** (toda la operación con totales por método de pago), **IVA** (débito de ventas + crédito de compras), **flujo de caja** (todas las transacciones).

### Endpoints

#### `GET /api/projection?leadTimeDays=75&all=0`
Proyección. Default `onlyCritical=true` (sólo productos con `isCritical=true`). `?all=1` para ver todos.

**Respuesta 200:**
```json
{
  "rows": [
    {
      "productId": "uuid", "sku": "FIL-001", "name": "Filtro aceite Corolla",
      "totalStock": 12, "dailyConsumption": 2.3,
      "coverageDays": 5, "stockoutDate": "2026-05-21",
      "suggestedOrder": 230, "isCritical": true,
      "warnLevel": "danger"
    }
  ],
  "leadTimeDays": 75,
  "totalProducts": 1
}
```

#### `GET /api/projection/export.csv?all=1`
CSV con BOM UTF-8 (Excel detecta acentos). Headers en español.

#### `GET /api/reports/sales?dateFrom=2026-05-01&dateTo=2026-05-31`
Reporte de ventas. Devuelve `{ rows: [...], totals: {...} }`. Filas incluyen estado, método de pago, subtotal, IVA, total. Totales sólo cuentan ventas activas (no canceladas).

#### `GET /api/reports/sales.csv?dateFrom=...&dateTo=...`
CSV de ventas.

#### `GET /api/reports/iva?dateFrom=...&dateTo=...`
Reporte IVA. Devuelve `{ salesRows, purchaseRows, totals: { taxDebit, taxCredit, taxNet, ... } }`. Débito = IVA de ventas activas. Crédito = IVA de compras.

#### `GET /api/reports/iva.csv?dateFrom=...&dateTo=...`
CSV combinado: ventas (tipo `VENTA`) + compras (tipo `COMPRA`).

#### `GET /api/reports/cash-flow?dateFrom=...&dateTo=...`
Flujo de caja. Devuelve `{ rows, totals: { income, expense, net } }`.

#### `GET /api/reports/cash-flow.csv?dateFrom=...&dateTo=...`
CSV de flujo. Incluye columna `Anulada` (SI/NO).

### Flujo UI

1. **Proyección** (sidebar → Reportes → Proyección).
2. Verificar columnas: SKU, Producto, Stock total, Consumo/día, Cobertura (días), Quiebre (fecha), Pedido sugerido.
3. Toggle "Ver todos" → carga catálogo completo (puede ser lento).
4. Cambiar `leadTime` override → recalcula `suggestedOrder` en vivo.
5. Click **Exportar CSV** → descarga `proyeccion-criticos-2026-05-16.csv`. Abrir en Excel — los acentos se ven bien (BOM UTF-8).
6. Ir a **Reportes → Ventas**. Filtrar por rango. Tabla con filas tachadas (line-through) si cancelled — los totales sólo cuentan las activas.
7. **Reportes → IVA**. 4 cards arriba (Débito, Crédito, Neto, # documentos). Tabs Ventas / Compras.
8. **Reportes → Flujo de caja**. Income / Expense / Net en cards. Tabla con tipo (`IN`/`OUT`), origen (`SALE`/`PURCHASE`/`MANUAL`/...), método.

### Casos borde

- **Producto sin ventas en 90 días:** `dailyConsumption=0`, `coverageDays=null`, `suggestedOrder=0`, `isCritical=false`.
- **`dateFrom` > `dateTo`:** API responde `400`.
- **Productos sin stock:** `coverageDays=0`, `stockoutDate=hoy`, `warnLevel=danger`.

---

## Fase 8.5 — Lead lifecycle + Seguimiento comercial + HubSpot push

### Qué es

Formaliza el flujo comercial: cada cliente tiene un `lifecycleStatus` calculado automáticamente desde eventos del sistema:

- `NEW` (creación manual)
- `QUOTED` (al crear cotización con `customerId` no nulo)
- `FOLLOW_UP` (cron diario a las 00:30 AM Santiago detecta `nextFollowUpAt < now` en estado `QUOTED`)
- `WON` (al confirmar venta — `nextFollowUpAt=null`, `lostReason=null`)
- `LOST` (manual con motivo ≥5 chars)

**WhatsApp como identificador primario** (`customer.whatsappPhone`, E.164). Bandeja `/seguimiento` con 4 tabs: Pendientes / Sin respuesta / Vencidos / Último contacto. **HubSpot push one-way** via outbox pattern (`hubspot_sync_jobs` table) — drainer corre cada minuto, hasta 25 jobs, 3 intentos con backoff exponencial. **Off-by-default** — toggle en `/configuracion`. Stub actual: el `pushToHubspot()` devuelve un id sintético (`hs-stub-<8chars>`) hasta instalar `@hubspot/api-client`.

### Endpoints — Lifecycle

#### `GET /api/follow-ups?tab=pending&q=&page=1&pageSize=20`
Bandeja paginada. `tab`:
- `pending` — `lifecycleStatus IN (QUOTED, FOLLOW_UP) AND nextFollowUpAt <= now`
- `no_response` — `FOLLOW_UP` (ya pasó el primer recordatorio)
- `overdue` — `FOLLOW_UP AND nextFollowUpAt < now - 7 days`
- `last_contact` — todos ordenados por `lastContactAt DESC`

**Respuesta 200:**
```json
{
  "rows": [
    {
      "customer": { "id": "uuid", "name": "Juan Pérez", "whatsappPhone": "+56912345678", "lifecycleStatus": "QUOTED", "lastContactAt": "2026-05-14T...", "nextFollowUpAt": "2026-05-16T..." },
      "lastQuotation": { "id": "uuid", "number": "COT-2026-00012", "total": "150000.00" }
    }
  ],
  "total": 1, "page": 1, "pageSize": 20
}
```

#### `POST /api/customers/:id/touch`
Marca contacto manual. Actualiza `lastContactAt=now` y reprograma `nextFollowUpAt=now+followUpHoursDefault`. Crea evento `MANUAL_TOUCH` en `lead_events`.

**Respuesta 200:** `{ "customer": {...customer actualizado}, "event": {...} }`

#### `POST /api/customers/:id/mark-lost`
```json
{ "reason": "Cliente eligió competencia por precio" }
```

Marca `lifecycleStatus=LOST` + `lostReason`. Crea evento `MARKED_LOST`. Encola job HubSpot.

**Errores:**
- `400` — `reason` < 5 chars.
- `404` — cliente no existe.

### Endpoints — HubSpot

#### `POST /api/hubspot/test`
Test de configuración. Valida que el toggle esté ON y la API key presente.

**Respuesta 200:**
```json
{ "ok": true, "stub": true, "message": "Stub activo — falta @hubspot/api-client" }
```

**Errores:**
- `400` — `hubspotEnabled=false` en settings.
- `400` — API key faltante.

### Endpoints — Settings (extendidos en 8.5)

#### `PATCH /api/settings/company`
Nuevos campos:
```json
{
  "followUpHoursDefault": 48,
  "hubspotEnabled": false,
  "hubspotDefaultOwnerId": "12345",
  "whatsappFollowUpTemplate": "Hola {cliente}, te escribo por la cotización {cotizacion} de {total}..."
}
```

### Endpoints — Customers (extendidos en 8.5)

#### `POST /api/customers` / `PATCH /api/customers/:id`
Nuevos campos opcionales: `source` (enum: WALK_IN | REFERRAL | WHATSAPP | EMAIL | INSTAGRAM | OTHER), `whatsappPhone` (E.164 normalizado, ej. `+56912345678`).

**Errores:**
- `400` — `whatsappPhone` con formato no E.164 → mensaje "El teléfono de WhatsApp debe ser válido (E.164)".

### Flujo UI

1. **Configuración → Seguimiento + HubSpot**:
   - Activar toggle "HubSpot habilitado". Tipear API key (cualquier string para el stub). Tipear `defaultOwnerId`.
   - Plantilla WhatsApp: `Hola {cliente}, sobre la cotización {cotizacion} de {total}, ¿seguimos?`.
   - `followUpHoursDefault`: 48.
   - Click **Test sync** → toast verde "Stub activo" (cuando se instale `@hubspot/api-client`, el endpoint hará un GET read-only a HubSpot).
2. **Nuevo cliente**: form ahora tiene campos **Origen** (select) y **WhatsApp** (input phone). Crear con `source=WHATSAPP` y `whatsappPhone=+56912345678`.
3. **Crear cotización** para ese cliente → verificar:
   - El badge en el form del cliente cambia a `QUOTED`.
   - "Último contacto" se setea ahora.
   - `nextFollowUpAt = now + 48h`.
   - En la tabla `lead_events` se inserta un row `type=QUOTATION_CREATED`.
4. **Bandeja /seguimiento**: 4 tabs visibles. Click "Pendientes" — el cliente aparece (`nextFollowUpAt` ya está cerca).
5. Botones por fila:
   - **WhatsApp** → abre `wa.me/<phone>?text=<plantilla con tokens reemplazados>`.
   - **Marcar contacto** → `lastContactAt=now`, reprograma `nextFollowUpAt`. Toast "Contacto registrado".
   - **Marcar perdido** → modal con `reason` (≥5 chars). Confirmar. El cliente desaparece de "Pendientes" y aparece en "Último contacto" con badge rojo `LOST`.
   - **Ver cotizaciones** → navega a `/cotizaciones?customerId=<id>`.
6. **Confirmar venta** desde la cotización → cliente pasa a `WON` automáticamente, `nextFollowUpAt=null`.
7. **Cron diario** (00:30 Santiago): marca todos los `QUOTED` con `nextFollowUpAt < now` como `FOLLOW_UP`. Para forzarlo en testing, mover el system time, o usar `await lifecycleService.markOverdueAsFollowUp()` desde un script.
8. **Outbox HubSpot**: después de crear/editar cliente o cambiar lifecycle, verificar en DB:
   ```sql
   SELECT * FROM hubspot_sync_jobs ORDER BY createdAt DESC LIMIT 5;
   ```
   Aparece un row `status=PENDING`. El cron (cada minuto) lo procesa: `PENDING → PROCESSING → DONE` (con `hubspotContactId='hs-stub-xxxx'` seteado en el cliente). Si `hubspotEnabled=false` el job pasa a `SKIPPED`.

### Casos borde

- **Toggle HubSpot OFF + crear cliente:** se encola igual el job pero el drainer lo marca `SKIPPED` sin tocar nada externo.
- **3 fallos consecutivos:** el job pasa a `FAILED`. Próximo intento manual → no automático. Backoff: `5min × 5^attempts` (5min, 25min, 125min).
- **whatsappPhone no E.164** (ej. `912345678` sin código país): `400` en create/update con mensaje específico.
- **Cliente perdido + nueva cotización:** queda como `QUOTED` de nuevo (`LOST` no es terminal — el operador puede recuperar el lead).
- **Plantilla WhatsApp con tokens no reemplazables** (ej. `{xyz}`): se deja literal. Tokens válidos: `{cliente}`, `{cotizacion}`, `{total}`.

---

## Ronda 4 — Responsive móvil

### Qué es

Hacer el sistema operable desde teléfono. **Sidebar fijo `<aside>`** desaparece en `<md` (768px) y se reemplaza por un **drawer** (`<Sheet>` de shadcn) que se abre con un botón hamburger en el header. Tablas con scroll horizontal + **primera columna sticky** para que SKU/Número quede siempre visible. Tabs con scroll horizontal si overflowan. Header colapsa el email del usuario. FAB queda fijo bottom-right con `pb-24` en el `<main>` para que la última fila de la tabla no quede tapada.

### Archivos clave

- [`apps/web/components/ui/sheet.tsx`](apps/web/components/ui/sheet.tsx) — primitiva drawer basada en `@radix-ui/react-dialog`.
- [`apps/web/components/sidebar.tsx`](apps/web/components/sidebar.tsx) — ahora expone `SidebarNav` + `useCompanyName` para reuso entre desktop y mobile.
- [`apps/web/components/mobile-nav.tsx`](apps/web/components/mobile-nav.tsx) — drawer + botón hamburger (`md:hidden`).
- [`apps/web/app/(dashboard)/layout.tsx`](apps/web/app/(dashboard)/layout.tsx) — header responsive, `pb-24` en mobile.
- [`apps/web/components/ui/table.tsx`](apps/web/components/ui/table.tsx) — prop `stickyFirstColumn` que aplica clase CSS condicional.
- [`apps/web/app/globals.css`](apps/web/app/globals.css) — `.sticky-first-col` con regla `position: sticky; left: 0; bg-card` en `<md`, normal en `md+`.
- [`apps/web/components/ui/tabs.tsx`](apps/web/components/ui/tabs.tsx) — TabsList con `overflow-x-auto` para scroll horizontal en mobile.
- [`apps/web/components/quick-search.tsx`](apps/web/components/quick-search.tsx) — icon-only en mobile, full text + atajo Cmd+K en `sm+`.

### Sin endpoints nuevos

Ronda 4 es 100% frontend. No hay cambios en API ni en DB.

### Flujo UI — probar en DevTools

1. Abrir `http://localhost:3000` en Chrome/Edge.
2. F12 → Toggle device toolbar (Ctrl+Shift+M). Seleccionar **iPhone SE (375×667)** o **Galaxy S20 Ultra (412×915)**.
3. Login.
4. **Sidebar desaparece**, queda sólo el header con:
   - Botón hamburger (≡) a la izquierda.
   - Lupa (icon-only) al lado.
   - ThemeToggle + LogoutButton a la derecha (el email del usuario está oculto).
5. **Click hamburger** → drawer entra desde la izquierda con la misma navegación. Click en cualquier link → navega + drawer se cierra solo.
6. Click backdrop oscuro → drawer cierra.
7. Tap "Productos" → la tabla scrollea horizontal con el dedo. **Verificar:** la columna del SKU/thumbnail queda pegada al borde izquierdo mientras el resto scrollea (sombra sutil al lado por el `bg-card`).
8. Igual en `/inventario`, `/ventas`, `/transferencias`, `/cotizaciones`, `/compras`, `/devoluciones`, `/garantias`, `/guias`, `/seguimiento`, `/gastos`, `/caja`, `/proyeccion`, `/reportes/*`, `/clientes`, `/proveedores`, `/almacenes`, `/vehiculos`.
9. Tap el FAB (+) abajo a la derecha → abre modal "Venta o Cotización". Modal full-width en mobile.
10. **`/seguimiento`** con 4 tabs ("Pendientes" / "Sin respuesta" / "Vencidos" / "Último contacto") → si no entran, la TabsList scrollea horizontal (no overflow al body).
11. Scroll hasta el final de cualquier tabla → la última fila **no queda tapada** por el FAB (gracias al `pb-24` del `<main>`).
12. Crear venta con FAB → SaleForm en mobile: tabs scrollean si hace falta. Items en tabla horizontal-scrollable. Botones del footer wrap con `flex-wrap`.
13. Rotar a landscape (737×414) → el sidebar desktop debe **seguir oculto** porque `md` (768px) sigue sin alcanzar. En 768+ vuelve el sidebar fijo.

### Casos borde

- **Drawer abierto + cambio de ruta por back/forward:** el `useEffect([pathname])` cierra el drawer defensivamente.
- **QuickSearch con Cmd+K en mobile:** el atajo sigue funcionando si tenés teclado bluetooth.
- **Tablas en una pantalla muy ancha (tablet landscape >=768px):** el sticky se desactiva (vuelve a `position: static`) porque hay espacio para mostrar todas las columnas.
- **Hover en sticky cell:** el bg-card cubre el hover effect de la fila — aceptado, ya que touch users no ven hover.

---

## Apéndice — Inspeccionar la base de datos

Comandos útiles para verificar el estado durante el testing:

```sql
-- Lifecycle del cliente
SELECT id, name, lifecycleStatus, lastContactAt, nextFollowUpAt, lostReason, hubspotContactId
FROM customer ORDER BY updatedAt DESC LIMIT 10;

-- Últimos jobs de HubSpot
SELECT id, customerId, status, attempts, scheduledAt, lastError
FROM hubspot_sync_jobs ORDER BY createdAt DESC LIMIT 10;

-- Eventos lifecycle
SELECT id, customerId, type, createdAt, userId
FROM lead_events ORDER BY createdAt DESC LIMIT 20;

-- Cotizaciones recientes
SELECT id, number, status, customerId, customerNameSnapshot, total, sentAt
FROM quotation ORDER BY createdAt DESC LIMIT 10;

-- Ventas
SELECT id, number, status, customerId, paymentMethod, total, cashCommissionAmount
FROM sale ORDER BY createdAt DESC LIMIT 10;

-- Stock por bodega
SELECT s.productId, p.sku, s.warehouseId, w.name, s.quantity, s.locationCode
FROM stock s
JOIN product p ON p.id = s.productId
JOIN warehouse w ON w.id = s.warehouseId
WHERE p.sku = 'FIL-001';

-- Transacciones de caja
SELECT id, type, source, paymentMethod, amount, description, isVoided
FROM cash_transaction ORDER BY createdAt DESC LIMIT 20;
```

---

## Apéndice — Refrescar token si expira

```bash
# Si la cookie access_token expiró (15 min), refrescar con:
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/refresh
```

La cookie `refresh_token` vive 7 días y se setea en path `/api/auth`. Si también expiró, hacer login de nuevo.
