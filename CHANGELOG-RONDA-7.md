# Ronda 7 — Bugfixes y mejoras transversales

Bundle de 13 fixes / mejoras pedidas sobre módulos ya entregados (Fases 2–8.5). Sin breaking changes para el operador; sí hay cambios de schema (1 migración nueva) que se aplican con `pnpm --filter @inventory/api db:migrate`.

> **Antes de testear**, aplicá las migraciones:
> ```bash
> pnpm --filter @inventory/api db:migrate
> ```

---

## 1. Cotización — Validación de stock global agregado

### Qué cambia

Al crear/editar una cotización, ahora el sistema muestra **stock total disponible sumando TODAS las bodegas activas** (antes solo mostraba el stock de la bodega default, lo que subestimaba la disponibilidad real). El badge debajo de cada cantidad dice "Stock total: X" y se pone ámbar si la cantidad pedida excede el stock total.

La validación sigue siendo **no bloqueante** — el operador puede crear una cotización aunque no haya stock (lead time de importación 2-3 meses), pero el banner ámbar al final de la tabla detalla los items afectados.

### Cómo testear

1. Crear una cotización con un producto que tenga stock en 2 bodegas distintas.
2. Verificar que el badge muestre "Stock total: X" donde X = suma de ambas bodegas.
3. Tipear una cantidad mayor al stock total → el badge pasa a ámbar "Stock total: 5 (faltan 3)" + banner ámbar al final con la lista.
4. Click **Crear** → la cotización se guarda igual (warning informativo, no bloquea).

### Archivos

- Backend: [apps/api/src/sales/sales.service.ts](apps/api/src/sales/sales.service.ts) — método `availableStock` ahora acepta `aggregate=true` y suma stock con `SUM(quantity) GROUP BY productId`.
- Backend: [apps/api/src/sales/sales.controller.ts](apps/api/src/sales/sales.controller.ts) — endpoint `GET /sales/available-stock?aggregate=1`.
- Frontend: [apps/web/lib/sales-api.ts](apps/web/lib/sales-api.ts) — `getAvailableStock(productIds, warehouseId, aggregate)`.
- Frontend: [apps/web/components/forms/quotation-form.tsx](apps/web/components/forms/quotation-form.tsx) — pasa `aggregate: true`.

---

## 2. Reclamos y Garantías — Traducir estados al español

### Qué cambia

El dialog "Cambiar estado" del detalle de garantías mostraba `IN_REVIEW → APPROVED` (IDs internos). Ahora muestra `En revisión → Aprobado` con labels en español. Los badges ya estaban traducidos; lo que faltaba era el dialog title.

### Cómo testear

1. Ir a **Garantías** → click en una garantía abierta.
2. Click "Pasar a revisión" → modal con título "Cambiar estado: **Abierto → En revisión**" (antes decía "OPEN → IN_REVIEW").
3. Lo mismo en todas las transiciones: aprobar, rechazar, resolver.

### Archivos

- [apps/web/app/(dashboard)/garantias/[id]/page.tsx](apps/web/app/(dashboard)/garantias/[id]/page.tsx) — agregado `STATUS_LABELS` con los 5 labels y usado en el dialog title.

---

## 3. Devoluciones — Producto dañado registra movimiento

### Qué cambia

Cuando se procesa una devolución con condición **Dañado**, antes el movimiento se descartaba silenciosamente y desaparecía del historial. Ahora se registra un movimiento de tipo nuevo **`RETURN_IN_DAMAGED`** que aparece en `/inventario/movimientos` con un badge rojo "Dev. dañada (sin stock)".

El stock **NO se modifica** (el producto dañado se descarta), pero el evento queda en auditoría para que se pueda rastrear qué pasó.

### Cómo testear

1. Tener una venta `PAID` con al menos 1 item.
2. Ir a `/ventas/[id]` → click **Nueva devolución** → marcar el item como **Dañado**.
3. Confirmar.
4. Ir a `/inventario/movimientos` → aparece una fila con tipo **"Dev. dañada (sin stock)"** (badge rojo), `qty` = cantidad devuelta, sin que el stock haya cambiado.
5. Verificar que el stock del producto **no subió** (compare con `/inventario`).
6. Si todos los items son dañados, **no se crea movimiento de RETURN_IN** (solo el `RETURN_IN_DAMAGED`).
7. Mezclar condición: devolver 2 unidades como **Vendible** y 1 como **Dañado** → en `/inventario/movimientos` aparecen dos filas: `RETURN_IN` (qty=2, suma stock) y `RETURN_IN_DAMAGED` (qty=1, no suma).

### Archivos

- Migración: [apps/api/src/database/migrations/1779700000000-Round7BugfixesBundle.ts](apps/api/src/database/migrations/1779700000000-Round7BugfixesBundle.ts) — extiende `inventory_movements.type` enum con `RETURN_IN_DAMAGED`.
- Shared: [packages/shared/src/enums.ts](packages/shared/src/enums.ts) — `InventoryMovementType.RETURN_IN_DAMAGED`.
- Shared: [packages/shared/src/types.ts](packages/shared/src/types.ts) — `MovementDto['type']` incluye el nuevo valor.
- Backend: [apps/api/src/inventory/inventory.service.ts](apps/api/src/inventory/inventory.service.ts) — nuevo método `recordMovementWithoutStockImpact()` que inserta en `inventory_movements` sin tocar `stocks`.
- Backend: [apps/api/src/returns/returns.service.ts](apps/api/src/returns/returns.service.ts) — `create()` ahora emite `RETURN_IN_DAMAGED` cuando la condición es `DAMAGED`.
- Frontend: [apps/web/app/(dashboard)/inventario/movimientos/page.tsx](apps/web/app/(dashboard)/inventario/movimientos/page.tsx) — agregada opción en filtro `MOVEMENT_TYPES` y badge rojo con label "Dev. dañada (sin stock)".

---

## 4. Configuración — Reorganizada en tabs

### Qué cambia

La página `/configuracion` mostraba 3 secciones apiladas verticalmente que obligaban a scrollear. Ahora son **3 tabs**: **Comercial / Seguimiento y HubSpot / Categorías de gasto**.

### Cómo testear

1. Ir a **Configuración**.
2. Verificar 3 tabs en la barra superior.
3. **Comercial**: IVA, comisión tarjeta, lead time default.
4. **Seguimiento y HubSpot**: follow-up hours, toggle HubSpot, API key (env), owner ID, plantilla WhatsApp + botón "Test sync".
5. **Categorías de gasto**: card con link a `/configuracion/categorias-gasto`.

### Archivos

- [apps/web/app/(dashboard)/configuracion/page.tsx](apps/web/app/(dashboard)/configuracion/page.tsx) — wrap del contenido en `<Tabs>` con 3 `<TabsTrigger>`.

---

## 5. Categorías — Detalle + selección múltiple

### Qué cambia

Click en el nombre de una categoría en `/categorias` ahora abre **`/categorias/[id]`** con:

- Listado paginado de los productos de esa categoría (SKU, nombre, marca, precio).
- Búsqueda por SKU/nombre.
- **Checkboxes** en cada fila + header (seleccionar todos en la página actual).
- Dos acciones masivas: **Desvincular** (categoría = null) y **Mover a otra categoría** (selector).

### Cómo testear

1. Ir a **Categorías** → click en cualquier nombre (es link).
2. Se abre el detalle con los productos asociados.
3. Marcar 2-3 productos con los checkboxes.
4. Aparece la barra de acciones: "X productos seleccionados — Desvincular | Mover a otra categoría | Limpiar selección".
5. **Desvincular** → modal de confirmación → confirmar → toast "X productos desvinculados". Los productos desaparecen de la lista (porque ya no pertenecen a esta categoría).
6. **Mover** → modal con dropdown de otras categorías → elegir destino → confirmar → toast "X productos movidos". Los productos desaparecen de esta lista y aparecen en la categoría destino.

### Archivos

- Backend: [apps/api/src/products/products.service.ts](apps/api/src/products/products.service.ts) — `bulkUpdateCategory(productIds, categoryId)`.
- Backend: [apps/api/src/products/products.controller.ts](apps/api/src/products/products.controller.ts) — `PATCH /products/bulk-category`.
- Frontend: [apps/web/lib/catalog-api.ts](apps/web/lib/catalog-api.ts) — `bulkUpdateProductCategory()`.
- Frontend: [apps/web/components/simple-name-list.tsx](apps/web/components/simple-name-list.tsx) — prop opcional `getDetailHref` que renderiza el nombre como link.
- Frontend: [apps/web/app/(dashboard)/categorias/page.tsx](apps/web/app/(dashboard)/categorias/page.tsx) — pasa `getDetailHref`.
- Frontend: [apps/web/app/(dashboard)/categorias/[id]/page.tsx](apps/web/app/(dashboard)/categorias/[id]/page.tsx) — página de detalle con bulk actions.

---

## 6. Alertas — Reemplazar `confirm()` nativo por modal custom

### Qué cambia

Las 7 confirmaciones destructivas que usaban `window.confirm()` (eliminar imagen de producto, eliminar categoría/marca/modelo, eliminar proveedor, eliminar bodega, anular gasto, eliminar categoría de gasto) ahora usan un **modal con el diseño visual de la app** (light/dark theme respetado, botones con variantes).

### Cómo testear

1. **Producto** → galería de imágenes → eliminar imagen → modal "¿Eliminar esta imagen?".
2. **Categorías / Marcas** → eliminar fila → modal con descripción de qué se borra.
3. **Vehículos (modelos)** → eliminar → modal.
4. **Proveedores** → eliminar → modal con advertencia "Si tiene compras asociadas la operación va a fallar".
5. **Almacenes** → eliminar → modal explicando que si tiene movimientos se desactivará en lugar de borrar.
6. **Gastos** → anular → modal con advertencia "se generará compensación en caja".
7. **Configuración → Categorías de gasto** → eliminar → modal.
8. **Confirmar** → ejecuta la acción + toast verde. **Cancelar** o click fuera → no pasa nada.

### Archivos

- Nuevo: [apps/web/components/confirm-dialog.tsx](apps/web/components/confirm-dialog.tsx) — componente reusable.
- Modificados (7): product-image-gallery, simple-name-list, proveedores/page, almacenes/page, vehiculos/page, gastos/page, configuracion/categorias-gasto/page.

---

## 7. Marcas / Vehículos / Modelos — Detalle con productos asociados

### Qué cambia

Click en el nombre de una marca abre `/marcas/[id]` con los productos de esa marca. Click en una marca de vehículo abre `/vehiculos/marcas/[id]` con sus modelos + productos compatibles. Click en un modelo abre `/vehiculos/modelos/[id]` con los productos compatibles con ese modelo.

**Sin selección múltiple** ni acciones masivas (a diferencia de Categorías) — solo navegación + búsqueda.

### Cómo testear

1. **Marcas** → click en una marca → ver productos de esa marca. Click en un SKU → /productos/[id].
2. **Vehículos → Marcas** → click en una marca → ver modelos + productos compatibles con toda la marca.
3. **Vehículos → Modelos** → click en un modelo → ver productos compatibles con ese modelo específico.

### Archivos

- [apps/web/app/(dashboard)/marcas/[id]/page.tsx](apps/web/app/(dashboard)/marcas/[id]/page.tsx) — nuevo.
- [apps/web/app/(dashboard)/vehiculos/marcas/[id]/page.tsx](apps/web/app/(dashboard)/vehiculos/marcas/[id]/page.tsx) — nuevo.
- [apps/web/app/(dashboard)/vehiculos/modelos/[id]/page.tsx](apps/web/app/(dashboard)/vehiculos/modelos/[id]/page.tsx) — nuevo.
- [apps/web/app/(dashboard)/marcas/page.tsx](apps/web/app/(dashboard)/marcas/page.tsx) y [apps/web/app/(dashboard)/vehiculos/page.tsx](apps/web/app/(dashboard)/vehiculos/page.tsx) — link al detalle en el nombre.

---

## 8. Stock — Click en producto redirige al detalle

### Qué cambia

En `/inventario`, las celdas SKU y Nombre de cada fila ahora son links a `/productos/[id]`. Las demás celdas (ubicación, ajustar) mantienen sus interacciones propias.

### Cómo testear

1. Ir a **Inventario** → click en SKU o nombre de cualquier producto → abre el detalle.
2. Los demás controles (ubicación inline, botón ajustar) siguen funcionando igual.

### Archivos

- [apps/web/app/(dashboard)/inventario/page.tsx](apps/web/app/(dashboard)/inventario/page.tsx) — envuelve celdas en `<Link>`.

---

## 9. Transferencias — Botón "Max" en cantidad

### Qué cambia

En el form de nueva transferencia, al lado del input de cantidad de cada item hay ahora un botón **"Max"** que completa automáticamente con el stock disponible en la bodega origen. Si todavía no se cargó el stock o es 0, el botón queda deshabilitado.

### Cómo testear

1. Ir a **Transferencias** → **Nueva transferencia**.
2. Elegir bodega origen y destino (distintas).
3. Agregar un producto → aparece el badge "Stock origen: X" y el botón "Max".
4. Click **Max** → el input se llena con X.
5. Aumentar más allá de X → input se pone rojo + badge ámbar (es bloqueante en transferencias, a diferencia de cotizaciones).

### Archivos

- [apps/web/components/forms/transfer-form.tsx](apps/web/components/forms/transfer-form.tsx) — botón "Max" al lado del input de qty.

---

## 10. Compras — Multi-factura (PDF + imágenes)

### Qué cambia

Antes una compra solo permitía **1 archivo** de factura. Ahora soporta **N archivos** (PDF + JPG/PNG/WEBP), gestionados como tabla relacional `purchase_invoices` (1→N).

Cambios en la UI:
- **Form de nueva compra**: el input acepta varios archivos a la vez (`multiple`); lista con cada uno + botón X para descartar antes de confirmar.
- **Detalle de compra (`/compras/[id]`)**: página nueva que permite agregar/eliminar facturas también después de creada la compra.
- **Listado de compras**: la columna "Factura" pasó a "Facturas" y muestra `×N` si hay más de una.

### Cómo testear

1. Ir a **Compras → Nueva entrada**.
2. Click **Subir facturas** → seleccionar 2 archivos a la vez (Shift/Ctrl+click). Quedan ambos en la lista.
3. Confirmar compra → toast OK.
4. Volver a `/compras` → la fila muestra **icono paperclip + ×2**.
5. Click en la fecha de la compra → abre `/compras/[id]`.
6. En la sección "Facturas adjuntas" se ven los 2 archivos con su nombre + fecha de subida + botón eliminar.
7. **Agregar archivo** desde el detalle → seleccionar otro PDF → toast "1 archivo agregado" → la lista se actualiza.
8. **Eliminar** un archivo → modal de confirmación → confirmar → desaparece de la lista (y se borra físicamente del servidor).

### Errores esperados

- Subir un `.txt` → toast "formato no permitido (PDF/JPG/PNG/WEBP)".
- Subir un archivo > 10 MB → toast "supera 10 MB".

### Archivos

- Migración: [apps/api/src/database/migrations/1779700000000-Round7BugfixesBundle.ts](apps/api/src/database/migrations/1779700000000-Round7BugfixesBundle.ts) — crea `purchase_invoices`, backfillea `purchase_entries.invoiceUrl` y elimina la columna vieja.
- Entity: [apps/api/src/database/entities/purchase-invoice.entity.ts](apps/api/src/database/entities/purchase-invoice.entity.ts) — nueva.
- Shared: [packages/shared/src/types.ts](packages/shared/src/types.ts) — `PurchaseInvoiceDto`, `PurchaseEntryDto.invoices`.
- Backend: [apps/api/src/purchases/dto.ts](apps/api/src/purchases/dto.ts) — `invoiceUrls?: string[]`, `AddInvoicesDto`.
- Backend: [apps/api/src/purchases/purchases.service.ts](apps/api/src/purchases/purchases.service.ts) — `addInvoices`, `removeInvoice`, filtros nuevos.
- Backend: [apps/api/src/purchases/purchases.controller.ts](apps/api/src/purchases/purchases.controller.ts) — `POST /purchases/:id/invoices`, `DELETE /purchases/:id/invoices/:invoiceId`.
- Frontend: [apps/web/lib/inventory-api.ts](apps/web/lib/inventory-api.ts) — `addPurchaseInvoices`, `removePurchaseInvoice`.
- Frontend: [apps/web/app/(dashboard)/compras/nuevo/page.tsx](apps/web/app/(dashboard)/compras/nuevo/page.tsx) — input multiple.
- Frontend nuevo: [apps/web/app/(dashboard)/compras/[id]/page.tsx](apps/web/app/(dashboard)/compras/[id]/page.tsx) — detalle.

---

## 11. Compras — Filtros por bodega y rango de total

### Qué cambia

El listado `/compras` antes solo filtraba por proveedor + rango de fechas. Ahora también incluye:
- **Bodega destino** (selector con todas las bodegas activas + inactivas).
- **Total mínimo / máximo** (rango de monto bruto, CLP).

Todos los filtros viven en URL para compartir links/refrescar.

### Cómo testear

1. Ir a **Compras**.
2. Filtrar por bodega → solo aparecen compras a esa bodega.
3. Tipear "100000" en total mínimo → solo aparecen compras con total ≥ $100.000.
4. Tipear "500000" en total máximo → solo aparecen las que cuestan ≤ $500.000.
5. Click "Limpiar filtros" → vuelve a todas.

### Archivos

- Backend: [apps/api/src/purchases/purchases.service.ts](apps/api/src/purchases/purchases.service.ts) — `list()` usa QueryBuilder con `warehouseId`, `totalMin`, `totalMax`.
- Backend: [apps/api/src/purchases/dto.ts](apps/api/src/purchases/dto.ts) — query DTO extendido.
- Frontend: [apps/web/lib/inventory-api.ts](apps/web/lib/inventory-api.ts) — `ListPurchasesParams` incluye los nuevos campos.
- Frontend: [apps/web/app/(dashboard)/compras/page.tsx](apps/web/app/(dashboard)/compras/page.tsx) — UI de filtros.

---

## 12. Proveedores — Descargar factura desde el detalle

### Qué cambia

En el detalle de un proveedor (`/proveedores/[id]`), la tab **Compras** ahora muestra una columna **"Facturas"** con un ícono paperclip por cada archivo adjunto (hasta 3 visibles, `+N` si hay más). Click en cada uno abre el PDF/imagen en una nueva tab.

También aparece una columna de acción para abrir el detalle completo de la compra.

### Cómo testear

1. Ir a `/proveedores` → click en un proveedor que tenga compras.
2. Tab **Compras** → cada fila con factura muestra el icono.
3. Click en el icono → abre el archivo en nueva tab.
4. Click en el icono externo (última columna) → navega a `/compras/[id]` para ver detalle completo.

### Archivos

- Backend: [apps/api/src/suppliers/suppliers.service.ts](apps/api/src/suppliers/suppliers.service.ts) — `listPurchases` incluye `relations: { invoices: true }`.
- Frontend: [apps/web/components/supplier-detail.tsx](apps/web/components/supplier-detail.tsx) — render de las facturas + columna "Ver detalle".

---

## 13. Clientes — Detalle con tabs (Datos / Compras / Cotizaciones / Histórico)

### Qué cambia

El detalle de cliente (`/clientes/[id]`) antes era un solo form gigante. Ahora son **4 tabs**:

1. **Datos** — el form de edición (igual que antes).
2. **Compras** — ventas confirmadas a este cliente (número, fecha, total, método, estado).
3. **Cotizaciones** — cotizaciones emitidas (número, fecha, total, status, sentAt).
4. **Histórico** — timeline de eventos del lifecycle (cotización creada, enviada, venta confirmada, contacto manual, marcado perdido, follow-up triggered) con íconos y fecha.

### Cómo testear

1. Ir a `/clientes` → abrir cualquier cliente.
2. Tab **Datos** → el form de Fase 4 + 8.5 (con badge de lifecycle + "Marcar perdido" si aplica).
3. Tab **Compras** → si el cliente compró, aparecen las ventas con link a `/ventas/[id]`.
4. Tab **Cotizaciones** → cotizaciones emitidas con link a `/cotizaciones/[id]` y status.
5. Tab **Histórico** → timeline ordenada por fecha desc. Cada evento con su ícono + label en español + fecha + referencia (si aplica).
6. Probar con un cliente nuevo: tab Histórico vacía con mensaje "Los eventos se crean automáticamente cuando se cotiza, envía cotización, confirma venta o se marca como perdido."

### Archivos

- Backend: [apps/api/src/lifecycle/lifecycle.controller.ts](apps/api/src/lifecycle/lifecycle.controller.ts) — `GET /customers/:id/events`.
- Backend: [apps/api/src/lifecycle/lifecycle.service.ts](apps/api/src/lifecycle/lifecycle.service.ts) — `listEvents(customerId)`.
- Frontend: [apps/web/lib/lifecycle-api.ts](apps/web/lib/lifecycle-api.ts) — `listCustomerEvents`.
- Frontend nuevo: [apps/web/components/customer-detail.tsx](apps/web/components/customer-detail.tsx) — wrapper con 4 tabs.
- Frontend: [apps/web/app/(dashboard)/clientes/[id]/page.tsx](apps/web/app/(dashboard)/clientes/[id]/page.tsx) — usa el nuevo wrapper.

---

## Comandos resumen para testear todo

```bash
# 0. Reset DB + migrations + seed (BORRA datos)
mysql -u inventory -p'Inv3ntory!' -e "DROP DATABASE IF EXISTS inventory; CREATE DATABASE inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
pnpm --filter @inventory/api db:migrate
pnpm --filter @inventory/api db:seed

# 1. Arrancar
pnpm dev
# (API en :4000, Web en :3000)

# 2. Login con admin@inventory.local / admin123 y testear cada sección de
#    arriba en orden.
```

**Migraciones aplicadas:** `1779700000000-Round7BugfixesBundle` (enum + tabla `purchase_invoices` + backfill + drop `invoiceUrl`).

**Typecheck verde:** `pnpm typecheck` en los 3 packages (shared, api, web).
