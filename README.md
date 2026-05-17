# Sistema de Gestión de Inventario

Monorepo con backend NestJS y frontend Next.js para una empresa importadora y comercializadora de **repuestos automotrices**. Cubre catálogo con compatibilidad vehicular, inventario en tiempo real, cotizaciones (con envío por WhatsApp/email), ventas, caja consolidada, gastos y reportes.

El plan completo de implementación por fases está en [PLAN.md](PLAN.md).

---

## Estado actual

| Fase | Descripción | Estado |
| --- | --- | --- |
| 0 | Bootstrap monorepo (pnpm, Next.js, NestJS, MySQL local) | ✅ |
| 1 | Base de datos (21 entidades, migración inicial, seeds) + auth JWT con cookies httpOnly | ✅ |
| 2 | Catálogo de productos + compatibilidad vehicular + búsqueda global Cmd+K | ✅ |
| 3 | Inventario (compras, ajustes, movimientos, stock con semáforo) + Suppliers básico | ✅ |
| — | **Refinamientos transversales** (post Fase 3): formato monetario, paginación universal, filtros en URL, FK errors claros, eliminar producto, unicidad RUT, validaciones extra | ✅ |
| 4 | Clientes y proveedores (RUT chileno + catálogo de comunas + detalle de proveedor con tabs Datos+Compras) | ✅ |
| 4B | Catálogo extendido: código universal + códigos compatibles + galería de fotos + ORIGINAL/ALTERNATIVO + uploads infrastructure | ✅ |
| 5 | Caja, gastos, IVA, comisiones por tarjeta + factura adjunta en compras | ✅ |
| 6 | Cotizaciones + modal venta/cotización + impresión 80mm/carta + WhatsApp/email | ✅ |
| 7 | Ventas con caja integrada (warehouseId + método de pago + comisión tarjeta + cancelación atómica + PDF carta/80mm) | ✅ |
| 7.5 | Multi-bodega + transferencias entre bodegas + código de ubicación por bodega (flujo Mercado Libre Full manual) | ✅ |
| 7.6 | Devoluciones (cliente y proveedor) con condición Vendible/Dañado + reembolso atómico en caja + Garantías con lifecycle (OPEN/IN_REVIEW/APPROVED/REJECTED/RESOLVED) | ✅ |
| 7.7 | Guía de despacho con correlativo DESP-AAAA-NNNNN, dirección de entrega editable, transportista con sugerencias, PDF Carta/80mm, anulación con motivo + cascada al cancelar venta | ✅ |
| — | **Ronda 5** (bugfixes tras pruebas 0–7.7): RUT consistente, solapamiento de compatibilidades, bodega default = "Principal" + bodega activa visible en sidebar, edición y cancelación de compras | ✅ |
| 8 | Reportes + proyección de stock + lista de productos críticos (CSV/Excel) | ✅ |
| 8.5 | **Lead lifecycle + Seguimiento comercial + HubSpot push** (WhatsApp como identificador, lifecycle automático `NEW`/`QUOTED`/`FOLLOW_UP`/`WON`/`LOST`, bandeja `/seguimiento`, sync one-way a HubSpot **off-by-default — stub listo, falta `@hubspot/api-client` cuando el cliente provea API key**) | ✅ |
| — | **Ronda 4** (transversal antes de Fase 9): responsive móvil — sidebar drawer + tablas optimizadas + revisión de forms en mobile | ✅ |
| 9 | Dashboard mobile-first con KPIs **clicables** del día + alertas (iteración 9.1; gráficos 9.2 pendiente) | ✅ |
| 10 | Carga masiva Excel (upsert por SKU + auto-create categorías/marcas) | ✅ |
| 11 | Códigos de barras + etiquetas + refinamiento de plantillas | pendiente |
| 12 | Deploy (Railway + Vercel + Resend) | pendiente |
| 13 | HubSpot refinamientos post-MVP (webhook inverso + Deals + sync histórico) — base ya en Fase 8.5 | pendiente |
| 14 | Manual + video + soporte post-entrega | pendiente |

---

## Historial de correcciones (feedback del cliente)

> Bitácora de fixes de UX y bugs reportados por el cliente sobre módulos ya entregados. Cada entrada describe el problema, la solución aplicada y los archivos tocados, para no perder el contexto cuando vuelvan a aparecer dudas o se quiera auditar el motivo de un cambio.

### Ronda 7 — 2026-05-16 (bundle 13 mejoras transversales)

Detalle completo + cómo testear cada fix en [CHANGELOG-RONDA-7.md](CHANGELOG-RONDA-7.md). Resumen rápido:

1. **Cotización** — stock global agregado (suma todas las bodegas) visible en el badge + banner ámbar.
2. **Garantías** — dialog "cambiar estado" traducido al español (antes `IN_REVIEW → APPROVED`, ahora `En revisión → Aprobado`).
3. **Devoluciones** — productos dañados ahora generan movimiento `RETURN_IN_DAMAGED` en `/inventario/movimientos` (auditoría sin tocar stock).
4. **Configuración** — secciones reorganizadas en 3 tabs (Comercial / Seguimiento+HubSpot / Categorías de gasto).
5. **Categorías** — nueva página `/categorias/[id]` con productos asociados + checkboxes + bulk actions (desvincular / mover a otra categoría).
6. **Alertas** — los 7 `window.confirm()` nativos reemplazados por un `<ConfirmDialog>` con diseño consistente.
7. **Marcas / Vehículos / Modelos** — páginas de detalle nuevas (`/marcas/[id]`, `/vehiculos/marcas/[id]`, `/vehiculos/modelos/[id]`) con productos asociados.
8. **Stock** — SKU y nombre clickeables en `/inventario` → abre `/productos/[id]`.
9. **Transferencias** — botón **Max** autocompleta cantidad con el stock disponible de la bodega origen.
10. **Compras** — multi-factura (PDF + imágenes) con tabla nueva `purchase_invoices` 1→N; agregar/quitar archivos desde el detalle de la compra.
11. **Compras** — filtros nuevos por bodega y rango de total bruto.
12. **Proveedores** — detalle muestra los archivos de factura por compra + link a `/compras/[id]`.
13. **Clientes** — detalle reorganizado en 4 tabs (Datos / Compras / Cotizaciones / Histórico). El tab Histórico muestra timeline de eventos del lifecycle.

Schema afectado por la migración `1779700000000-Round7BugfixesBundle`:
- `inventory_movements.type` extiende enum con `RETURN_IN_DAMAGED`.
- Nueva tabla `purchase_invoices` (1→N) + drop de `purchase_entries.invoiceUrl`.

### Ronda 3 — 2026-05-11 (conversión cotización libre → venta)

#### 1. Cliente libre se perdía al convertir cotización en venta

- **Síntoma reportado:** al hacer "Convertir a venta" desde una cotización que había sido creada con **cliente libre** (sin selección del catálogo, solo snapshot de nombre/RUT/email/tel), el formulario de venta en `/ventas/nueva?fromQuotation=<id>` mostraba el tab "Cliente y pago" vacío. El operador no veía los datos del snapshot y solo podía elegir clientes del catálogo, perdiendo la información original.
- **Causa raíz:** decisión de Fase 7 (`Sale.customerId NOT NULL`, solo catálogo) chocaba con la flexibilidad de Fase 6 que permitía cotizaciones libres. La pantalla `/ventas/nueva` mapeaba `customer: q.customer ?? null` sin pasar los `customerNameSnapshot`, `customerTaxIdSnapshot`, etc. al `SaleForm`. El operador tenía que recrear el cliente manualmente en otra pantalla y memorizar los datos.
- **Solución:** flujo de **registrar al cliente antes de continuar** (respeta la regla "RUT obligatorio para ventas mostrador" de la decisión #14). Cuando la cotización origen es libre:
  - `/ventas/nueva` ahora arma un `customerSnapshot` con los campos del snapshot de la cotización y lo pasa al `SaleForm`.
  - El `SaleForm` detecta el snapshot y reemplaza el combobox del tab "Cliente y pago" por un **banner amarillo + card readonly** con los datos del snapshot. Botón primario "Registrar y continuar" abre un dialog. Link secundario "Elegir otro cliente del catálogo" descarta el snapshot y muestra el combobox normal (con un atajo "← Volver al snapshot" por si el operador se arrepiente).
  - El dialog [`RegisterCustomerFromSnapshotDialog`](apps/web/components/forms/register-customer-from-snapshot-dialog.tsx) pre-llena los campos del snapshot, todos editables. Si el snapshot trae un RUT válido, hace una **búsqueda silenciosa por RUT** y si encuentra un cliente existente muestra un banner verde "Ya existe un cliente con este RUT: {nombre}" con dos botones: "Usar este cliente" (selecciona el existente, no crea) o "Crear uno nuevo" (sigue con el flujo de creación). La unicidad del RUT en DB sigue como red de seguridad.
  - Tras registrar (o reusar), el SaleForm cierra el banner y prosigue normalmente con el cliente seleccionado.
- **Trazabilidad del lado backend:** [`SalesService.create`](apps/api/src/sales/sales.service.ts) ahora, además de marcar la cotización como CONVERTED, **setea `Quotation.customerId = sale.customerId`** cuando la cotización venía sin cliente del catálogo. Los snapshots se mantienen intactos como histórico de cómo se le envió originalmente al cliente. Esto se hace en la misma transacción atómica del create.
- **Edge cases manejados:**
  - Snapshot sin RUT → el campo queda vacío en el dialog y la validación de `CustomerForm` bloquea hasta que sea válido.
  - Snapshot sin ningún dato (cotización emitida vacía) → el card readonly dice "La cotización no tenía datos del cliente. Cargalos manualmente al registrar."
  - Snapshot con RUT que ya existe en el catálogo → banner verde permite reusar el cliente existente (en lugar de fallar con 409 al guardar).
  - Operador prefiere usar otro cliente del catálogo → el link "Elegir otro cliente del catálogo" libera el combobox sin perder el snapshot por si quiere volver.

**Archivos nuevos**
- [`apps/web/components/forms/register-customer-from-snapshot-dialog.tsx`](apps/web/components/forms/register-customer-from-snapshot-dialog.tsx) — dialog con form + búsqueda de duplicados por RUT.

**Archivos modificados**
- [`apps/api/src/sales/sales.service.ts`](apps/api/src/sales/sales.service.ts) — propaga `customerId` a la cotización origen cuando era libre.
- [`apps/web/components/forms/sale-form.tsx`](apps/web/components/forms/sale-form.tsx) — `prefillFromQuotation.customerSnapshot` agregado, render condicional del tab Cliente, sub-componente `FreeCustomerPrompt`.
- [`apps/web/components/forms/sale-form-dialog.tsx`](apps/web/components/forms/sale-form-dialog.tsx) — tipo de props sincronizado.
- [`apps/web/app/(dashboard)/ventas/nueva/page.tsx`](apps/web/app/(dashboard)/ventas/nueva/page.tsx) — construye el `customerSnapshot` desde los campos `customerNameSnapshot/PhoneSnapshot/EmailSnapshot/TaxIdSnapshot` de la cotización.

#### 2. Sin visibilidad del stock disponible en items de cotización

- **Síntoma reportado:** al armar una cotización, el operador podía pedir cualquier cantidad de un producto sin ver el stock real. Si el producto tenía 5 unidades disponibles y se cargaba qty=20, no había ninguna señal — el problema recién aparecía al convertir a venta, cuando el backend rechazaba el `applyMovement`.
- **Decisión clave:** en cotización el warning **NO bloquea** la acción (a diferencia de venta donde sí). El operador puede emitir una cotización por más unidades de las disponibles porque la importación puede estar en camino. Solo se le tiene que avisar de forma clara para que tome decisiones informadas.
- **Solución:**
  - **Badge "Stock: X" siempre visible** debajo del input de cantidad en cada item del tab Items (no solo cuando se excede). Cumple con "el administrador debe tener visibilidad en todo momento del stock real".
  - **Highlight ámbar de la fila** y borde ámbar del input cuando `cantidad > stockDisponible`. El badge cambia a "Stock: 5 (faltan 3)" en tono ámbar fuerte.
  - **Banner ámbar agregado** debajo de la tabla cuando hay 1+ items con exceso. Lista cada SKU afectado con "pidiendo X, disponible Y (faltan Z)" y aclara "Podés guardar la cotización igualmente. El stock se vuelve a validar al convertir a venta."
  - **Color: ámbar** (no rojo, que es el color de error/bloqueo en ventas). Diferencia semántica clara: ámbar = warning informativo, rojo = bloqueo.
  - **Reuso del endpoint** `GET /sales/available-stock?productIds=...` existente desde Fase 7 (consultado vía `getAvailableStock` de [`sales-api.ts`](apps/web/lib/sales-api.ts)). El endpoint es genéricamente "stock disponible por producto en bodega" — su URL en `/sales/...` es legacy del primer uso. Cuando llegue Fase 7.5 con multi-bodega o aparezcan más consumidores (devoluciones, garantías), se puede mover a `/inventory/available-stock` sin cambio funcional.
- **Por qué no bloquear:** una cotización es un compromiso comercial previo a la venta. El operador puede cotizar productos que están en camino (lead time 2-3 meses para importaciones, ya documentado en el plan). El stock se revalida en `SalesService.create` cuando se convierte a venta — ahí sí se bloquea con 409 si el stock no alcanza.
- **Archivos modificados**
  - [`apps/web/components/forms/quotation-form.tsx`](apps/web/components/forms/quotation-form.tsx) — query nueva `quotation-available-stock` con TanStack, cálculo de `stockShortages`, badge por línea, highlight ámbar, banner resumen.

---

### Ronda 2 — 2026-05-10 (módulo Cotizaciones)

#### 1. Input de búsqueda en `/cotizaciones` con lag

- **Síntoma reportado:** la pantalla de cotizaciones tenía el mismo bug de pérdida de caracteres al escribir rápido que ya se había corregido en el resto de la app.
- **Causa raíz:** la pantalla quedó sin migrar al hook `useDebouncedUrlFilter` cuando se aplicó la Ronda 1. Seguía usando el patrón viejo `useState + setTimeout` con el input atado directo al estado de URL.
- **Solución:** migrar [`apps/web/app/(dashboard)/cotizaciones/page.tsx`](apps/web/app/(dashboard)/cotizaciones/page.tsx) a `useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] })`. Mismo patrón que productos, inventario, clientes, etc.
- **NO se tocaron** los pickers internos del modal (`ProductPicker`, `CustomerCombobox`): usan `useState` local + debounce a 200 ms y por diseño no presentan el problema (no disparan `router.replace` por keystroke).

#### 2. Selector $/% de descuento ilegible en mobile

- **Síntoma reportado:** dentro del modal de cotización, en la tab Items, los botones `$` y `%` del selector de tipo de descuento se rompían visualmente en mobile. El botón de porcentaje quedaba casi imposible de tocar.
- **Causa raíz:** el control era `[$ ][%][input]` en una columna fija de `w-[180px]`. En mobile la columna se comprimía, los botones se hacían muy chicos y el input se solapaba.
- **Solución:** rediseño a un toggle único adosado al input. Ahora el input numérico ocupa todo el ancho disponible y a la derecha hay un único botón de 36 px que muestra el símbolo actual (`$` o `%`) y alterna al click. La altura coincide con la del input (mismo `h-10`), foco accesible (`focus-within:ring-2`), tooltip con explicación.
- **Archivos:** [`apps/web/components/forms/quotation-form.tsx`](apps/web/components/forms/quotation-form.tsx).

#### 3. Modal de cotización se cerraba con error

- **Síntoma reportado:** al hacer "Guardar y enviar" si fallaba el envío (ej: falta de teléfono para WhatsApp), el toast de error aparecía pero el modal se cerraba igual. El usuario sentía que perdía los datos.
- **Causa raíz (doble):**
  1. El `try` interno de `sendEmail/sendWhatsapp` tragaba el error y permitía que `onSuccess(saved)` se ejecutara igual, lo cual cerraba el modal vía el wrapper.
  2. No había pre-validación: el operador descubría la falta de contacto recién tras el save, cuando la cotización ya se había creado en la base. Reintentar habría duplicado el correlativo.
- **Solución:**
  - **Pre-validación de contacto**: antes de guardar, si elige "Enviar por email" se valida que haya email (catálogo o snapshot); si elige WhatsApp se valida teléfono normalizable a E.164. Si falta, toast de error con CTA "Ir al cliente" (cuando es del catálogo) o `setError` inline (cuando es libre). El save NO se ejecuta — modal intacto, datos preservados.
  - **Reintento sin duplicar**: si la validación pasa pero el envío falla en runtime (ej: Resend caído), se guarda el `id` de la cotización en estado local. El próximo click reusa ese id (`updateQuotation` en vez de `createQuotation`), evitando un correlativo duplicado. Los botones cambian de label a "Guardar cambios" / "Reintentar envío" y un banner amarillo explica el estado.
- **Archivos:** [`apps/web/components/forms/quotation-form.tsx`](apps/web/components/forms/quotation-form.tsx).

#### 4. Texto fijo "15 días" inconsistente con `validUntil`

- **Síntoma reportado:** el PDF y el link público mostraban la línea "Esta cotización tiene una validez de 15 días desde su emisión." incluso cuando la fecha de vencimiento de la cotización había sido configurada manualmente a otro plazo. El cliente final veía dos validez distintas.
- **Causa raíz:** el texto vivía como literal en `CompanySettings.quotationFooter` (sembrado en [`run-seeds.ts`](apps/api/src/database/seeds/run-seeds.ts)). Se renderizaba tal cual en PDF (`pdf.service.ts`) y en el link público — sin interpolar `validUntil`.
- **Solución:**
  - Footer del seed reescrito a un texto neutro: `"Sujeta a confirmación de stock al momento de la venta. Precios en pesos chilenos (CLP), IVA incluido."`. La fecha real ya está en "Válida hasta: <fecha>" en todas las salidas, así que la línea de validez en el footer era redundante.
  - **Migración idempotente** [`1778760000000-QuotationFooterCleanup.ts`](apps/api/src/database/migrations/1778760000000-QuotationFooterCleanup.ts) que actualiza el footer existente SOLO si todavía contiene el texto viejo exacto. Si el cliente ya lo customizó desde `/configuracion`, se respeta. El `down` revierte simétricamente.
  - El footer queda como **texto editable libre** desde la pantalla de configuración — el cliente puede ponerlo en blanco o personalizarlo. La validez puntual de cada cotización es ahora responsabilidad única de `validUntil`.

#### 5. Notas no aparecían en PDF ni en link público

- **Síntoma reportado:** las notas escritas en la tab "Notas" del modal solo se veían en el detalle interno. En el PDF y en el link público no aparecían.
- **Causa raíz:** decisión inicial conservadora — el `PublicQuotationDto` y el `PdfInput` excluían intencionalmente las notas (comentario explícito en [`packages/shared/src/types.ts`](packages/shared/src/types.ts)). El cliente final no las veía nunca.
- **Solución:**
  - Agregar `notes: string | null` a `PublicQuotationDto` y a `PdfInput`.
  - Poblarlo en `toPublicDto` ([`apps/api/src/quotations/quotations.service.ts`](apps/api/src/quotations/quotations.service.ts)) y en `fromQuotationDto`/`fromPublicDto` ([`apps/api/src/notifications/pdf.service.ts`](apps/api/src/notifications/pdf.service.ts)).
  - Renderizar las notas en el PDF (después de los totales, con título "Notas", soporte de wrap multilinea) en los formatos carta y tirilla 80 mm.
  - Renderizar las notas en la página pública [`apps/web/app/p/cotizacion/[token]/page.tsx`](apps/web/app/p/cotizacion/[token]/page.tsx) en un bloque dedicado debajo de los totales.
  - Actualizar el placeholder de la tab Notas para reflejar que ahora son visibles al cliente. Si en el futuro hace falta separar notas internas, se agregaría un campo `internalNotes` aparte — la puerta queda abierta sin tocar el actual.

---

### Ronda 1 — 2026-05-10

#### 1. Input de búsqueda con lag (problema global)

- **Síntoma reportado:** al escribir rápido en cualquier input "Buscar..." se perdían caracteres y la UI se sentía pegajosa. El usuario tenía que escribir lento para no equivocarse.
- **Causa raíz:** los inputs estaban atados directamente al estado de URL (`useUrlFilters`). Cada keystroke disparaba `router.replace`, que reordena el árbol de React y descarta updates si llegan más rápido que el render.
- **Solución:** nuevo hook [`apps/web/lib/use-debounced-url-filter.ts`](apps/web/lib/use-debounced-url-filter.ts) que mantiene un `localValue` sincronizado al input en cada tecla y solo empuja a la URL después de **300 ms** de inactividad. Sincroniza el local cuando el filtro cambia desde afuera (back/forward, click en "Limpiar filtros", link compartido).
- **Pantallas migradas:** productos, inventario, clientes, proveedores, vehículos (modelos), gastos, y el componente reutilizable `SimpleNameList` (que alimenta categorías, marcas y marcas de vehículo).
- **Patrón nuevo a respetar:** todo input de búsqueda libre (`q`) en una pantalla con `useUrlFilters` debe usar `useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] })`. Selectores y filtros de fecha siguen usando `setFilter`/`setFilters` directo — el problema solo aparece en escritura libre rápida.

#### 2. Botón "Limpiar filtros" en Productos poco visible

- **Síntoma reportado:** el usuario no encontraba cómo resetear los filtros aplicados en `/productos`.
- **Causa raíz:** el botón existía pero quedaba flotando debajo del bloque de filtros de vehículo, separado visualmente del resto de filtros.
- **Solución:** se mueve el botón "Limpiar filtros" al header de la pantalla, junto al CTA "Nuevo producto", y solo aparece cuando hay filtros activos. Decisión confirmada con el cliente: **visible solo cuando hay filtros activos**, no siempre.
- **Archivos:** [`apps/web/app/(dashboard)/productos/page.tsx`](apps/web/app/(dashboard)/productos/page.tsx).

#### 3. Modal "Ajustar stock" pedía valores firmados

- **Síntoma reportado:** el modal exigía que el usuario ingresara números positivos para sumar y negativos para restar. Era confuso para usuarios no técnicos y propenso a errores.
- **Solución:** rediseño con tabs en la parte superior — **Aumentar** / **Disminuir** / **Establecer** — siguiendo el patrón shadcn `Tabs` + `TabsList`. El input solo acepta enteros positivos (`min=0`, `step=1`); el sistema calcula el delta firmado según la tab elegida y lo manda al endpoint `/inventory/adjust`.
  - Modo **Aumentar**: delta = +qty.
  - Modo **Disminuir**: delta = −qty.
  - Modo **Establecer**: delta = qty − stockActual (útil para conteo físico). El modal muestra la variación calculada antes de confirmar.
- **Edge cases:** si el delta resulta 0 (modo Establecer con la cantidad actual), el botón se deshabilita con texto "Sin cambios" y no se inserta movimiento — para no ensuciar el historial.
- **Archivos:** [`apps/web/components/adjust-stock-dialog.tsx`](apps/web/components/adjust-stock-dialog.tsx).

---

## Refinamientos transversales aplicados (post Fase 3)

Bloque de mejoras hechas en respuesta a las primeras observaciones del cliente sobre los módulos ya entregados. **No** introduce schema nuevo; son utilidades, validaciones y patrones reutilizables que las fases siguientes deben respetar.

### Backend (`apps/api`)

| Cambio | Dónde | Notas |
| --- | --- | --- |
| Helper FK → 409 | [`apps/api/src/common/fk-error.ts`](apps/api/src/common/fk-error.ts) | `rethrowFkAsConflict(err, msg)` mapea `ER_ROW_IS_REFERENCED_2` a `ConflictException`. Aplicado en categorías, marcas, vehículos, productos, proveedores. Ya no se devuelve 500 al borrar entidades referenciadas. |
| Paginación opcional | Categorías, marcas, marcas/modelos de vehículo, proveedores, inventario | Cuando llegan `page`/`pageSize` devuelve `PaginatedResult`; sin esos params devuelve array completo (compat con selectores). |
| Búsqueda libre `q` | Mismos módulos | Búsqueda case-insensitive vía `LIKE %q%` sobre los campos relevantes. |
| Unicidad de NIT/RUC | [`apps/api/src/suppliers/suppliers.service.ts`](apps/api/src/suppliers/suppliers.service.ts) | Validada en `create` y `update`. El índice DB único se agrega en Fase 4 (en la misma migración que aplica a `customers.taxId`). |

### Frontend (`apps/web`)

| Cambio | Dónde | Notas |
| --- | --- | --- |
| Formato monetario | [`apps/web/lib/format.ts`](apps/web/lib/format.ts) | `formatCurrency(value)` con `Intl.NumberFormat`. Corrige `$100000.00` → `$100.000,00`. Listo para repuntar a `es-CL`/CLP cuando se confirme el país. |
| Filtros sincronizados con URL | [`apps/web/lib/use-url-filters.ts`](apps/web/lib/use-url-filters.ts) | Hook `useUrlFilters({ q: '', page: '', ... })` que lee/escribe `?key=val` con `router.replace`. Permite compartir links con estado y que la página recargada respete los filtros. |
| Productos: UX | [`apps/web/components/forms/product-form.tsx`](apps/web/components/forms/product-form.tsx) + [`apps/web/app/(dashboard)/productos/page.tsx`](apps/web/app/(dashboard)/productos/page.tsx) | Removido mensaje obsoleto de stock mínimo. Selector de **año** del filtro vehículo y de los rangos en compatibilidades pasados a `Select` (1980 → año actual + 1). Validación zod de duplicados de fitments y rango de años inline por fila. Botón Guardar bloqueado durante `isPending`/`isSubmitting`. **Botón Eliminar producto** con confirm modal en la edición. |
| Listados con paginación + URL | Productos, categorías, marcas, vehículos, inventario, movimientos, proveedores, compras | Todas las pantallas siguen el mismo patrón (filtros + paginación + URL). |
| Movimientos: limpiar filtros | [`apps/web/app/(dashboard)/inventario/movimientos/page.tsx`](apps/web/app/(dashboard)/inventario/movimientos/page.tsx) | Botón "Limpiar filtros" cuando hay filtros aplicados. |

### Patrones a reusar en fases siguientes

- Toda nueva pantalla de listado debe usar `useUrlFilters`.
- Todo input de **búsqueda libre** (`q`) sobre `useUrlFilters` debe usar `useDebouncedUrlFilter(filters, 'q', { resetKeys: ['page'] })` (300 ms) para que la escritura rápida no pierda caracteres.
- Todo nuevo `remove()` que pueda violar FK debe envolverse con `rethrowFkAsConflict`.
- Toda visualización de monto debe pasar por `formatCurrency`.
- Todo nuevo listado que pueda crecer debe paginar.
- Toda nueva lista paginada en backend debe respetar la convención: `page`/`pageSize` opcionales — sin ellos el endpoint devuelve array completo para alimentar selectores.
- Todo campo RUT (cliente o proveedor) debe usar el decorador `@IsValidRut()` y normalizarse vía `normalizeRut()` antes de persistir.
- Todo campo de teléfono debe usar `@IsValidPhone()` y normalizarse a E.164 vía `normalizePhone()`.

---

## Subida de archivos (uploads)

Convenciones transversales para archivos subidos por usuarios — aplican a Fase 4B (foto de producto), Fase 5 (factura de compra), 7.7 (guía de despacho con adjuntos), etc.

### Storage

- **Backend stack**: `@nestjs/platform-express` + `multer` con storage local. Sin S3 / Cloudinary durante el MVP — la migración a almacenamiento remoto queda como evolución cuando se despliegue.
- **Ubicación física**: `apps/api/uploads/<recurso>/` (ej: `apps/api/uploads/products/`, `apps/api/uploads/purchases/`). El directorio `apps/api/uploads/` está **en `.gitignore`** — no se commitea contenido de usuarios.
- **Servido como estáticos**: `ServeStaticModule` expone `apps/api/uploads/` como `/uploads/*` en la API. Las URLs absolutas que devuelven los endpoints son `${PUBLIC_API_URL}/uploads/<recurso>/<archivo>`.
- **Naming**: cada archivo se renombra al guardar a `<uuid>.<ext>` para evitar path traversal y colisiones. El nombre original del cliente se descarta.

### Validaciones obligatorias en cada endpoint que recibe archivos

| Validación | Motivo |
| --- | --- |
| **Whitelist de MIME types** (no blacklist) | Lista explícita de tipos aceptados según el recurso. Ej. fotos de producto: `image/jpeg`, `image/png`, `image/webp`. **SVG bloqueado** por XSS (puede embeber JS). |
| **Tamaño máximo por archivo** | Configurable por recurso. Default actual: imágenes 10 MB, facturas/PDFs (futuro) 20 MB. |
| **Magic bytes / sniff** | Verificar el contenido real del archivo, no solo la extensión ni el `Content-Type` (que el cliente puede falsificar). |
| **Sanitización del nombre** | Renombrar a `<uuid>.<ext>` antes de persistir. Nunca usar el nombre original del cliente como path. |
| **Borrado físico al eliminar registro** | Si un endpoint borra el registro lógico (ej. `DELETE /products/:id/images/:imageId`), también debe borrar el archivo del disco para no acumular huérfanos. |

### Patrón "crear → subir asociado"

Cuando el archivo pertenece a una entidad nueva (ej. crear producto + subir fotos en `/productos/nuevo`), el flujo correcto en frontend es:

1. `POST /products` con los campos sin archivos → recibe el `productId`.
2. Para cada archivo cargado en el form: `POST /products/:id/images` con el id devuelto.
3. Si el step 1 falla, ningún archivo se subió (no hay huérfanos en disco).
4. Si algún step 2 falla, el producto queda creado y se muestra un toast con cuál archivo falló para reintento manual desde el detalle.

**No usar staging temporal** (subir archivos antes de crear el registro y luego asociar). Genera huérfanos cuando el create falla y obliga a un job de limpieza.

### Patrón "replace" para listas relacionadas

Para sub-forms con muchas filas (fitments de producto, códigos compatibles, ítems de compra), el endpoint que persiste la entidad padre **reemplaza la lista entera** en cada save. El cliente envía todas las filas, el backend hace `delete + insert` dentro de una transacción. Es más predecible que `diff` por id y simplifica el frontend (nada de "esta fila tiene id, esta no").

Aplica a: `VehicleFitment` (Fase 2 ✅), `ProductCode.compatible` (Fase 4B), `SaleItem`/`QuotationItem`/`PurchaseEntryItem` cuando se permita editar.

---

## Fase 4 — Clientes y proveedores

Bloque de cosas nuevas introducidas con la Fase 4. Lo que sigue es lo importante para futuras fases.

### Validadores compartidos (RUT y teléfono)

Hay validadores **espejo** entre backend y frontend. **Mantenelos sincronizados** — si cambia el algoritmo de un lado, cambiá el otro.

| Concepto | Backend | Frontend |
| --- | --- | --- |
| RUT chileno (formato + DV módulo 11 + normalización) | [`apps/api/src/common/validators/rut.ts`](apps/api/src/common/validators/rut.ts) — exporta `isValidRut`, `normalizeRut`, decorador `@IsValidRut()` | [`apps/web/lib/validators/rut.ts`](apps/web/lib/validators/rut.ts) — exporta `isValidRut`, `normalizeRut`, `formatRutPretty` |
| Teléfono (libphonenumber-js, E.164, country default Chile) | [`apps/api/src/common/validators/phone.ts`](apps/api/src/common/validators/phone.ts) — exporta `isValidPhone`, `normalizePhone`, decorador `@IsValidPhone()` | [`apps/web/lib/validators/phone.ts`](apps/web/lib/validators/phone.ts) — exporta `isValidPhone`, `normalizePhone`, `formatPhonePretty` |

**Convenciones de almacenamiento:**
- RUT se persiste en formato canónico: `12345678-9` (sin puntos, K mayúscula). El usuario puede ingresarlo con puntos; el `onBlur` del form normaliza, y el service valida la normalización antes de guardar.
- Teléfono se persiste en E.164: `+56912345678`. Si el usuario tipea sin prefijo, se asume Chile.

### Catálogo de comunas

Las **346 comunas chilenas** se cargan vía seed idempotente desde [`apps/api/src/database/seeds/data/communes-cl.json`](apps/api/src/database/seeds/data/communes-cl.json). Si el catálogo cambia (ej. nueva comuna), agregá la entrada al JSON y corré `./run.sh db:seed` — solo inserta las que falten, no duplica.

Endpoints (read-only):
- `GET /api/communes` → lista todas, ordenadas por región y luego por nombre.
- `GET /api/communes?region=Región%20Metropolitana...` → filtro por región.
- `GET /api/communes/:id` → una comuna.

UI: el componente reusable [`<CommuneSelect>`](apps/web/components/commune-select.tsx) muestra un combobox con búsqueda (basado en `CommandDialog` de cmdk) que carga el catálogo lazy y lo cachea por 1 hora.

### Modelo de Customer

```
Customer (id, name, taxId [unique, NOT NULL],
          email?, phone? [E.164],
          addressStreet?, addressNumber?, communeId? FK→communes,
          internalNotes?, createdAt, updatedAt)
```

**Reglas:**
- `taxId` (RUT) es **obligatorio y único** a nivel DB. Validado con módulo 11.
- Las 3 partes de la dirección son **opcionales**. La comuna se elige del catálogo (FK con `ON DELETE RESTRICT`).
- `internalNotes` solo se ven dentro del sistema — **no aparecen en cotizaciones/ventas/PDFs**.

### Endpoints nuevos

| Método | Ruta | Para qué sirve |
| --- | --- | --- |
| `GET` | `/api/customers` | Listado paginado opcional con búsqueda libre por nombre/RUT/email/teléfono. |
| `GET` | `/api/customers/:id` | Cliente con `commune` joineada. |
| `POST` | `/api/customers` | Crear (RUT obligatorio + valida + normaliza). |
| `PATCH` | `/api/customers/:id` | Editar (mismas validaciones). |
| `DELETE` | `/api/customers/:id` | Eliminar (FK error → 409 con mensaje claro cuando se agreguen cotizaciones/ventas en Fase 6/7). |
| `GET` | `/api/communes` | Catálogo de comunas (read-only). |
| `GET` | `/api/suppliers/:id/purchases` | Historial paginado de compras del proveedor (filtros opcionales `dateFrom`/`dateTo`). |

### Migración aplicada

[`1778120737933-CustomersAndCommunes.ts`](apps/api/src/database/migrations/1778120737933-CustomersAndCommunes.ts) hace, en orden:

1. Crea tabla `communes` con índice único `(name, region)`.
2. Agrega `customers.addressStreet`, `addressNumber`, `communeId`.
3. **Copia** `customers.address` → `customers.addressStreet`, después **dropea** la columna vieja.
4. Verifica que no haya clientes con `taxId NULL` o duplicado **antes** de subir a `NOT NULL` y agregar el índice único. Si hay datos inválidos, **aborta con un mensaje claro** (no rompe la DB).
5. Verifica que no haya proveedores con `taxId` duplicado **antes** de agregar `idx_suppliers_taxid` único.
6. Agrega FK `customers.communeId` → `communes.id` con `ON DELETE RESTRICT`.

> Si la migración aborta por el paso 4 o 5, corregí los datos manualmente con SQL (la query útil viene en el mensaje de error) y volvé a ejecutar.

### Pantallas

| Ruta | Descripción |
| --- | --- |
| `/clientes` | Listado paginado con búsqueda libre + URL filters. Muestra RUT formateado con puntos (`12.345.678-9`) y teléfono internacional (`+56 9 1234 5678`). |
| `/clientes/nuevo` | Form de creación con `<CustomerForm>`. |
| `/clientes/[id]` | Edición + botón **Eliminar** con confirm modal. Vista plana de Datos (las tabs de Cotizaciones/Ventas llegan en Fase 6/7). |
| `/proveedores/[id]` | Detalle del proveedor con tabs **Datos** y **Compras** (lista paginada de `PurchaseEntry` filtrada por `supplierId`). El listado `/proveedores` mantiene el dialog de edición rápida + un nuevo link "Ver detalle" que va al detalle. |

### Sidebar

Se agrega "Clientes" en sección **Operación** (junto a Proveedores).

### Validaciones del frontend

El `<CustomerForm>` usa **react-hook-form + zod** con las mismas reglas que el backend:
- RUT: zod `refine(isValidRut)`. Al perder foco se normaliza en el campo (`onBlur` → `setValue(normalizeRut(v))`).
- Teléfono: zod `refine(isValidPhone || vacío)`. Al perder foco se normaliza si es válido.
- Email: zod `email()` opcional.
- Comuna: `<CommuneSelect>` con búsqueda y agrupación por región.

### Decisiones de diseño que se eligieron

- **No** se seedea cliente "Consumidor final": el cliente confirmó RUT obligatorio para todos.
- El detalle de cliente NO tiene tabs todavía (vista plana). Las tabs Cotizaciones/Ventas llegan en Fase 6/7 cuando esos módulos existan.
- Detalle de proveedor SÍ tiene tabs porque ya hay datos de compras para mostrar.
- El `<SupplierDetail>` usa formato `es-CL` para fechas (Fase 4 ya está orientada a Chile).

### Cómo seedear / migrar después de pull

```bash
./run.sh db:migrate    # aplica la migración de Fase 4
./run.sh db:seed       # carga las 346 comunas (idempotente)
./run.sh dev
```

---

## Fase 4B — Catálogo extendido (productos con códigos múltiples + galería + tipo)

Lo nuevo de Fase 4B sobre el módulo Productos. Las convenciones generales de uploads están en la sección [Subida de archivos](#subida-de-archivos-uploads); acá se documenta lo específico de productos.

### Modelo extendido de Product

```
Product (...campos previos...,
         universalCode? [varchar 80, indexed, NO único],
         productKind [enum ORIGINAL | ALTERNATIVE, NOT NULL, default ORIGINAL])

ProductImage  (id, productId FK CASCADE, url, isCover, position, createdAt)
   -- galería ordenada con flag de portada
ProductCode   (id, productId FK CASCADE, code, kind enum)
   -- por ahora solo kind=COMPATIBLE; el enum es extensible
```

**Reglas:**
- `universalCode` es **único por producto pero NO único entre productos**. Dos productos equivalentes pueden compartir el mismo universal y la búsqueda devuelve ambos.
- La **portada** se calcula on-the-fly desde `product_images.isCover = TRUE`. NO hay columna `products.imageUrl` redundante.
- Si se borra la imagen marcada como cover y quedan otras, la siguiente (por `position`) se promueve automáticamente a cover.
- Los **códigos compatibles** se reemplazan por completo en cada save (estrategia replace, igual que fitments).

### Endpoints nuevos

| Método | Ruta | Para qué sirve |
| --- | --- | --- |
| `GET` | `/api/products/:id/images` | Listar imágenes del producto. |
| `POST` | `/api/products/:id/images` | Subir una imagen (multipart, campo `file`). La primera del producto se marca cover automáticamente. |
| `PATCH` | `/api/products/:id/images/:imageId/cover` | Marcar como portada (desmarca las demás en transacción). |
| `DELETE` | `/api/products/:id/images/:imageId` | Borra el registro **y** el archivo físico. |
| `PUT` | `/api/products/:id/codes` | Reemplaza la lista completa de códigos compatibles. Body: `{ codes: string[] }`. |

Los endpoints de productos existentes (`/api/products`, `/api/products/:id`, `quick-search`, `by-vehicle`) ahora también:
- Devuelven `coverUrl` en cada item (calculada en batch sin N+1).
- En el detalle (`getOne`) devuelven `images` y `compatibleCodes`.
- Aceptan filtro `productKind` y la búsqueda libre matchea contra `universalCode` y `product_codes.code`.

### `<ProductForm>` con 5 tabs

| Tab | Contenido |
| --- | --- |
| Datos | SKU, nombre, partNumber, barcode, **universalCode**, **tipo (ORIGINAL/ALTERNATIVE)**, categoría, marca, ubicación, activo, descripción. |
| Precios y stock | Costo, precio, stock min/max. |
| Compatibilidad | Sub-form de fitments vehiculares (Fase 2). |
| **Códigos** (Fase 4B) | Sub-form dinámico de códigos compatibles. Validación zod detecta duplicados con error inline. |
| **Imágenes** (Fase 4B) | En modo "editar" usa `<ProductImageGallery>` (sube directo al backend). En modo "nuevo" usa `<PendingImagesUploader>` que acumula los `File` en memoria — al hacer "Crear" se ejecuta el patrón "crear → subir asociado". |

### Lista `/productos`

- Columna nueva con miniatura **40×40** redondeada de la cover (cae a placeholder gris si el producto no tiene imágenes).
- Columna nueva "Tipo" con badge de color (verde=Original, azul=Alternativo).
- Filtro nuevo en URL: `?kind=ORIGINAL` o `?kind=ALTERNATIVE`. El selector de filtro vive arriba junto a Categoría/Marca.
- Búsqueda libre extendida: ahora matchea `sku`, `partNumber`, `barcode`, `name`, `universalCode` y `product_codes.code` (subquery `EXISTS`).

### Cómo seedear / migrar después de pull

```bash
./run.sh db:migrate    # aplica la migración de Fase 4B
./run.sh dev           # el directorio apps/api/uploads/ se crea solo
```

> Si subiste imágenes en local y querés empezar de cero, podés borrar `apps/api/uploads/products/*` (los registros en `product_images` quedan apuntando a archivos inexistentes — ejecutá `./run.sh db:reset` si querés limpiar todo).

---

## Fase 5 — Caja, gastos, IVA y comisiones

Bloque que cierra el ciclo financiero del MVP. La caja es la **fuente de verdad** del flujo de dinero del negocio: cada compra registrada inserta un egreso, cada gasto manual también, y (cuando llegue Fase 7) cada venta inserta un ingreso. Los reportes de IVA se derivan de las columnas `subtotal`/`taxAmount` de compras y ventas.

### Decisiones de negocio acordadas

| Tema | Decisión |
| --- | --- |
| Tasa de IVA | Configurable desde **Configuración → Impuestos**. Default `0.1900` (Chile 19%). Columna `company_settings.taxRate` (`decimal(5,4)`). |
| Comisión tarjeta | Tasa única configurable. Default `0.0250` (2.5%). Columna `company_settings.cardCommissionRate` (`decimal(5,4)`). PaymentMethod **no se desdobla** en débito/crédito. |
| Precios y costos | Son **brutos** (incluyen IVA). Al confirmar compra/venta, el sistema descompone en `subtotal_neto` y `taxAmount`. |
| Métodos de pago | `CASH | TRANSFER | CARD` para ventas Y gastos manuales (mismo enum). |
| Categorías de gasto | CRUD completo con flag `isSystem`. Las categorías de sistema (`IVA Compra`, `IVA Venta`, `Comisión Tarjeta`) no se pueden borrar ni renombrar. |
| Numeración de gastos | Correlativo `GAS-AAAA-NNNNN` generado atómicamente vía tabla `counters` con `SELECT … FOR UPDATE`. |
| Edición de gastos | Libre dentro del **mes actual**. Si el gasto es de un mes anterior, solo se puede **anular** (genera transacción compensatoria, no borra). |
| Cancelación de compras | **Postergada a Fase 7** (junto con cancelación de ventas). En Fase 5 las compras siguen siendo inmutables. |
| IVA en compras | Auto-calculado desde el total bruto. Override opcional cuando la factura del proveedor tenga un redondeo distinto. |
| Adjuntos | PDF + JPG/PNG/WEBP, máx 10 MB. Mismo límite que las imágenes de producto. |
| Saldo apertura | **No** hay pantalla dedicada. Si el cliente quiere registrar saldo inicial, lo hace como un movimiento manual con categoría "Otros". |

### Modelo de datos nuevo

```text
ExpenseCategory (id, name [unique], isSystem)
   -- isSystem=true para "IVA Compra", "IVA Venta", "Comisión Tarjeta"

Expense (id, number [unique, GAS-AAAA-NNNNN], date, categoryId,
         amount, paymentMethod, description, receiptUrl?,
         cashTxId,                          -- 1:1 con la transacción de caja generada
         voidedAt?, voidedById?, voidCashTxId?,
         userId, createdAt, updatedAt)

Counter (kind PK, year PK, lastNumber)
   -- Generación atómica de correlativos. kind="EXPENSE" en Fase 5;
   -- futuras fases reusan con kind="QUOTATION", "SALE", "DISPATCH".

CashTransaction (preexistente, ahora poblado activamente)
   -- type: INCOME | EXPENSE
   -- source: SALE | PURCHASE | MANUAL
   -- isVoided + transacción compensatoria al anular un gasto

CompanySettings (ampliada)
   + taxRate            decimal(5,4) default 0.1900
   + cardCommissionRate decimal(5,4) default 0.0250

PurchaseEntry (ampliada)
   + subtotal    decimal(15,2)  -- neto, sin IVA
   + taxAmount   decimal(15,2)  -- IVA descompuesto
   + invoiceUrl  varchar(500)?  -- factura adjunta

Sale (ampliada — los campos se llenan en Fase 7)
   + subtotal           decimal(15,2)
   + taxAmount          decimal(15,2)
   + commissionAmount   decimal(15,2)
```

### Reglas críticas de integridad

- **CashTransaction es la fuente de verdad de la caja**. Cada operación que afecta caja escribe acá: compras (`source=PURCHASE`), gastos manuales (`source=MANUAL`) y, en Fase 7, ventas (`source=SALE`).
- **Toda mutación de caja pasa por `CashboxService.recordTransaction(input, manager?)`**. El `manager?` opcional permite ejecutar dentro de la transacción del caller (caso típico: compras y gastos crean su transacción dentro de su propia atómica).
- **Anular ≠ borrar**. `CashboxService.voidTransaction(id, userId, manager?)` marca la transacción original como `isVoided=true` y crea una **compensatoria** del tipo opuesto por el mismo monto. Los reportes excluyen `isVoided=true` por defecto pero las compensaciones SÍ cuentan (porque son su contrapartida).
- **El IVA se registra en la compra/venta, no en la caja**. La columna `purchase_entries.taxAmount` es la única fuente para el reporte de IVA crédito; la `cash_transactions.amount` siempre es el TOTAL bruto.
- **Comisión tarjeta** (Fase 7): cuando una venta se confirma con `paymentMethod=CARD`, en la **misma transacción** se registran dos entradas en caja:
  - `INCOME` por el total de la venta.
  - `EXPENSE` por `commissionAmount = total * cardCommissionRate`, con `expenseCategoryId = (Comisión Tarjeta)` y `source=SALE`.
- **Edición de gasto**: si el gasto pertenece al mes actual, el endpoint `PATCH /expenses/:id` actualiza el registro Y la transacción de caja vinculada (`cashTxId`) en una transacción atómica. Si pertenece a un mes anterior, devuelve 409 — el operador debe anular y crear uno nuevo.
- **Numeración correlativa**: el `CountersService.nextNumber(kind, year, manager?)` toma un row lock pesimista sobre `(kind, year)` para evitar saltos en concurrencia.

### Migración aplicada

[`1778230000000-CashboxAndTaxes.ts`](apps/api/src/database/migrations/1778230000000-CashboxAndTaxes.ts) hace, en orden:

1. Agrega `expense_categories.isSystem` (BOOL DEFAULT 0).
2. Agrega `company_settings.taxRate` y `cardCommissionRate` (con defaults Chile).
3. Agrega `purchase_entries.subtotal`, `taxAmount`, `invoiceUrl`.
4. Agrega `sales.subtotal`, `taxAmount`, `commissionAmount` (todos default 0; se poblarán en Fase 7).
5. Crea las tablas `expenses` y `counters`.
6. **Inserta las categorías de sistema** (`IVA Compra`, `IVA Venta`, `Comisión Tarjeta`) si no existen, y marca `isSystem=1`. Las categorías base preexistentes (Arriendo, Transporte, etc.) quedan con `isSystem=0`.
7. **Backfill de IVA** en `purchase_entries`: para las compras pre-Fase 5 con `subtotal=0` y `taxAmount=0`, se calcula `subtotal = total/1.19` y `taxAmount = total - subtotal`. Asume tasa 19% Chile (las compras anteriores no tenían tasa configurable, así que esta es la única razonable).
8. **Backfill de cash_transactions**: para cada `purchase_entry` que no tenga aún una `cash_transaction(source=PURCHASE, sourceId=<purchase.id>)`, se inserta una con la `date` original de la compra. **Idempotente**: la `WHERE NOT EXISTS` evita duplicar al re-ejecutar.

> El `down()` de la migración borra **todas** las `cash_transactions` con `source=PURCHASE` (no podemos distinguir backfill de "reales"). En producción esto es destructivo — no usar `down` salvo en dev.

### Endpoints nuevos

| Método | Ruta | Para qué sirve |
| --- | --- | --- |
| `GET` | `/api/cashbox/transactions` | Libro de caja paginado con filtros (`type`, `source`, `paymentMethod`, `expenseCategoryId`, `dateFrom/To`, `q`, `includeVoided`). |
| `GET` | `/api/cashbox/balance` | Saldo actual: total + por método (CASH / TRANSFER / CARD) + ingresos / egresos acumulados. |
| `GET` | `/api/expenses` | Listado paginado con mismos filtros + `voided`. |
| `GET` | `/api/expenses/:id` | Detalle. |
| `POST` | `/api/expenses` | Crear gasto + transacción de caja en transacción atómica. Asigna `number = GAS-AAAA-NNNNN`. |
| `PATCH` | `/api/expenses/:id` | Editar — solo del mes actual. Reescribe la `cash_transaction` vinculada en la misma transacción. |
| `POST` | `/api/expenses/:id/void` | Anular: marca `voidedAt` + `cashbox.voidTransaction()` (compensación). |
| `GET/POST/PATCH/DELETE` | `/api/expense-categories` | CRUD. `update`/`remove` rechazan categorías con `isSystem=true`. |
| `GET` | `/api/settings/company` | Configuración (singleton). |
| `PATCH` | `/api/settings/company` | Actualizar — valida `0 ≤ taxRate, cardCommissionRate ≤ 1`. |
| `POST` | `/api/uploads/purchase-invoice` (multipart `file`) | Sube factura de compra. Devuelve `{url, filename, ...}`. |
| `POST` | `/api/uploads/expense-receipt` (multipart `file`) | Sube comprobante de gasto. |

Endpoints existentes ampliados:

- `POST /api/purchases`: ahora acepta `invoiceUrl` y `taxAmountOverride`. Calcula `subtotal/taxAmount` desde `companySettings.taxRate` (con override) e inserta `cash_transaction(EXPENSE, source=PURCHASE)` por el total bruto en la misma transacción atómica.
- `GET /api/purchases`: el DTO devuelve `subtotal`, `taxAmount`, `invoiceUrl` además del `total`.

### Pantallas

| Ruta | Descripción |
| --- | --- |
| [`/configuracion`](apps/web/app/(dashboard)/configuracion/page.tsx) | Form simple para editar `taxRate` y `cardCommissionRate`. Las tasas se editan como porcentaje "humano" (19, 2.5) y se persisten como decimal (0.1900, 0.0250). Link a la pantalla de categorías. |
| [`/configuracion/categorias-gasto`](apps/web/app/(dashboard)/configuracion/categorias-gasto/page.tsx) | CRUD de `ExpenseCategory`. Las categorías de sistema muestran un badge "sistema" y no tienen botones de editar/eliminar. |
| [`/gastos`](apps/web/app/(dashboard)/gastos/page.tsx) | Listado de gastos con filtros (categoría, método, fecha, búsqueda libre, incluir anulados). Botón "Nuevo gasto" → `<ExpenseFormDialog>`. Cada fila: editar (si es del mes actual) y anular (cualquier mes). El comprobante adjunto aparece como ícono clickeable. |
| [`/caja`](apps/web/app/(dashboard)/caja/page.tsx) | **Libro de caja**. 4 cards arriba con saldos (total + por método). Filtros: tipo, origen (SALE/PURCHASE/MANUAL), método, categoría, fecha desde/hasta, incluir anuladas. Tabla de movimientos con badges de color (verde ingreso / rojo egreso). Totales del período visible al pie. |
| [`/compras/nuevo`](apps/web/app/(dashboard)/compras/nuevo/page.tsx) (extendido) | Widget de subida de **factura adjunta** (PDF/imagen). Panel inferior con descomposición de IVA: Total bruto + IVA editable + Subtotal neto + Total. Si el operador edita el IVA, el subtotal neto se recalcula. |
| [`/compras`](apps/web/app/(dashboard)/compras/page.tsx) (extendido) | Tabla con columnas adicionales `Subtotal`, `IVA`, y `Factura` (ícono clickeable si está adjunta). |

### Patrones reutilizables (para fases siguientes)

- **`CashboxService.recordTransaction(input, manager?)`** — única entrada para mutar caja. Llamar siempre desde dentro de la transacción del caller cuando haya cambios cruzados (ej. ventas en Fase 7: `applyMovement` + `recordTransaction(INCOME)` + `recordTransaction(EXPENSE comisión)` en el mismo `dataSource.transaction(...)`).
- **`CashboxService.voidTransaction(id, userId, manager?)`** — para anular ventas/compras en Fase 7 reusando el mismo patrón de compensación.
- **`CountersService.nextNumber(kind, year, manager?)`** — para generar correlativos atómicos. Reutilizable en Fase 6 (`COT-AAAA-NNNNN`), Fase 7 (`VEN-AAAA-NNNNN`), Fase 7.7 (`DESP-AAAA-NNNNN`).
- **Uploads transversales** — `POST /api/uploads/purchase-invoice` y `POST /api/uploads/expense-receipt`. Mismo whitelist (PDF + JPG/PNG/WEBP), mismo límite (10 MB), mismo handler genérico (`UploadsController`). Para nuevos tipos de adjunto, agregar un `<NEW>_SUBDIR` constante y un endpoint nuevo.
- **Pattern para anular**: `entity.voidedAt + entity.voidCashTxId` + `cash_transaction.isVoided` + transacción compensatoria. Replicable para ventas en Fase 7.

### Verificación end-to-end

1. **Configuración**: `/configuracion` carga las tasas actuales como porcentajes. Editar IVA a 21 (sin coma) → guardar → recargar → debería mantenerse 21%. Volver a 19.
2. **Categorías de gasto**: `/configuracion/categorias-gasto` muestra IVA Compra / IVA Venta / Comisión Tarjeta con badge "sistema" sin botones de acción. Crear "Mantenimiento Local" → aparece editable. Intentar borrar la categoría "Comisión Tarjeta" devuelve 409.
3. **Gasto manual**: `/gastos` → Nuevo gasto → cargar Arriendo $800.000 efectivo, fecha hoy, descripción "Arriendo local mayo", subir un PDF como comprobante → Crear. El gasto aparece con número `GAS-2026-00001`. Saldo de caja en `/caja` baja $800.000 en columna Efectivo.
4. **Editar gasto del mes**: editar el gasto creado → cambiar monto a $850.000 → guardar. Saldo de caja se ajusta a $-850.000.
5. **Anular gasto**: anular el gasto → aparece como Anulado (línea tachada). En `/caja` con "Incluir anuladas" se ven dos transacciones: la original tachada (-$850.000) y la compensación (+$850.000). Saldo final: $0.
6. **Compra con IVA**: `/compras/nuevo` → Nueva entrada con 1 producto a $11.900 bruto. El panel muestra Total bruto $11.900, IVA $1.900 (auto), Subtotal neto $10.000. Subir factura PDF. Confirmar. La compra aparece en `/compras` con icono de factura. En `/caja` aparece un egreso (TRANSFER, source=Compra) por $11.900.
7. **Override de IVA**: en /compras/nuevo editar el campo IVA a $1.901 → subtotal neto se ajusta automáticamente a $9.999 → confirmar → la compra guardada respeta esos valores.
8. **Saldo de caja**: `/caja` arriba muestra el saldo total y por método. Filtrar por origen=Manual → solo gastos manuales. Filtrar fecha = hoy → cuadra con la actividad del día.

---

## Fase 6 — Cotizaciones y envío

Bloque que digitaliza el flujo cotización → envío al cliente → conversión a venta. La cotización es el documento previo a la venta: precios y disponibilidad sin afectar stock todavía. Ahora es el `CashboxService` ya integrado el que cierra el ciclo en Fase 7 cuando la venta se confirme.

### Decisiones de negocio acordadas

| Tema | Decisión |
| --- | --- |
| Cliente | **Catálogo o libre**: el operador elige cliente del catálogo o llena nombre/teléfono/email/RUT a mano. **En modo libre TODOS los campos son opcionales** — la cotización se puede emitir sin ningún dato del cliente para flujo rápido. El email/teléfono se piden recién al enviar (ver "Envío con contacto on-the-fly" abajo). Schema: `customerId` nullable + columnas `customerNameSnapshot/PhoneSnapshot/EmailSnapshot/TaxIdSnapshot`. |
| Flujo de UI | **Todo en modal** — el form de creación/edición vive en un `<Dialog>` que se abre desde el listado, el detalle o el **FAB global**. El operador nunca pierde el contexto de la pantalla en la que está. Las rutas `/cotizaciones/nueva` y `/cotizaciones/[id]/editar` redirigen al listado/detalle con `?new=1` / `?edit=1` para abrir el modal automáticamente (preserva los deep-links). |
| FAB (Floating Action Button) | **Botón flotante global** en el dashboard layout (esquina inferior derecha, fixed). Visible en cualquier pantalla autenticada. Click → abre el modal "¿Qué querés crear?" → "Cotización" abre el `<QuotationFormDialog>` inline (sin navegar). "Venta" queda deshabilitada hasta Fase 7. Al guardar, toast con acción "Ver detalle". Oculto en login y en la vista pública `/p/...`. |
| Estado inicial | **DRAFT siempre** al guardar. "Enviar por email/WhatsApp" la pasa a SENT y setea `sentAt`. |
| Vigencia | `validUntil = date + companySettings.defaultValidityDays` (default 15). Cron diario 03:00 marca EXPIRED las SENT/APPROVED con `validUntil < hoy`. |
| Edición | **Libre hasta CONVERTED**. Solo CONVERTED y EXPIRED son inmutables (PATCH devuelve 409). |
| Eliminar | Solo si DRAFT. SENT/APPROVED/etc devuelven 409 ("anulá o convertí, no borres"). |
| Stock | **No se reserva** al cotizar. Stock baja recién al confirmar venta (Fase 7). |
| PDF | Generado **server-side** con `jspdf` + `jspdf-autotable`. Formato Carta default + selector "Imprimir 80mm". Mismo PDF para web, email adjunto y link público. |
| Email | **Resend** con plantilla HTML branded simple + PDF adjunto. En dev usa `cotizaciones@onresend.dev`; en Fase 12 se cambia al dominio real verificado. |
| WhatsApp | **`wa.me`** con texto pre-llenado: «Hola {nombre}, te envío la cotización {número} por un total de {total}. La podés ver y descargar acá: {publicUrl}». El backend devuelve la URL `wa.me`, el frontend la abre en una nueva pestaña. (Cloud API de Meta queda como evolución para enviar adjuntos nativos.) |
| Link público | URL `/p/cotizacion/:token` sin auth. Token expira el mismo día que `validUntil` — después el PDF público devuelve 410 Gone. La página del detalle igual se ve con badge "Vencida". |
| Convertir a venta | El endpoint `POST /quotations/:id/convert` devuelve un `prefill` con cliente + items + totales. El frontend redirige a `/ventas/nueva?fromQuotation=ID`. La cotización pasa a CONVERTED **solo cuando la venta se confirme** en Fase 7 (en Fase 6 hay un placeholder). |
| Descuentos | **Por línea**, monto o %. La columna `quotation_items.discount` guarda el monto resuelto; `discountPercent` (nullable) recuerda si fue ingresado como % para imprimirlo así. Sin descuento global. |
| Modal entrada | En Fase 6 hay un modal "Venta o Cotización" con la opción "Venta" deshabilitada (badge "Próximamente"). En Fase 7 se habilita. |
| Estados APPROVED/REJECTED | **Botones manuales en el detalle interno**. Sin botones en el link público — el operador habla con el cliente y marca el estado a mano. |

### Modelo de datos (cambios)

```text
Quotation (ampliada)
   + customerId            char(36) NULL              -- ahora nullable (cliente libre)
   + customerNameSnapshot  varchar(200) NULL
   + customerPhoneSnapshot varchar(40) NULL
   + customerEmailSnapshot varchar(200) NULL
   + customerTaxIdSnapshot varchar(40) NULL
   + subtotal              decimal(15,2) DEFAULT 0    -- neto sin IVA
   + taxAmount             decimal(15,2) DEFAULT 0    -- IVA descompuesto
   + publicToken           varchar(64) NOT NULL UNIQUE
   + sentAt                datetime(6) NULL

QuotationItem (ampliada)
   + discountPercent       decimal(5,2) NULL          -- recuerda si descuento se ingresó como %

Counters (preexistente)
   -- usa kind='QUOTATION' para correlativos COT-AAAA-NNNNN
```

### Reglas críticas de integridad

- **Cliente XOR snapshot**: o `customerId` está presente o `customerNameSnapshot` está presente, nunca ambos a la vez. La validación vive en el servicio (no DTO) y se enforce en `create` y `update`. Cuando el operador cambia de catálogo a libre o viceversa, el servicio limpia el campo opuesto.
- **Cálculos**: precios y descuentos son **brutos** (incluyen IVA, mismo enfoque que Fase 5). El backend descompone:
  - `lineGross = qty * unitPrice - discount`
  - `subtotal_neto = sum(lineGross / (1 + taxRate))`
  - `taxAmount = sum(lineGross - lineGross/(1+taxRate))`
  - `total = sum(lineGross)`
  - Redondeo HALF_UP a 2 decimales por línea y al total.
- **Token público**: generado con `randomUUID().replace(/-/g,'')`. Se persiste en `publicToken` y se sirve sin auth vía `@Public()`. La URL completa la arma el backend con `PUBLIC_BASE_URL` env var + `/p/cotizacion/{token}`.
- **Envío de email**: el backend llama a Resend **antes** de marcar `sentAt`. Si Resend falla → 502 BadGateway, el estado no cambia. Esto evita marcar como enviado algo que nunca llegó.
- **Envío por WhatsApp**: el endpoint NO envía nada por sí mismo — solo arma la URL `wa.me` y la marca como SENT. Si Cloud API de Meta entra en una fase futura, el wrapper queda intacto y se agrega un canal adicional.
- **Cron de auto-expiración**: `@Cron('0 3 * * *')` en `QuotationsCronService`. Idempotente — corre cualquier número de veces sin efectos colaterales. Loguea cuántas marcó.
- **Edición de items**: estrategia replace (mismo patrón que fitments en Fase 2 y compatibles en Fase 4B). El service borra todos los items existentes e inserta los nuevos en una transacción.

### Migración aplicada

[`1778331000000-QuotationsPhase6.ts`](apps/api/src/database/migrations/1778331000000-QuotationsPhase6.ts):

1. Drop FK `FK_116e4084cf9a95beea7e502ac0d` sobre `quotations.customerId`.
2. `MODIFY` `customerId` a NULLABLE.
3. Re-add FK `FK_quotations_customer` (ON DELETE RESTRICT, igual que antes).
4. Agrega `customerNameSnapshot`, `customerPhoneSnapshot`, `customerEmailSnapshot`, `customerTaxIdSnapshot` (todas varchar nullable).
5. Agrega `subtotal`, `taxAmount` (decimal 15,2 default 0).
6. Agrega `publicToken` (varchar 64), backfillea con `REPLACE(UUID(),'-','')` para filas existentes, lo vuelve NOT NULL, agrega índice único.
7. Agrega `sentAt` (datetime nullable).
8. Agrega `quotation_items.discountPercent` (decimal 5,2 nullable).

### Endpoints nuevos

| Método | Ruta | Para qué sirve |
| --- | --- | --- |
| `GET` | `/api/quotations` | Listado paginado con filtros (`status`, `customerId`, `dateFrom/To`, `q`, `page`, `pageSize`). |
| `GET` | `/api/quotations/:id` | Detalle con items + customer + product. |
| `POST` | `/api/quotations` | Crear (DRAFT). Asigna `number = COT-AAAA-NNNNN` vía `CountersService`. Genera `publicToken`. Calcula `validUntil` si no viene. |
| `PATCH` | `/api/quotations/:id` | Editar — bloquea si CONVERTED/EXPIRED. Reemplaza items en transacción. |
| `DELETE` | `/api/quotations/:id` | Solo si DRAFT. |
| `POST` | `/api/quotations/:id/approve` | Pasa a APPROVED. |
| `POST` | `/api/quotations/:id/reject` | Pasa a REJECTED. Body `{ notes? }` para guardar motivo. |
| `POST` | `/api/quotations/:id/convert` | Devuelve `{ prefill: {...} }` para que el form de venta (Fase 7) prellene. **No** crea Sale ni cambia estado en Fase 6. |
| `POST` | `/api/quotations/:id/send/whatsapp` | Body `{ to? }`. Devuelve `{ whatsappUrl, status, sentAt }`. Marca SENT. Si `to` viene y la cot es de cliente libre, **persiste el snapshot del teléfono** (próximo envío no lo vuelve a pedir). |
| `POST` | `/api/quotations/:id/send/email` | Body `{ to? }`. Envía con Resend (HTML + PDF adjunto). Marca SENT solo si el envío fue OK. 502 si falla. Si `to` viene y la cot es de cliente libre, **persiste el snapshot del email**. |
| `GET` | `/api/quotations/:id/pdf?format=letter\|thermal80` | PDF binario (Content-Type application/pdf, inline). |
| `GET` | `/api/public/quotations/:token` | **Sin auth.** Detalle público (`PublicQuotationDto`). 404 si token inválido. |
| `GET` | `/api/public/quotations/:token/pdf?format=letter\|thermal80` | **Sin auth.** PDF binario. 410 Gone si `validUntil < hoy`. |

### Pantallas

| Ruta | Descripción |
| --- | --- |
| [`/cotizaciones`](apps/web/app/(dashboard)/cotizaciones/page.tsx) | Listado paginado con filtros URL (status / fecha / búsqueda libre). Badges de color por estado. Botón "Nueva cotización" abre el `<QuotationFormDialog>` directamente (modal). Cliente sin nombre se muestra como "Sin cliente". Soporta `?new=1` para abrir el modal desde un deep-link. |
| [`/cotizaciones/[id]`](apps/web/app/(dashboard)/cotizaciones/[id]/page.tsx) | Detalle con todas las acciones según estado. **El botón "Editar" abre el modal `<QuotationFormDialog>` en la misma pantalla** (no navega). "Enviar email"/"Enviar WhatsApp" envían directo si el cliente tiene contacto cargado, o abren el `<SendContactDialog>` para pedirlo si no. Soporta `?edit=1` para abrir el modal automáticamente. |
| [`/cotizaciones/nueva`](apps/web/app/(dashboard)/cotizaciones/nueva/page.tsx) | **Redirect** a `/cotizaciones?new=1` — preserva deep-links viejos pero ahora el form vive en modal. |
| [`/cotizaciones/[id]/editar`](apps/web/app/(dashboard)/cotizaciones/[id]/editar/page.tsx) | **Redirect** a `/cotizaciones/[id]?edit=1`. |
| [`/p/cotizacion/[token]`](apps/web/app/p/cotizacion/[token]/page.tsx) | **Vista pública sin auth ni sidebar.** Logo, datos empresa, tabla de items, totales, footer, botón "Descargar PDF". Badge "Vencida" si está EXPIRED. |
| [`/ventas/nueva`](apps/web/app/(dashboard)/ventas/nueva/page.tsx) | Placeholder Fase 7 que muestra el prefill de la cotización cuando llega `?fromQuotation=ID`. |

### Componentes clave

- [`<QuotationFormDialog>`](apps/web/components/forms/quotation-form-dialog.tsx) — wrapper del form con `<Dialog>` ancho (max-w-5xl). Usado tanto desde el listado (`mode='create'`) como desde el detalle (`mode='edit'`). El listado y el detalle controlan el `open/onOpenChange` y reciben el `onSaved` para invalidar las queries y cerrar.
- [`<QuotationForm>`](apps/web/components/forms/quotation-form.tsx) — el form puro con tabs Cliente / Items / Notas. Acepta `embedded` para no renderizar el header propio (el Dialog ya tiene el suyo). Acepta `onSuccess`/`onCancel` para que el caller controle la navegación. **En modo "Cliente libre" todos los campos son opcionales** — sin nombre, sin email, sin teléfono, sin RUT. La cotización se puede crear con solo los items.
- [`<SendContactDialog>`](apps/web/components/quotations/send-contact-dialog.tsx) — dialog reusable que pide email o teléfono según `channel`. Devuelve el valor por `onConfirm(to)`. El detalle lo abre cuando el operador hace click en "Enviar email"/"Enviar WhatsApp" y la cotización no tiene contacto cargado. Backend persiste el snapshot al recibir el `to`.
- [`<OperationFab>`](apps/web/components/operation-fab.tsx) — **FAB global** en el dashboard layout. Posición fixed bottom-right, círculo con ícono Plus, z-40, visible desde cualquier pantalla autenticada. Click → abre `<OperationModal>` con callback `onPickQuotation` que abre directamente el `<QuotationFormDialog>` inline (sin navegar). Al guardar, muestra toast con acción "Ver detalle" para navegar opcionalmente al detalle.
- [`<OperationModal>`](apps/web/components/operation-modal.tsx) — modal "¿Qué querés crear?" con 2 opciones (Cotización / Venta). Acepta props opcionales `onPickQuotation?` y `onPickSale?`: si vienen, llama el callback en lugar de navegar. Sin callbacks, hace `router.push('/cotizaciones?new=1')`. La opción "Venta" queda deshabilitada (badge "Próximamente") hasta que Fase 7 agregue el `onPickSale` correspondiente al FAB.

### Patrones reutilizables (para fases siguientes)

- **`CountersService.nextNumber('QUOTATION', year)`** — patrón de correlativo replicable para Sales (`SALE`) y Dispatch (`DISPATCH`) en Fases 7 y 7.7.
- **Cliente catálogo XOR snapshot** — mismo patrón sirve para Sales si en algún momento se quiere permitir venta a cliente libre. La validación vive en el service (`if (customerId && snapshot) throw ...`).
- **`PdfService.generate(dto, settings, format)`** — fácilmente extensible. Para nota de venta y guía de despacho (Fases 7 y 7.7) se agregan métodos `generateSale()` / `generateDispatchNote()` con el mismo patrón.
- **`EmailService.sendQuotation()` / `WhatsappUtil.buildQuotationMessage()`** — wrappers reusables. Cuando llegue Sale en Fase 7, se replica como `sendSaleConfirmation` y `buildSaleMessage`.
- **Endpoints públicos con `@Public()` + token firmado** — patrón aplicable a recibos de venta y guías de despacho públicas. La estrategia "expira con `validUntil`" no aplica a venta (siempre vigente), pero el patrón del controller queda igual.
- **Cron con `@nestjs/schedule`** — `ScheduleModule.forRoot()` ya está en `app.module.ts`. Próximos crons (limpieza de uploads huérfanos, reportes nocturnos) se agregan con un service nuevo y `@Cron(...)`.

### Variables de entorno nuevas

```env
# Email transaccional (Resend) — en dev podés dejar la key vacía, el envío
# fallará con un mensaje claro hasta que se configure.
RESEND_API_KEY=
EMAIL_FROM=cotizaciones@onresend.dev

# URL pública del frontend — usada para armar links que se mandan por
# email/WhatsApp. En producción apuntar al dominio real.
PUBLIC_BASE_URL=http://localhost:3000
```

### Troubleshooting — `ERR_SSL_PROTOCOL_ERROR` al abrir el link en Chrome

Cuando se prueba en local y se hace click en el link de la cotización (el que va por WhatsApp o email apuntando a `http://localhost:3000/p/cotizacion/...`), **Chrome lo upgradea automáticamente a `https://localhost:3000/...`** y como el dev server no tiene SSL devuelve `ERR_SSL_PROTOCOL_ERROR` ("Este sitio no puede proporcionar una conexión segura").

Esto pasa por:

- **Chrome HTTPS-First Mode** (activo por default desde Chrome 124) — fuerza https en cualquier URL.
- **HSTS guardado para `localhost`** — si en algún proyecto anterior visitaste `https://localhost:XXXX`, Chrome se acuerda y aplica HSTS.

**Solución manual rápida**: editar la URL en la barra de direcciones del navegador y **cambiar `https://` por `http://`**, luego enter. La página carga normal.

**Limpiar HSTS de localhost en Chrome** (deja de pasar a futuro):

1. Abrir `chrome://net-internals/#hsts`
2. En **"Delete domain security policies"**, escribir `localhost` → **Delete**
3. Cerrar y reabrir la pestaña con el link

**O usar Firefox / Safari** que no fuerzan https en `localhost`.

Cuando se haga el deploy de producción (Fase 12) con un dominio real (ej. `https://cotizaciones.tu-dominio.cl`), este problema desaparece — `PUBLIC_BASE_URL` apunta al dominio https real y Chrome no necesita upgradear nada.

### Verificación end-to-end

1. **Migración**: `./run.sh db:migrate` aplica `QuotationsPhase61778331000000`. `quotations.customerId` queda NULL-able, `publicToken` único en todas las filas.
2. **Crear cotización (cliente del catálogo)**: `/cotizaciones/nueva` → tab Cliente → seleccionar uno existente → tab Items → agregar 2 productos con cantidades distintas → un descuento como % en uno → Guardar borrador. Aparece en `/cotizaciones` con número `COT-2026-00001`, estado **DRAFT**, total calculado bruto correcto.
3. **Crear cotización (cliente libre)**: `/cotizaciones/nueva` → toggle "Cliente libre" → llenar solo nombre + teléfono → 1 ítem → Guardar borrador. Listado lo muestra con el nombre snapshot.
4. **Editar**: abrir el detalle → "Editar" → cambiar cantidad → Guardar borrador. Total se recalcula.
5. **Imprimir Carta**: detalle → "Imprimir Carta" → abre el PDF en pestaña nueva con tabla y totales legibles.
6. **Imprimir 80mm**: detalle → "Imprimir 80mm" → PDF más angosto, mismo contenido condensado.
7. **Link público**: detalle → "Copiar link público" → pegar en navegador en sesión de incógnito → muestra la cotización sin sidebar ni auth, con botón "Descargar PDF".
8. **Enviar por WhatsApp**: cliente libre con teléfono `+56911223344` → "Enviar por WhatsApp" → abre `wa.me/56911223344?text=...` con el mensaje pre-llenado. Cotización pasa a **SENT**.
8b. **Enviar por WhatsApp sin teléfono cargado** (flujo rápido): crear cotización libre sin nombre/teléfono → en el detalle hacer click en "Enviar por WhatsApp" → se abre el `<SendContactDialog>` pidiendo el teléfono → ingresar `+56911223344` → confirmar. Backend persiste el teléfono en `customerPhoneSnapshot` y abre `wa.me/...`. La próxima vez no lo vuelve a pedir.
9. **Enviar por email** (requiere `RESEND_API_KEY` configurada): cliente con email → "Enviar por email" → llega el email con PDF adjunto + link al detalle público. Cotización pasa a SENT.
9b. **Enviar por email sin email cargado**: igual al 8b pero pide el email en el dialog. Persistido en `customerEmailSnapshot`.
10. **Aprobar**: cotización en SENT → "Marcar aprobada" → estado **APPROVED**.
11. **Rechazar**: SENT → "Marcar rechazada" → dialog con motivo opcional → estado **REJECTED**, motivo guardado en `notes`.
12. **Convertir a venta**: APPROVED → "Convertir a venta" → redirige a `/ventas/nueva?fromQuotation=ID` y muestra el prefill (placeholder Fase 7). La cotización **no** pasa a CONVERTED todavía (eso es en Fase 7 al confirmar la venta).
13. **Auto-expirar**: setear manualmente una cotización SENT con `validUntil = ayer` → ejecutar `expireOverdue()` (o esperar al cron de las 03:00) → estado **EXPIRED**. El link público sigue mostrando la cotización con badge "Vencida". El PDF público devuelve 410.
14. **Bloqueo de edición**: intentar editar una CONVERTED o EXPIRED → mensaje "Esta cotización no se puede editar" + botón volver.
15. **Eliminar**: solo cotizaciones DRAFT muestran el botón "Eliminar" — confirm dialog → desaparecen del listado. SENT/etc no permiten borrado (devuelve 409).
16. **Crear cotización rápida sin cliente**: listado → "Nueva cotización" → modal → toggle "Cliente libre" → **dejar todos los campos del cliente vacíos** → tab Items → agregar 1 producto → "Guardar borrador". Se crea la cotización con el label "Sin cliente" en el listado. Después se puede enviar por email/WhatsApp ingresando el contacto on-the-fly (ver pasos 8b/9b).
17. **Editar desde el modal sin perder contexto**: estando en `/cotizaciones` o `/cotizaciones/[id]`, click en "Editar" → se abre el modal `<QuotationFormDialog>` sobre la pantalla actual → al guardar se cierra el modal y la pantalla se refresca sin navegación.
18. **FAB global**: estando en cualquier pantalla del dashboard (ej. `/inventario`, `/clientes`, `/caja`), click en el botón flotante azul en la esquina inferior derecha → abre el modal "¿Qué querés crear?" → click en "Cotización" → abre el `<QuotationFormDialog>` sin sacar al operador de la pantalla actual → guardar → toast "Cotización COT-2026-00042 creada" con acción "Ver detalle" para navegar opcionalmente. El operador queda donde estaba.

### Resumen de lo realizado

**Documentación**

- PLAN.md y README.md marcan Fase 5 como ✅ y Fase 6 como ✅. PLAN.md tiene la sección Fase 6 reescrita con las 17 decisiones confirmadas (#32–#48 en la tabla). README.md tiene una sección completa "Fase 6 — Cotizaciones y envío" con modelo de datos, endpoints, pantallas, patrones reusables, env vars y 15 pasos de verificación end-to-end.

**Backend** ([apps/api](apps/api/))

- Migración [`1778331000000-QuotationsPhase6.ts`](apps/api/src/database/migrations/1778331000000-QuotationsPhase6.ts): `customerId` nullable, snapshots cliente libre, `subtotal/taxAmount/publicToken/sentAt`, `discountPercent` en items.
- Entidades actualizadas con todos los campos.
- Módulo [`quotations`](apps/api/src/quotations/) completo: service + controller + public controller + cron + dto. Cálculos brutos→netos con redondeo HALF_UP, correlativo `COT-AAAA-NNNNN` vía `CountersService`, validación cliente XOR snapshot.
- Módulo [`notifications`](apps/api/src/notifications/): `EmailService` (Resend), `PdfService` (jsPDF + jspdf-autotable, formatos Carta y 80mm), `whatsapp.util.ts`.
- `ScheduleModule.forRoot()` + cron `@Cron('0 3 * * *')` para auto-expirar SENT/APPROVED.
- `.env.example` con `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_BASE_URL`.

**Shared** ([packages/shared](packages/shared/))

- Nuevos tipos: `QuotationDto`, `QuotationItemDto`, `QuotationCustomerView`, `PublicQuotationDto`, `QuotationStatusDto`, `QuotationSendResultDto`.

**Refactor posterior — flujo modal y cliente libre opcional** (mayo 2026)

A pedido del cliente: toda la creación y edición de cotizaciones ahora vive en un **modal** para no sacar al operador de la pantalla en la que está, y en modo "cliente libre" **todos los campos del cliente son opcionales** — el email/teléfono se piden recién al enviar.

- Backend (service + controller): aflojada la validación cliente XOR snapshot — solo se prohíbe tener ambos a la vez (cero datos del cliente está OK). `POST /quotations/:id/send/email` y `/send/whatsapp` aceptan `{ to? }` opcional; si viene y la cot es de cliente libre, se persiste en el snapshot correspondiente.
- Frontend nuevo: [`<QuotationFormDialog>`](apps/web/components/forms/quotation-form-dialog.tsx) (wrapper Dialog ancho), [`<SendContactDialog>`](apps/web/components/quotations/send-contact-dialog.tsx) (pide email/teléfono al envío). El form acepta `embedded`, `onSuccess`, `onCancel`. Las páginas `/cotizaciones/nueva` y `/cotizaciones/[id]/editar` redirigen al listado/detalle con `?new=1` / `?edit=1` para abrir el modal automáticamente.
- FAB global: [`<OperationFab>`](apps/web/components/operation-fab.tsx) en el dashboard layout. Permite crear cotizaciones desde cualquier pantalla sin perder contexto. `OperationModal` refactorizado para aceptar callbacks (`onPickQuotation` / `onPickSale`) en lugar de siempre navegar — esto habilita el flujo inline del FAB. Cuando Fase 7 entre, basta con agregar `onPickSale` al FAB para que también abra el form de venta inline.

**Frontend** ([apps/web](apps/web/))

- API client [`lib/quotations-api.ts`](apps/web/lib/quotations-api.ts) — `sendEmail(id, to?)` y `sendWhatsapp(id, to?)` aceptan destino opcional.
- Form [`components/forms/quotation-form.tsx`](apps/web/components/forms/quotation-form.tsx): tabs Cliente/Items/Notas, toggle catálogo↔libre **con todos los campos opcionales**, combobox de cliente, ProductPicker reusado, descuento $ o %, totales en vivo, "Guardar borrador" + dropdown "Guardar y enviar". Soporta `embedded` para usarse dentro del Dialog.
- Pantallas: [`/cotizaciones`](apps/web/app/(dashboard)/cotizaciones/page.tsx) (listado), [`/cotizaciones/nueva`](apps/web/app/(dashboard)/cotizaciones/nueva/page.tsx), [`/cotizaciones/[id]`](apps/web/app/(dashboard)/cotizaciones/[id]/page.tsx) (detalle con todas las acciones por estado), [`/cotizaciones/[id]/editar`](apps/web/app/(dashboard)/cotizaciones/[id]/editar/page.tsx), [`/p/cotizacion/[token]`](apps/web/app/p/cotizacion/[token]/page.tsx) (vista pública sin auth/sidebar), [`/ventas/nueva`](apps/web/app/(dashboard)/ventas/nueva/page.tsx) (placeholder Fase 7 con prefill).
- [`components/operation-modal.tsx`](apps/web/components/operation-modal.tsx): modal "Cotización vs Venta" con Venta deshabilitada.
- [`components/quotation-status-badge.tsx`](apps/web/components/quotation-status-badge.tsx) reusable.
- Componentes UI shadcn nuevos: `textarea.tsx`, `popover.tsx`.
- Sidebar con item "Cotizaciones" en sección Operación (icono `ClipboardList`).

**Verificación**

- `pnpm --filter @inventory/shared build` ✅
- `pnpm --filter @inventory/api typecheck` ✅
- `pnpm --filter @inventory/web typecheck` ✅
- Migración aplicable (`db:migrate` corrió OK durante el desarrollo).

**Pendiente para usar en producción de la fase**

- Configurar `RESEND_API_KEY` en `.env.local` para enviar emails reales — sin la key, todo lo demás funciona y el envío por WhatsApp arma `wa.me` sin depender de Resend.

---

## Fase 7 — Ventas con caja integrada

Cierra el ciclo operativo del MVP: el operador registra la venta, el sistema descuenta stock, registra el ingreso en caja y (si fue tarjeta) registra el egreso por comisión bancaria — todo en una sola transacción atómica. La cancelación revierte simétricamente. Las cotizaciones de Fase 6 pueden convertirse directamente en ventas.

### Decisiones de negocio acordadas

| Tema | Decisión |
| --- | --- |
| Estado inicial | **PAID directo** al confirmar el form. No hay flujo PENDING separado — para "pedido pendiente de cobro" existe Cotización. Esto simplifica la UX administrativa (sin POS) y deja una sola acción significativa: confirmar. |
| Cliente | **Solo del catálogo, obligatorio**. RUT requerido (regla del cliente). Si el cliente no existe, el operador lo crea en `/clientes/nuevo` y vuelve — no hay snapshot inline. La entidad `Sale.customerId` queda `NOT NULL`. |
| Bodega | `Sale.warehouseId` agregado a la entidad desde Fase 7 (preparado para 7.5). **Sin selector visible** mientras solo exista la bodega "Principal" — el backend la asigna automáticamente. Cuando 7.5 active multi-bodega, agregamos el selector en el form sin tocar schema. |
| Método de pago | Selector visual con 3 opciones: **Efectivo** / **Transferencia** / **Tarjeta**. Tarjeta muestra el % de comisión que se calculará. La comisión se descompone en un `CashTransaction(EXPENSE)` separado para auditoría. |
| Stock validation | **Defensa en profundidad**: el form muestra "Stock: X" debajo de cada cantidad y bloquea el botón "Confirmar" si alguna línea excede el disponible. El backend revalida en `applyMovement` y devuelve 409 si una race condition pasa la validación del front. |
| Cancelación | **Cualquier venta no-cancelada puede cancelarse**, con motivo obligatorio (min 5 chars). Sin ventana de tiempo. En una transacción atómica: revierte stock vía `RETURN_IN`, anula transacciones de caja vía `voidTransaction` (genera compensaciones), y marca `cancelledAt + cancelReason + cancelledById`. No se puede reactivar — quien quiera "rehacer" debe crear una venta nueva. |
| Costo congelado | `SaleItem.unitCost` se persiste al confirmar la venta usando `products.cost` del momento. Si el costo del producto cambia después, los reportes de rentabilidad históricos siguen siendo correctos. |
| Convert desde cotización | El botón "Convertir a venta" del detalle de cotización navega a `/ventas/nueva?fromQuotation=<id>` con el form pre-llenado (cliente, items, descuentos, notas). El operador puede ajustar antes de confirmar. Al confirmar, el backend marca la cotización como `CONVERTED` en la **misma transacción** del create de venta. Si el operador cancela el form, la cotización queda intacta. |
| PDF "Nota de venta" | Reutiliza la infraestructura de Fase 6 (`PdfService` con jsPDF + jspdf-autotable). Mismas dos formas: **Carta (A4)** y **Térmica 80mm**. Encabezado dice "Nota de venta" en vez de "Cotización". Muestra método de pago en el encabezado. Sin "Válida hasta". Sin link público (la venta es interna). |
| Notas | Campo opcional `Sale.notes`. Visible en el PDF al final, en el bloque "Notas". Útil para plazo de entrega u observaciones hasta que tengamos Guía de Despacho (Fase 7.7). |
| Numeración | Correlativo `VTA-AAAA-NNNNN` (ej: `VTA-2026-00001`) generado atómicamente con `CountersService` (kind `'SALE'`). El reset es anual: cada año vuelve a `00001`. |

### Schema

#### Migración [`1778800000000-SalesPhase7.ts`](apps/api/src/database/migrations/1778800000000-SalesPhase7.ts)

| Cambio | Tabla | Notas |
| --- | --- | --- |
| `warehouseId` | `sales` | NOT NULL, FK a `warehouses` ON DELETE RESTRICT. **Backfill**: copia la bodega "Principal" (o la primera por orden alfabético) en filas existentes antes de pasar a NOT NULL. Si no hay ninguna bodega, la migración aborta con mensaje claro. |
| `cancelledAt` | `sales` | `datetime(6) NULL`. Timestamp de la cancelación. |
| `cancelReason` | `sales` | `text NULL`. Motivo guardado tal cual lo escribe el operador (sin sanitizar). |
| `cancelledById` | `sales` | `char(36) NULL`, FK a `users` ON DELETE SET NULL. Quién cancela. |
| `notes` | `sales` | `text NULL`. Notas visibles en el PDF. |
| `discountPercent` | `sale_items` | `decimal(5,2) NULL`. Espejo del campo en `quotation_items`: persiste el % original si el operador eligió "%" en el toggle, para reimprimir el documento con la misma representación. El campo `discount` siempre guarda el monto resuelto. |

> El `down` revierte en orden inverso e incluye drop de FKs e índices. Probar `db:migrate:revert` localmente antes de hacer rollback en producción.

#### Entidades actualizadas

- [`Sale`](apps/api/src/database/entities/sale.entity.ts) — agrega `warehouse?: Warehouse`, `warehouseId`, `notes`, `cancelledAt`, `cancelReason`, `cancelledBy?`, `cancelledById`.
- [`SaleItem`](apps/api/src/database/entities/sale-item.entity.ts) — agrega `discountPercent`.

### Backend

#### Módulo nuevo [`apps/api/src/sales/`](apps/api/src/sales/)

- **`SalesService.create(dto, userId)`** — única forma de crear una venta. Todo en `dataSource.transaction()`:
  1. Valida cliente, productos (existencia + sin duplicados), settings, comisión categoría si es tarjeta.
  2. Calcula totales con `computeSaleTotals` (descompone bruto → neto + IVA usando `companySettings.taxRate`).
  3. Genera `VTA-AAAA-NNNNN` con `CountersService` (mismo lock pesimista que cotizaciones).
  4. Persiste `Sale` (status=PAID) + cada `SaleItem` con `unitCost = product.cost` congelado.
  5. Por cada item llama `InventoryService.applyMovement(manager, { type: SALE_OUT, qty: -qty, ... })`. Si el stock queda negativo, `applyMovement` tira `ConflictException` y aborta la transacción.
  6. Registra `CashTransaction(INCOME, source=SALE)` por el total bruto.
  7. Si `paymentMethod=CARD`, registra adicionalmente `CashTransaction(EXPENSE, source=SALE, expenseCategoryId=Comisión Tarjeta)` por `total × cardCommissionRate`.
  8. Si `dto.quotationId` viene, marca la cotización como `CONVERTED` en la misma transacción (validando que no esté ya cerrada).
- **`SalesService.cancel(id, dto, userId)`** — única forma de cancelar. En una transacción:
  1. Por cada item, `applyMovement(RETURN_IN, qty=+qty)` para devolver stock.
  2. Busca todas las `CashTransaction` con `source=SALE, sourceId=id, isVoided=false` y llama `cashbox.voidTransaction(id, userId, manager)` — que marca la original como `isVoided=true` y crea la compensación (INCOME→EXPENSE o viceversa). Si fue tarjeta, anula tanto el ingreso como el egreso de comisión.
  3. Marca la venta como `CANCELLED` con `cancelledAt`, `cancelReason`, `cancelledById`.
- **`SalesService.availableStock(productIds, warehouseId?)`** — endpoint helper para el form: devuelve el stock disponible de cada producto en la bodega seleccionada. El frontend lo consume para el badge "Stock: X" en cada línea.
- **`SalesService.list(query)`** — listado paginado con filtros: estado, método de pago, cliente, rango de fechas, búsqueda libre `q` (número, nombre o RUT del cliente). Carga items en batch (sin N+1).
- **`SalesService.getOne(id)`** — detalle con customer, warehouse, user, cancelledBy, quotation, items.
- **`SalesController`** — endpoints:
  - `GET /sales` (list paginado)
  - `GET /sales/available-stock?productIds=a,b,c[&warehouseId=...]` (helper para el form)
  - `GET /sales/:id` (detalle)
  - `POST /sales` (create atómico)
  - `POST /sales/:id/cancel` (cancel atómico)
  - `GET /sales/:id/pdf?format=letter|thermal80` (PDF de la nota de venta)
- **`SalesModule`** — importa `CountersModule`, `InventoryModule`, `CashboxModule`, `NotificationsModule` y registra el repositorio de las entidades necesarias. Wireado en `AppModule`.

#### PdfService extendido — [`apps/api/src/notifications/pdf.service.ts`](apps/api/src/notifications/pdf.service.ts)

El `PdfInput` ahora tiene un campo `kind: 'quotation' | 'sale'` y campos opcionales `paymentMethod` + `commissionAmount`. Diferencias en el render:

- **Título**: "Cotización N°…" vs **"Nota de venta N°…"**.
- **Encabezado**: si es venta, no se muestra "Válida hasta" y se agrega una línea "Pago: Efectivo / Transferencia / Tarjeta".
- **Estado**: traduce los 3 estados de venta (Pagada, Pendiente, Cancelada) además de los de cotización.
- Helper nuevo: `fromSaleDto(s, settings)` arma el `PdfInput` desde un `SaleDto`.

### Frontend

#### Componentes y pantallas nuevas

- [`SaleForm`](apps/web/components/forms/sale-form.tsx) — form de venta con 3 tabs:
  - **Cliente y pago**: selector de cliente (combobox con búsqueda, solo catálogo) + 3 cards visuales de método de pago (con ícono y hint sobre comisión).
  - **Items**: tabla con SKU, producto, cantidad + badge de stock disponible debajo, precio unitario, descuento (toggle $/% adosado al input — mismo patrón que cotizaciones tras la Ronda 2), subtotal por línea. Botón "Agregar producto" que abre `ProductPicker`. Si alguna línea excede stock, la fila se pinta rojo y el botón "Confirmar" queda deshabilitado.
  - **Notas**: textarea libre.
- [`SaleFormDialog`](apps/web/components/forms/sale-form-dialog.tsx) — wrapper en `<Dialog>` con `key` para remount limpio al abrir.
- [`CancelSaleDialog`](apps/web/components/forms/cancel-sale-dialog.tsx) — pide motivo obligatorio (min 5 chars), confirma cancelación e invalida queries de stock, caja y movimientos para que toda la UI se refresque.
- [`SaleStatusBadge`](apps/web/components/sale-status-badge.tsx) — badge coloreado por estado: PAID (verde), PENDING (ámbar), CANCELLED (rojo + line-through).
- [`/ventas`](apps/web/app/(dashboard)/ventas/page.tsx) — listado paginado con filtros (estado, método, búsqueda, rango fechas). Botón directo "Nueva venta" que abre el `SaleFormDialog` (sin pasar por el modal de elección). Filtros sincronizados con URL vía `useUrlFilters` + `useDebouncedUrlFilter` (búsqueda fluida, 300 ms).
- [`/ventas/[id]`](apps/web/app/(dashboard)/ventas/[id]/page.tsx) — detalle con header (número + badge + auditoría), bloques de Cliente y Pago, tabla de items, totales, notas, banner rojo si está cancelada (mostrando motivo + quién + cuándo). Acciones: **Cancelar venta** (si no está cancelada) y dropdown **Imprimir** con Carta y Térmica 80mm.
- [`/ventas/nueva`](apps/web/app/(dashboard)/ventas/nueva/page.tsx) — pantalla full-width usada principalmente para el flujo "Convertir desde cotización". Si llega `?fromQuotation=<id>`, carga la cotización y pre-llena el `SaleForm`. Al confirmar, redirige a `/ventas/<saleId>`.

#### Wiring del FAB

- [`OperationFab`](apps/web/components/operation-fab.tsx) — el botón flotante ahora maneja también la apertura de `SaleFormDialog`. Pasa `onPickSale` al `OperationModal`, lo cual habilita el botón "Venta" (antes deshabilitado con badge "Próximamente"). Al guardar la venta, toast con acción "Ver detalle" que navega al detalle.
- [`Sidebar`](apps/web/components/sidebar.tsx) — item "Ventas" agregado bajo la sección "Operación", justo después de "Cotizaciones".

#### API client — [`apps/web/lib/sales-api.ts`](apps/web/lib/sales-api.ts)

Wrappers tipados de axios: `listSales`, `getSale`, `createSale`, `cancelSale`, `getAvailableStock`, `getSalePdfUrl`. Tipos vienen de `@inventory/shared`.

### DTOs compartidos — [`packages/shared/src/types.ts`](packages/shared/src/types.ts)

Agregados:

- `SaleStatusDto = 'PENDING' | 'PAID' | 'CANCELLED'`.
- `SaleItemDto` — incluye `unitCost` congelado.
- `SaleDto` — incluye `warehouse?`, `quotation?` (opcional, si vino de una cotización), `cancelledAt`, `cancelReason`, `cancelledBy?`.
- `CreateSaleInput`, `CreateSaleItemInput`, `CancelSaleInput`.

### Verificación end-to-end de la fase

| Caso | Resultado esperado |
| --- | --- |
| Crear venta con efectivo | Stock baja de la bodega Principal, caja sube por el total, libro de caja muestra ingreso con `source=SALE`. |
| Crear venta con transferencia | Igual que efectivo pero `paymentMethod=TRANSFER`. Saldo por método: aumenta el de transferencia. |
| Crear venta con tarjeta | Caja sube por el total bruto; caja baja por la comisión (≈2.5% del total) en una transacción adicional con `expenseCategoryId=Comisión Tarjeta`. |
| Cancelar una venta confirmada | Stock vuelve (movimiento `RETURN_IN`), caja se compensa (la del INCOME pasa a `isVoided=true` + compensación EXPENSE; si hubo comisión, también). Venta queda CANCELLED con motivo y auditoría. |
| Convertir cotización a venta | Click en "Convertir a venta" desde el detalle de cotización → navega a `/ventas/nueva?fromQuotation=<id>` con el form pre-llenado → al confirmar, se crea la venta y la cotización pasa a CONVERTED **en la misma transacción**. |
| Stock insuficiente | Form bloquea botón "Confirmar" si alguna línea excede. Si pasa la validación pero stock cambió en otra pestaña, backend devuelve 409 en `applyMovement` y aborta toda la transacción (nada se persiste). |
| PDF "Nota de venta" | Carta (A4) y Térmica 80mm descargan correctamente. Encabezado dice "Nota de venta VTA-2026-NNNNN", incluye método de pago, notas al final, footer de empresa. |
| Quotación ya convertida → reintento | Backend devuelve `ConflictException` desde la transacción. Frontend muestra el error y la cotización no cambia. |

### Tests / health

- `pnpm --filter @inventory/api typecheck` ✅
- `pnpm --filter @inventory/web typecheck` ✅
- `pnpm --filter @inventory/shared build` ✅

### Pendientes para fases futuras

- **Devoluciones formales (Fase 7.6)**: hoy si el cliente devuelve un producto sin cancelar la venta entera, no hay un flujo dedicado — se usa cancelación o ajuste manual. La fase 7.6 introduce `RETURN_IN` desde una venta específica con motivo y trazabilidad.
- **Guía de despacho (Fase 7.7)**: documento separado para el despacho físico. Hasta entonces, el campo `notes` de la venta cumple parcialmente esa función (plazo de entrega, transportista).

---

## Fase 7.5 — Multi-bodega y Mercado Libre Full

Habilita la operación con múltiples bodegas físicas o virtuales. El caso de uso disparador es **Mercado Libre Full**: el cliente envía mercadería al depósito de ML como una "transferencia" interna (no es una venta), y cuando ML vende, el stock baja de la bodega ML, no de la "Principal". Incluye también el código de ubicación por bodega (decisión #60).

### Decisiones de negocio acordadas

| Tema | Decisión |
| --- | --- |
| Soft-delete de bodegas | `Warehouse.isActive` (boolean, default `true`). Eliminar desde `/almacenes` intenta hard delete; si la bodega tiene movimientos/stock/ventas asociados, el FK RESTRICT falla y caemos a soft delete (marcamos `isActive=false`). Las inactivas no aparecen en selectores de venta o transferencia, pero sí en filtros de historial y se pueden reactivar. |
| Vista de stock | `/inventario` con **selector de bodega arriba** + tabla por bodega. Filtro sincronizado con URL (`?warehouse=<id>`) para compartir links. Default = primera bodega activa por orden alfabético (típicamente "Principal"). Vista matriz multi-bodega queda para reportes en Fase 8. |
| Bodega default en SaleForm | **"Principal"** preseleccionada cuando hay 2+ bodegas activas. Predecible (la mayoría de ventas salen del local físico). El selector solo aparece visible cuando hay >1 activa — con una sola se asigna automáticamente sin UI. |
| Cancelación de transferencias | Permitida con motivo obligatorio (min 5 chars). Genera movimientos compensatorios: `TRANSFER_IN` en origen (devuelve) + `TRANSFER_OUT` en destino (saca). Si el stock destino ya se consumió en una venta posterior, la cancelación falla con 409 — comportamiento deliberado: la cancelación no puede dejar stock negativo silenciosamente. |
| Stock en form de transferencia | **Bloquea** si la cantidad excede stock origen (rojo, como SaleForm). Una transferencia es una operación contable real — no se puede mover más mercadería que la que hay. Si el stock está mal contado, primero se hace ajuste. |
| Edición de ubicación por bodega | **Inline en `/inventario`** — nueva columna "Ubicación", click para editar, Enter/blur guarda. Max 30 chars. Si la fila Stock no existe todavía, se crea con qty=0 y la ubicación seteada. |
| Migración de `Product.location` | Los valores existentes se copian a `Stock.locationCode` para los stocks de la bodega "Principal" en la migración. El campo `Product.location` queda **deprecated** (no se edita ni se muestra desde la UI) pero no se dropea — una futura migración lo elimina cuando sea seguro. |
| Bodega "Mercado Libre Full" | **Seedeada con `isActive=false`** (idempotente entre migración y seed). Aparece en `/almacenes` como deshabilitada; el cliente la activa cuando empieza a operar con ML. Cuando se decida la integración API ML real (decisión #5 pendiente), la bodega ya existe con el id correcto. |

### Schema

#### Migración [`1778900000000-MultiWarehousePhase75.ts`](apps/api/src/database/migrations/1778900000000-MultiWarehousePhase75.ts)

| Cambio | Tabla / Enum | Notas |
| --- | --- | --- |
| Enum extendido | `inventory_movements.type` | Agrega `TRANSFER_OUT` y `TRANSFER_IN`. Se reescribe la columna con `MODIFY COLUMN` (MySQL no soporta `ALTER ... ADD VALUE` para enums). |
| `isActive` | `warehouses` | Boolean, default `true`. Backfill: todas las filas existentes quedan activas. |
| `locationCode` | `stocks` | `varchar(30)` nullable. **Backfill**: copia `products.location` a `stocks.locationCode` para los stocks de la bodega "Principal" en una sola query `UPDATE ... INNER JOIN`. |
| Tabla nueva | `transfers` | `id`, `number` (correlativo `TRF-AAAA-NNNNN`, único), `fromWarehouseId`, `toWarehouseId` (FK RESTRICT), `date`, `notes`, `status` (`COMPLETED`/`CANCELLED`, default `COMPLETED`), `cancelledAt`, `cancelReason`, `cancelledById` (FK SET NULL a `users`), `userId` (FK RESTRICT), timestamps. |
| Tabla nueva | `transfer_items` | `id`, `transferId` (FK CASCADE), `productId` (FK RESTRICT), `qty`, `unitCost` nullable. |
| Seed idempotente | `warehouses` | INSERT de "Mercado Libre Full" con `isActive=false` si no existe. |

> El `down` revierte en orden inverso. Drop tablas → restaurar enum a 5 valores → drop `isActive` y `locationCode`. El delete de "Mercado Libre Full" en down verifica que no tenga movimientos/stocks/ventas asociados antes de borrarla (defensa contra pérdida de datos).

### Backend

#### Módulo nuevo [`apps/api/src/warehouses/`](apps/api/src/warehouses/)

- **`WarehousesService`** — CRUD con búsqueda libre `q`, filtro `active=true|false` y paginación opcional. El `remove` intenta hard delete y cae a soft delete si la FK rechaza (sin pasar por el helper `rethrowFkAsConflict` — la lógica está inline para distinguir FK errors de otros errores de DB).
- **`WarehousesController`** — endpoints estándar: `GET /warehouses`, `GET /warehouses/:id`, `POST`, `PATCH /:id` (incluye `isActive` para toggle), `DELETE /:id` (devuelve `{ok, softDeleted: boolean}` para que el frontend muestre el toast correcto).

#### Módulo nuevo [`apps/api/src/transfers/`](apps/api/src/transfers/)

- **`TransfersService.create(dto, userId)`** — único punto de creación. Valida: bodegas distintas, ambas activas, items sin duplicados, productos existentes. En una transacción atómica:
  1. Genera correlativo `TRF-AAAA-NNNNN` vía `CountersService.nextNumber('TRANSFER', ...)`.
  2. Persiste `Transfer` (status `COMPLETED`) + cada `TransferItem` con `unitCost` copiado del costo actual del producto.
  3. Por cada item: `applyMovement(TRANSFER_OUT, qty=-x)` en origen + `applyMovement(TRANSFER_IN, qty=+x)` en destino. Si el stock origen no alcanza, `applyMovement` tira 409 y aborta toda la transacción.
- **`TransfersService.cancel(id, dto, userId)`** — en una transacción: por cada item emite `TRANSFER_IN` en origen + `TRANSFER_OUT` en destino (compensación simétrica), luego marca `status=CANCELLED` con `cancelledAt`, `cancelReason`, `cancelledById`. Si el stock destino ya se consumió, la segunda `applyMovement` falla con 409 — correcto.
- **`TransfersController`** — `GET /transfers` (paginado con filtros), `GET /transfers/:id`, `POST`, `POST /:id/cancel`.

#### InventoryService extendido — [`apps/api/src/inventory/inventory.service.ts`](apps/api/src/inventory/inventory.service.ts)

- `listStock` ahora devuelve `locationCode` y `stockId` por fila. Búsqueda libre `q` también matchea contra `locationCode` (`s.locationCode LIKE :q`).
- `defaultWarehouseId` ahora filtra `where: { isActive: true }` — nunca devuelve una bodega inactiva.
- **Método nuevo** `setLocationCode(productId, warehouseId, value)` — upsert: si la fila Stock no existe, la crea con `qty=0` y el code. Validación: max 30 chars. Endpoint: `PATCH /inventory/stock/location`.

### Frontend

#### API clients nuevos

- [`warehouses-api.ts`](apps/web/lib/warehouses-api.ts) — `listWarehouses`, `getWarehouse`, `createWarehouse`, `updateWarehouse`, `deleteWarehouse`.
- [`transfers-api.ts`](apps/web/lib/transfers-api.ts) — `listTransfers`, `getTransfer`, `createTransfer`, `cancelTransfer`.
- [`inventory-api.ts`](apps/web/lib/inventory-api.ts) extendido — `setStockLocation` para la edición inline.

#### Pantallas nuevas

- [`/almacenes`](apps/web/app/(dashboard)/almacenes/page.tsx) — listado con todas las bodegas (activas e inactivas). Filas inactivas en gris. Acciones por fila: **Toggle Activo/Inactivo**, **Editar** (dialog con nombre + dirección), **Eliminar** (intenta hard delete, fallback a soft).
- [`/transferencias`](apps/web/app/(dashboard)/transferencias/page.tsx) — listado paginado con filtros: estado, bodega origen, bodega destino, fechas, búsqueda libre (matchea número o nombre de bodega). Bodegas inactivas aparecen en los selectores de filtro con sufijo "(inactiva)" para poder filtrar historial.
- [`/transferencias/nueva`](apps/web/app/(dashboard)/transferencias/nueva/page.tsx) — wrapper de [`TransferForm`](apps/web/components/forms/transfer-form.tsx). Selectores origen → destino (con valores cruzados deshabilitados para evitar misma=misma), tabla de items con stock origen visible, bloqueo si excede, textarea de notas.
- [`/transferencias/[id]`](apps/web/app/(dashboard)/transferencias/[id]/page.tsx) — detalle con flecha visual origen → destino, tabla de items, banner rojo cuando está cancelada (motivo + auditoría), botón **Cancelar transferencia** que abre [`CancelTransferDialog`](apps/web/components/forms/cancel-transfer-dialog.tsx).

#### Pantallas actualizadas

- [`/inventario`](apps/web/app/(dashboard)/inventario/page.tsx) — **selector de bodega** al tope (sincronizado con URL en `?warehouse=<id>`). Nueva columna **"Ubicación"** con edición inline (click → input → Enter/blur guarda, Escape cancela). Búsqueda libre extendida para matchear contra `locationCode`. Default a la primera bodega activa.
- [`/inventario/movimientos`](apps/web/app/(dashboard)/inventario/movimientos/page.tsx) — tipos `TRANSFER_IN` y `TRANSFER_OUT` agregados al selector + al renderer de badge (color violeta para diferenciar de compras/ventas).
- [`SaleForm`](apps/web/components/forms/sale-form.tsx) — **selector de bodega** ahora visible cuando hay 2+ bodegas activas (preselecciona "Principal"). El `warehouseId` viaja en el payload del create. El stock disponible se consulta para la bodega elegida.
- [`Sidebar`](apps/web/components/sidebar.tsx) — items "Almacenes" y "Transferencias" agregados a la sección Operación.

### DTOs compartidos — [`packages/shared/src/types.ts`](packages/shared/src/types.ts)

Agregados:
- `WarehouseDto`, `CreateWarehouseInput`, `UpdateWarehouseInput`.
- `TransferStatusDto = 'COMPLETED' | 'CANCELLED'`.
- `TransferDto`, `TransferItemDto`, `CreateTransferInput`, `CreateTransferItemInput`, `CancelTransferInput`.

Modificados:
- `StockSummary` ahora incluye `locationCode: string | null` y `stockId: string | null`.
- `MovementDto.type` ahora incluye `'TRANSFER_OUT' | 'TRANSFER_IN'`.
- `StockSummary.product.location` marcado `@deprecated` (sigue presente para retrocompatibilidad).

Y en [`packages/shared/src/enums.ts`](packages/shared/src/enums.ts):
- `InventoryMovementType` extendido con `TRANSFER_OUT` y `TRANSFER_IN`.
- `TransferStatus` agregado.

### Seed

[`run-seeds.ts`](apps/api/src/database/seeds/run-seeds.ts) actualizado para crear ambas bodegas idempotentemente: "Principal" (activa) y "Mercado Libre Full" (inactiva). La migración 1778900000000 también la crea idempotentemente — la duplicación es deliberada para que instalaciones nuevas que corren `db:seed` antes que las migraciones igual queden con ambas bodegas.

### Verificación end-to-end de la fase

| Caso | Resultado esperado |
| --- | --- |
| Crear bodega nueva | Aparece en `/almacenes` activa, disponible en selectores de venta y transferencia. |
| Eliminar bodega virgen | Hard delete: desaparece de la lista. Toast: "Bodega eliminada". |
| Eliminar bodega con historial | Soft delete: queda en la lista en gris con badge "Inactiva". Toast: "Bodega desactivada (tenía movimientos asociados)". |
| Reactivar bodega | Click ⚡ → queda activa, vuelve a aparecer en selectores. |
| Transferir 10 unidades de Principal → ML Full | Movimientos: `TRANSFER_OUT -10` en Principal + `TRANSFER_IN +10` en ML Full. Visibles en `/inventario/movimientos` con badge violeta. Stock baja en Principal, sube en ML. |
| Transferir excediendo stock | Botón "Confirmar" deshabilitado. Banner rojo "Hay items que exceden el stock disponible". Backend revalida igual con 409. |
| Cancelar transferencia | Stock vuelve a Principal, baja de ML. Compensación visible en movimientos. Si ML ya vendió ese stock → 409 al cancelar. |
| Editar ubicación inline | Click en celda Ubicación → input → escribir "A-12-3" → Enter → guarda. Si producto nunca tuvo stock en esa bodega, se crea el row Stock con qty=0 + locationCode. |
| Cambiar bodega en `/inventario` | Tabla se actualiza con el stock de la otra bodega. URL incluye `?warehouse=<id>`. |
| Venta desde Principal o ML Full | Selector de bodega visible (hay 2 activas). Stock baja de la bodega elegida. |
| Quotación de un producto vacío en Principal pero con stock en ML | El warning ámbar de Fase 6 usa la bodega "Principal" por defecto. Para vender desde ML, el operador convierte y elige la bodega en el SaleForm. |

### Tests / health

- `pnpm --filter @inventory/api typecheck` ✅
- `pnpm --filter @inventory/web typecheck` ✅
- `pnpm --filter @inventory/shared build` ✅
- Migración aplicable (`db:migrate`) — verificar antes de deployar a entornos con datos existentes.

### Pendientes para fases futuras

- **Integración API Mercado Libre Full** (decisión #5 pendiente): hoy el flujo es 100% manual — el operador registra la transferencia desde Principal a ML Full y, cuando ML vende, registra una venta eligiendo bodega ML. Cuando se confirme el alcance con el cliente, agregar sincronización automática vía API ML.
- **Etiquetas con código de ubicación** (Fase 11): el endpoint de generación de etiquetas térmicas 50×30 mm podrá incluir el `Stock.locationCode` de la bodega seleccionada — útil para que el equipo sepa dónde pegar cada etiqueta.
- **Drop `Product.location`**: futura migración que elimina la columna deprecada una vez confirmado que ningún consumidor la lee.

---

## Fase 7.6 — Devoluciones y garantías

Cierra el ciclo post-venta del MVP. Las **devoluciones** son operaciones contables que mueven stock y caja en simetría con la venta/compra original. Las **garantías** son un seguimiento informativo de reclamos que NO afecta stock automáticamente — si la resolución implica cambio o reembolso, el operador hace la devolución por separado.

### Decisiones de negocio acordadas

| Tema | Decisión |
| --- | --- |
| Schema de devoluciones | **Tabla única `returns`** con discriminador `type` (`CUSTOMER` / `SUPPLIER`). Para `CUSTOMER` se llena `saleId`; para `SUPPLIER`, `purchaseEntryId`. Permite listado unificado en `/devoluciones` con badge de origen. La integridad se valida en el service (XOR de los dos FKs). |
| Efecto en caja (cliente) | `CashTransaction(EXPENSE, source=SALE_RETURN)` por el monto total a devolver. **Método de pago elegible** por el operador (default = método de la venta original — venta con tarjeta puede devolverse en efectivo si el operador lo decide). Esto se separa de la cancelación de venta (que es all-or-nothing y voidea las transacciones originales). |
| Efecto en caja (proveedor) | `CashTransaction(INCOME, source=PURCHASE_RETURN)` — el proveedor nos reembolsa. Mismo selector de método de pago. Simetría con el flujo de cliente. |
| Estado del producto devuelto | **Selector por ítem** "Vendible" / "Dañado". `RESELLABLE` emite el movimiento de stock (`RETURN_IN` cliente, `RETURN_OUT` proveedor). `DAMAGED` NO mueve stock — queda como pérdida del negocio sin restock. El reembolso en caja sí ocurre en ambos casos. |
| Devoluciones parciales | **Sí, con validación anti-doble-devolución**: el sistema lleva el acumulado de qty devuelto por cada `saleItemId` (solo COMPLETED, las CANCELLED liberan el cupo). El form solo permite hasta `qtyVendido - qtyYaDevuelto`. Backend revalida en duro. |
| Cancelación de devoluciones | **Permitida con motivo obligatorio** (min 5 chars). Reversión atómica: emite el movimiento inverso de stock (solo si era RESELLABLE) + voidea la cash transaction con compensación. Si el stock ya se consumió en otra operación, la cancelación falla con 409. |
| Numeración | Correlativo `DEV-AAAA-NNNNN` único, generado vía `CountersService.nextNumber('RETURN', ...)` con lock pesimista por `(kind, year)`. |
| Esquema de garantías | Tabla `warranty_claims` (id, number, saleItemId, productId, customerId, status, openedAt, resolvedAt?, resolution?, notes?, linkedReturnId?, userId). **NO afecta stock**. Estados `OPEN` → `IN_REVIEW` → (`APPROVED` → `RESOLVED`) o (`REJECTED`). |
| Múltiples reclamos por SaleItem | **Permitido si los previos están en estado terminal** (`REJECTED` o `RESOLVED`). Mientras haya uno activo (`OPEN`, `IN_REVIEW`, `APPROVED`), el sistema bloquea abrir otro sobre el mismo ítem. |
| Resolución con cambio de producto | **Manual**: cuando el reclamo se marca `APPROVED`, aparece un banner verde que sugiere crear una devolución desde la venta. La garantía queda como bitácora; el operador hace la devolución por separado y el frontend linkea ambas vía `linkedReturnId`. No hay efecto automático en stock — respeta la regla del PLAN ("garantías NO disparan movimientos"). |
| Transiciones de estado | Validadas en backend: `OPEN → IN_REVIEW/REJECTED`, `IN_REVIEW → APPROVED/REJECTED`, `APPROVED → RESOLVED`. Estados terminales (`REJECTED`, `RESOLVED`) no permiten transición. Transición a `RESOLVED` o `REJECTED` requiere `resolution` (texto obligatorio). |
| Numeración garantías | Correlativo `GAR-AAAA-NNNNN` único, mismo patrón que devoluciones (counter kind `'WARRANTY'`). |
| Punto de entrada | **Devoluciones**: botón "Crear devolución" en el detalle de la venta (`/ventas/[id]`) + listado dedicado `/devoluciones`. Para devoluciones a proveedor, equivalente desde el detalle de compra (futuro `/compras/[id]/detalle`). **Garantías**: botón "Abrir reclamo" en cada fila de items de `/ventas/[id]` + listado `/garantias`. |

### Schema

#### Migración [`1779000000000-ReturnsAndWarrantiesPhase76.ts`](apps/api/src/database/migrations/1779000000000-ReturnsAndWarrantiesPhase76.ts)

| Cambio | Tabla / Enum | Notas |
| --- | --- | --- |
| Enum extendido | `cash_transactions.source` | Agrega `SALE_RETURN` y `PURCHASE_RETURN`. Permite filtrar en el libro de caja las transacciones de reembolso por separado de ventas y compras directas. |
| Tabla nueva | `returns` | `id`, `number` único (correlativo `DEV-AAAA-NNNNN`), `type` enum, `saleId` y `purchaseEntryId` ambos nullable (XOR por service), `warehouseId` FK RESTRICT, `date`, `reason`, `notes`, `refundAmount`, `paymentMethod`, `status` (`COMPLETED`/`CANCELLED`), auditoría completa de cancelación. |
| Tabla nueva | `return_items` | `returnId` FK CASCADE, `productId` FK RESTRICT, `saleItemId` y `purchaseEntryItemId` ambos nullable según tipo, `qty`, `unitPrice`, `unitCost`, `subtotal`, `itemCondition` enum (`RESELLABLE`/`DAMAGED`). |
| Tabla nueva | `warranty_claims` | `id`, `number` único (correlativo `GAR-AAAA-NNNNN`), `saleItemId` FK RESTRICT, `productId`, `customerId`, `status` enum, `openedAt`, `resolvedAt`, `resolution`, `notes`, `linkedReturnId` FK SET NULL (link opcional a la devolución que cerró el reclamo). |

> El `down` revierte en orden inverso (drop tablas → restaurar enum). Idempotente.

### Backend

#### Módulo nuevo [`apps/api/src/returns/`](apps/api/src/returns/)

- **`ReturnsService.create(dto, userId)`** — único punto de creación. En una transacción atómica:
  1. Valida coherencia type↔saleId/purchaseEntryId (XOR).
  2. Para CUSTOMER: valida que la venta exista y no esté `CANCELLED`. Calcula la qty ya devuelta por cada `saleItemId` y rechaza si la nueva qty + acumulada excede lo vendido.
  3. Para SUPPLIER: valida que la compra exista. Default `warehouseId` = primera bodega activa.
  4. Genera `DEV-AAAA-NNNNN` con `CountersService`.
  5. Persiste `Return` + cada `ReturnItem`.
  6. Por cada item RESELLABLE emite el movimiento correspondiente (`RETURN_IN` cliente, `RETURN_OUT` proveedor). Items DAMAGED no mueven stock.
  7. Registra `CashTransaction` con el `source` correcto y el `paymentMethod` elegido por el operador.
- **`ReturnsService.cancel(id, dto, userId)`** — reversión atómica:
  1. Emite movimientos inversos para cada item RESELLABLE (cliente: `RETURN_OUT`, proveedor: `RETURN_IN`). DAMAGED no se revierte (nunca movió stock).
  2. Voidea las cash transactions con `source=SALE_RETURN` o `PURCHASE_RETURN` y `sourceId=id` vía `cashbox.voidTransaction`.
  3. Marca `status=CANCELLED` con auditoría.
- **`ReturnsService.returnedQtyBySale(saleId)`** — helper consumido por el frontend para limitar la qty máxima en el form: suma de `qty` por `saleItemId` en returns COMPLETED.
- **Endpoints**: `GET /returns`, `GET /returns/:id`, `GET /returns/by-sale/:saleId/returned-qty`, `POST /returns`, `POST /returns/:id/cancel`.

#### Módulo nuevo [`apps/api/src/warranties/`](apps/api/src/warranties/)

- **`WarrantiesService.create(dto, userId)`** — valida que no haya un reclamo activo sobre el mismo SaleItem (los terminales `REJECTED` / `RESOLVED` liberan). Genera correlativo `GAR-AAAA-NNNNN`. Persiste con status `OPEN`. No toca stock.
- **`WarrantiesService.updateStatus(id, dto)`** — valida transición legal según tabla `VALID_TRANSITIONS`. Para `RESOLVED` / `REJECTED` exige texto de `resolution`. Setea `resolvedAt` automáticamente al cerrar.
- **`WarrantiesService.linkReturn(id, returnId)`** — endpoint helper: el frontend lo llama tras crear una devolución desde el flujo de reclamo aprobado, así queda registrado el link `WarrantyClaim.linkedReturnId → Return.id` (visible en el detalle del reclamo).
- **Endpoints**: `GET /warranties`, `GET /warranties/:id`, `POST /warranties`, `PATCH /warranties/:id/status`, `POST /warranties/:id/link-return/:returnId`.

### DTOs compartidos — [`packages/shared/src/types.ts`](packages/shared/src/types.ts)

Agregados:
- `ReturnTypeDto`, `ReturnStatusDto`, `ReturnItemConditionDto`.
- `ReturnDto`, `ReturnItemDto`, `CreateReturnInput`, `CreateReturnItemInput`, `CancelReturnInput`, `ReturnedQtyDto`.
- `WarrantyStatusDto`.
- `WarrantyClaimDto`, `CreateWarrantyClaimInput`, `UpdateWarrantyClaimStatusInput`.

En [`packages/shared/src/enums.ts`](packages/shared/src/enums.ts):
- `CashTransactionSource` extendido con `SALE_RETURN` y `PURCHASE_RETURN`.
- `ReturnType`, `ReturnStatus`, `ReturnItemCondition`, `WarrantyStatus`.

### Frontend

#### Componentes nuevos

- [`CustomerReturnForm`](apps/web/components/forms/customer-return-form.tsx) — form que muestra los items de la venta y, para cada uno: input numérico de cantidad a devolver (max = vendido - ya devuelto), selector de condición (Vendible/Dañado), precio congelado de la venta. Muestra el total a reembolsar en tiempo real. Selector de método de reembolso (default = método de la venta original).
- [`CustomerReturnDialog`](apps/web/components/forms/customer-return-dialog.tsx) — wrapper en `<Dialog>` del CustomerReturnForm. Al guardar, redirige al detalle de la devolución creada.
- [`CancelReturnDialog`](apps/web/components/forms/cancel-return-dialog.tsx) — pide motivo obligatorio (min 5 chars), explica el alcance de la reversión, invalida queries de stock/caja/movimientos al cerrar.
- [`OpenWarrantyDialog`](apps/web/components/forms/open-warranty-dialog.tsx) — desde una fila de item en `/ventas/[id]`: dialog con datos readonly del producto + textarea de descripción inicial del problema. Al guardar, redirige al detalle del reclamo.
- [`ReturnStatusBadge`](apps/web/components/return-status-badge.tsx) + [`ReturnTypeBadge`](apps/web/components/return-status-badge.tsx) — badges visuales.
- [`WarrantyStatusBadge`](apps/web/components/warranty-status-badge.tsx) — colores distintos por estado (azul=Abierto, ámbar=En revisión, verde=Aprobado, rojo=Rechazado, gris=Resuelto).

#### Pantallas nuevas

- [`/devoluciones`](apps/web/app/(dashboard)/devoluciones/page.tsx) — listado paginado con filtros (tipo, estado, fechas, búsqueda libre). Sin botón "Nueva" en la pantalla — se crea desde el detalle de la venta/compra origen.
- [`/devoluciones/[id]`](apps/web/app/(dashboard)/devoluciones/[id]/page.tsx) — detalle con bloques de Origen (link a venta/compra), Reembolso (monto + método + bodega), Motivo y Notas, tabla de items con badge de condición (Vendible/Dañado), botón "Cancelar devolución" si el status es COMPLETED.
- [`/garantias`](apps/web/app/(dashboard)/garantias/page.tsx) — listado paginado con filtros (estado, fechas, búsqueda). Columnas: número, fecha apertura, producto, cliente, venta origen, estado.
- [`/garantias/[id]`](apps/web/app/(dashboard)/garantias/[id]/page.tsx) — detalle con bloques de Producto, Cliente, Venta origen + Devolución vinculada si existe. Banner verde sugiriendo "Ir a la venta para crear devolución" cuando el reclamo está APPROVED y no tiene `linkedReturnId`. Botones de transición de estado (Pasar a revisión / Aprobar / Rechazar / Resolver) con dialog que pide resolución obligatoria para estados terminales.

#### Pantallas actualizadas

- [`/ventas/[id]`](apps/web/app/(dashboard)/ventas/[id]/page.tsx) — botón "Crear devolución" agregado al header (junto a "Cancelar venta"). En cada fila de la tabla de items, ícono ⚠️ "Abrir reclamo de garantía". Los dialogs se montan al final del componente.
- [`Sidebar`](apps/web/components/sidebar.tsx) — items "Devoluciones" y "Garantías" agregados a la sección Operación.

### Verificación end-to-end de la fase

| Caso | Resultado esperado |
| --- | --- |
| Devolución parcial de un ítem (Vendible) | Stock sube en la bodega original de la venta (`RETURN_IN`). Caja baja por el monto reembolsado (`CashTransaction(EXPENSE, source=SALE_RETURN)`). Aparece en `/inventario/movimientos`. Vuelve a `/ventas/[id]` y `Cant.` original sigue igual (la venta no se altera). |
| Devolución parcial (Dañado) | NO mueve stock. Solo se registra la caja como EXPENSE. Útil para reembolsos sin restock. |
| Devolver más de lo vendido | Backend devuelve 409 con mensaje claro indicando cuántas unidades quedan disponibles. Frontend bloquea antes con el atributo `max` del input. |
| Devolver 2 veces el mismo ítem | Segunda devolución solo permite hasta `qtyVendido - qtyDevueltoEnPrimera`. Acumulado se calcula desde DB (`returnedQtyBySale`). |
| Cancelar devolución | Stock vuelve al estado pre-devolución (`RETURN_OUT` si era Vendible). Caja se compensa (EXPENSE → INCOME vía voidTransaction). Si stock ya se consumió en otra operación, 409 — correcto. |
| Devolución a proveedor (Vendible) | Stock baja de la bodega Principal (`RETURN_OUT`). Caja sube por el monto reembolsado (`CashTransaction(INCOME, source=PURCHASE_RETURN)`). |
| Abrir reclamo de garantía sobre ítem ya tenía uno activo | Backend devuelve 409 indicando el número del reclamo existente. |
| Abrir reclamo tras uno RESOLVED | Permitido — el sistema considera RESOLVED y REJECTED como terminales. |
| Transición OPEN → APPROVED | 409 — debe pasar por IN_REVIEW primero. |
| RESOLVED sin texto de resolución | 400 — el backend exige `resolution` para estados terminales. |
| Reclamo APPROVED + crear devolución desde la venta | Operador hace click en banner del detalle del reclamo → navega a la venta → crea devolución. Backend setea `WarrantyClaim.linkedReturnId` al detectar el flujo (TODO: hoy es manual desde frontend vía `linkReturn` API; la auto-detección queda para refinamiento futuro). |

### Tests / health

- `pnpm --filter @inventory/api typecheck` ✅
- `pnpm --filter @inventory/web typecheck` ✅
- `pnpm --filter @inventory/shared build` ✅
- Migración aplicable (`db:migrate`).

### Pendientes para fases futuras

- **Auto-link warranty → return**: hoy el operador puede crear una devolución desde la venta y un reclamo en paralelo sin que queden linkeados automáticamente. El endpoint `POST /warranties/:id/link-return/:returnId` existe pero la UI no lo dispara — refinamiento para una ronda posterior cuando se vea el flujo real.
- **Auto-detección de devolución total**: si una devolución cubre el 100% de los items vendidos, sugerir al operador cancelar la venta en lugar (es operativamente más limpio porque libera el cupo de "ya devuelto").
- **Devoluciones a proveedor desde la UI**: el backend soporta `SUPPLIER` returns, pero el frontend solo tiene el flujo `CUSTOMER` desde el detalle de venta. Para SUPPLIER, una pantalla "Nueva devolución a proveedor" desde `/compras/[id]` queda como mejora.

---

## Fase 7.7 — Guía de despacho

Documento operativo paralelo a la "Nota de venta" para el envío físico de los productos. Mientras la nota de venta es el comprobante comercial (con totales, IVA, método de pago), la guía es el papel que acompaña al paquete: dirección de entrega, transportista, tracking, items con cantidades. NO afecta stock ni caja — es estrictamente operativo.

### Decisiones de negocio acordadas

| Tema | Decisión |
| --- | --- |
| Cuándo se genera | **Manual** con botón "Generar guía de despacho" en el detalle de la venta. No se genera automáticamente al confirmar la venta — muchas ventas mostrador (cliente se lleva el producto en el momento) no requieren guía. Generar automáticamente para todas ensuciaría el listado de `/guias` con guías que no son envíos reales. |
| Relación venta ↔ guía | **1 venta puede tener N guías a lo largo del tiempo, pero solo UNA activa** simultáneamente. Si el operador detecta un error (transportista mal cargado, dirección incorrecta), anula la guía actual y genera una nueva. La anulada queda en el historial con correlativo + motivo. Backend rechaza generar una segunda guía activa con 409. |
| Dirección de entrega | **Snapshot pre-llenado desde el cliente, editable** por guía. El operador puede modificar `addressStreet`, `addressNumber`, `communeId` y `addressNotes` para esta guía específica sin alterar al cliente. Usa el componente `<CommuneSelect>` con las 346 comunas chilenas. |
| Transportista | **Texto libre con sugerencias autocompletables**. Input HTML `<input list="...">` que sugiere transportistas usados en guías previas (DISTINCT carrier ordenado por uso). Cero configuración inicial — se adapta al uso real. Sin entidad `Carrier` separada para mantener simple. |
| Cancelar venta con guía activa | **Cascada automática**: si la venta se cancela y tiene guía activa, en la misma transacción atómica de `SalesService.cancel` se marca la guía como `VOIDED` con motivo "Venta cancelada · {motivo}". Coherencia total — una venta cancelada nunca tiene guía activa. La cascada está implementada inline con SQL raw para evitar import circular `SalesModule ↔ DispatchModule`. |
| Numeración | Correlativo `DESP-AAAA-NNNNN` único, generado vía `CountersService.nextNumber('DISPATCH', ...)` con lock pesimista por `(kind, year)`. Las anuladas preservan su correlativo. |
| PDF | **Carta (A4) + Térmica 80mm** con dropdown "Imprimir" en el detalle. Render separado de cotización/venta porque la estructura es distinta (sin totales, sin IVA, foco en envío). Title del documento: "Guía de despacho DESP-2026-00001". Incluye empresa + cliente + dirección de entrega + items con qty (sin precios) + transportista + tracking + observaciones + espacio para firma del receptor. Si la guía está VOIDED, se imprime "ANULADA" en rojo. |
| Punto de entrada | **Botón "Generar guía de despacho"** en `/ventas/[id]` (junto a "Cancelar venta" y "Crear devolución"). Si ya hay guía activa, el botón cambia a **"Ver guía DESP-XYZ"** que linkea al detalle. Listado dedicado `/guias` con filtros pero sin botón "Nueva" — el flujo siempre arranca desde la venta. |

### Schema

#### Migración [`1779100000000-DispatchNotesPhase77.ts`](apps/api/src/database/migrations/1779100000000-DispatchNotesPhase77.ts)

| Cambio | Tabla | Notas |
| --- | --- | --- |
| Tabla nueva | `dispatch_notes` | `id`, `number` único (`DESP-AAAA-NNNNN`), `saleId` FK RESTRICT a `sales`, `dispatchedAt`, `carrier` (varchar 120 nullable), `trackingNumber` (varchar 120 nullable), snapshot de dirección (`addressStreet`, `addressNumber`, `communeId` FK RESTRICT, `addressNotes`), `notes`, `status` enum (`ACTIVE`/`VOIDED`, default `ACTIVE`), auditoría completa de anulación (`voidedAt`, `voidReason`, `voidedById` FK SET NULL), `userId` FK RESTRICT, timestamps. |
| Índices | `dispatch_notes` | `idx_dispatch_notes_number` (unique), `idx_dispatch_notes_sale_status` (compuesto para query "guía activa de esta venta"), `idx_dispatch_notes_dispatched_at`. |

> La regla "1 activa por venta" se valida en service (no hay índice parcial en MySQL). El índice compuesto `(saleId, status)` hace eficiente la query.

### Backend

#### Módulo nuevo [`apps/api/src/dispatch/`](apps/api/src/dispatch/)

- **`DispatchService.create(dto, userId)`** — valida que la venta exista y no esté `CANCELLED`, que no haya guía activa previa (409 si la hay), que la comuna exista. Genera `DESP-AAAA-NNNNN` con `CountersService`. Persiste con snapshot de dirección.
- **`DispatchService.voidNote(id, dto, userId)`** — pasa `status` a `VOIDED` con motivo + auditoría. NO toca stock ni caja. Idempotente: rechaza si ya está anulada.
- **`DispatchService.voidActiveBySale(saleId, reason, userId, manager)`** — invocable desde otra transacción (no usado actualmente vía dependencia para evitar circular, se hace SQL raw desde `SalesService.cancel`). Disponible para uso futuro.
- **`DispatchService.findActiveBySale(saleId)`** — devuelve la guía activa de una venta (o null). Lo consume el detalle de venta para pintar "Generar guía" vs "Ver guía existente".
- **`DispatchService.recentCarriers()`** — top 10 transportistas usados, agrupados y ordenados por frecuencia. Alimenta el datalist de autocompletado en el form.
- **`DispatchController`** — endpoints: `GET /dispatch`, `GET /dispatch/recent-carriers`, `GET /dispatch/by-sale/:saleId/active`, `GET /dispatch/:id`, `POST /dispatch`, `POST /dispatch/:id/void`, `GET /dispatch/:id/pdf?format=letter|thermal80`.

#### Cascada en `SalesService.cancel`

Cuando la venta se cancela, dentro de la misma transacción atómica se anula la guía activa con SQL raw:

```sql
UPDATE dispatch_notes
SET status='VOIDED', voidedAt=NOW(6), voidReason=?, voidedById=?
WHERE saleId=? AND status='ACTIVE'
```

El motivo se compone como `"Venta cancelada · {motivo del cancel}"` para preservar trazabilidad.

#### PdfService extendido — [`pdf.service.ts`](apps/api/src/notifications/pdf.service.ts)

Render separado de cotización/venta porque la estructura es distinta (sin totales, items con solo cantidad + producto, layout de envío). Tipo nuevo `DispatchPdfInput` y dos renderers privados:

- `generateDispatchLetter` — A4 con header empresa, título "Guía de despacho", venta origen, columnas Cliente + Entrega (dirección + transportista + tracking), tabla de items sin precios, observaciones, línea de firma del receptor. Si `voided=true`, imprime "ANULADA" en rojo.
- `generateDispatchThermal` — tirilla 80mm con el mismo contenido en formato compacto.
- Helper `fromDispatchNoteDto(d, settings): DispatchPdfInput` arma el input desde el DTO.
- Método público `generateDispatch(input, format)` — switch entre los dos renderers.

### DTOs compartidos

En [`packages/shared/src/enums.ts`](packages/shared/src/enums.ts):
- `DispatchStatus` (`ACTIVE` / `VOIDED`).

En [`packages/shared/src/types.ts`](packages/shared/src/types.ts):
- `DispatchStatusDto`.
- `DispatchNoteDto` (con sale + customer + items embebidos para evitar refetches).
- `CreateDispatchNoteInput`, `VoidDispatchNoteInput`.

### Frontend

#### API client

- [`dispatch-api.ts`](apps/web/lib/dispatch-api.ts) — `listDispatchNotes`, `getDispatchNote`, `createDispatchNote`, `voidDispatchNote`, `listRecentCarriers`, `getActiveDispatchBySale`, `getDispatchPdfUrl`.

#### Componentes y pantallas nuevas

- [`DispatchStatusBadge`](apps/web/components/dispatch-status-badge.tsx) — verde para `ACTIVE`, rojo con line-through para `VOIDED`.
- [`GenerateDispatchDialog`](apps/web/components/forms/generate-dispatch-dialog.tsx) — form modal con:
  - Fieldset "Dirección de entrega" pre-llenada con la del cliente (usando `getCustomer` + `<CommuneSelect>`), editable.
  - Fieldset "Transporte" con input `<list>` HTML + `<datalist>` alimentado desde `listRecentCarriers`.
  - Observaciones textarea.
  - Al guardar redirige al detalle de la guía.
- [`VoidDispatchDialog`](apps/web/components/forms/void-dispatch-dialog.tsx) — pide motivo obligatorio min 5 chars. Aclara que la anulación NO toca stock ni caja.
- [`/guias`](apps/web/app/(dashboard)/guias/page.tsx) — listado paginado con filtros (estado, búsqueda libre que matchea número + venta + transportista + tracking, rango de fechas). Filas VOIDED en gris. Sin botón "Nueva" (se entra desde la venta).
- [`/guias/[id]`](apps/web/app/(dashboard)/guias/[id]/page.tsx) — detalle con 3 columnas (Venta origen, Dirección de entrega, Transporte) + tabla de items + observaciones. Botones "Anular guía" (si ACTIVE) e "Imprimir" (Carta/Térmica 80mm). Banner rojo con motivo si está VOIDED.

#### Pantalla actualizada

- [`/ventas/[id]`](apps/web/app/(dashboard)/ventas/[id]/page.tsx) — botón nuevo en el header:
  - Si la venta NO tiene guía activa: **"Generar guía de despacho"** (icono camión) abre `GenerateDispatchDialog`.
  - Si la venta YA tiene guía activa: **"Ver guía DESP-XXX"** (link al detalle de la guía).
  - Si la venta está cancelada: ningún botón de guía (los 3 botones — generar guía, devolver, cancelar — se ocultan).
- [`Sidebar`](apps/web/components/sidebar.tsx) — item "Guías de despacho" agregado a la sección Operación.

### Verificación end-to-end de la fase

| Caso | Resultado esperado |
| --- | --- |
| Venta nueva → "Generar guía" | Dialog abre con dirección pre-llenada del cliente. Operador completa carrier + tracking, confirma. Se crea la guía con correlativo `DESP-AAAA-NNNNN` y redirige al detalle. NO toca stock ni caja. |
| Intentar generar segunda guía en la misma venta (con activa) | Botón del detalle de venta YA dice "Ver guía DESP-XXX" en lugar de "Generar guía". Si por alguna razón llega un request directo al endpoint, backend devuelve 409. |
| Anular guía → generar nueva | Guía vieja queda VOIDED con motivo en el historial. El botón vuelve a "Generar guía". La nueva guía obtiene el siguiente correlativo. |
| Cancelar venta con guía activa | En la misma transacción, la guía pasa a VOIDED con motivo "Venta cancelada · {motivo de cancelación}" y `voidedById` setteado. Estado coherente: venta cancelada sin guía activa. |
| PDF Carta | Descarga PDF A4 con título "Guía de despacho DESP-AAAA-NNNNN", empresa, venta origen, dirección de entrega, tabla de items con cantidades sin precios, transportista + tracking, observaciones, línea de firma del receptor. |
| PDF Térmica 80mm | Versión compacta del mismo contenido para tirilla térmica. Sin firma (no aplica al formato). |
| Sugerencias de transportista | Tras generar la primera guía con "Chilexpress", la siguiente vez el datalist sugiere "Chilexpress" al tipear "Chi". |
| Listado `/guias` | Muestra todas las guías con filtros por estado, búsqueda libre (número, venta, transportista, tracking) y rango de fechas. |

### Tests / health

- `pnpm --filter @inventory/api typecheck` ✅
- `pnpm --filter @inventory/web typecheck` ✅
- `pnpm --filter @inventory/shared build` ✅
- Migración aplicable (`db:migrate`).

### Pendientes para fases futuras

- **Envío por email al transportista**: agregar un campo de email del transportista (en la sugerencia) o catálogo de transportistas con datos de contacto, para enviar la guía por email directamente desde el sistema. Hoy se descarga el PDF y se adjunta manualmente.
- **Despachos parciales** (1:N): si el cliente eventualmente necesita despachar items de una venta en múltiples envíos (ej: 2 productos hoy con Chilexpress, 3 mañana con Starken), agregar `dispatch_note_items` con subset de items + qty, validar suma ≤ vendido, soportar "cuánto queda por despachar" en la UI. Mayor scope, mejor postergar hasta que aparezca el caso real.
- **Refinamiento del PDF de la guía** (Fase 11): pulir el layout con branding final, agregar barcode CODE128 del número de tracking, ajustar el espacio para firma según uso real.

---

## Fase 9 — Dashboard mobile-first con KPIs clicables

> Iteración **9.1** entregada (KPIs textuales + alertas). Iteración 9.2 (gráficos) queda como mejora futura si el cliente la pide tras usar el MVP.

### Qué incluye

La pantalla `/` deja de ser un placeholder y pasa a ser el **panel operativo principal**. Mobile-first: grid `grid-cols-1` en mobile, `md:grid-cols-2`, `lg:grid-cols-4`. **Todos los cards son clicables** — cada uno navega al detalle filtrado correspondiente.

Cuatro secciones:

1. **Operación del día** (granularidad nueva — la operación diaria):
   - **Ventas del día** (count + monto facturado) → `/ventas?dateFrom=hoy&dateTo=hoy`.
   - **Cotizaciones del día** (count + monto cotizado) → `/cotizaciones?dateFrom=hoy&dateTo=hoy`.
   - **Caja disponible** (total + desglose por método CASH/TRANSFER/CARD) → `/caja`.

2. **Embudo comercial** (depende de Fase 8.5):
   - **Pendientes de seguimiento** (`QUOTED + FOLLOW_UP`) — ámbar si > 0 → `/seguimiento?tab=pendientes`.
   - **Vencidos** (`FOLLOW_UP`) — destructivo si > 0 → `/seguimiento?tab=vencidos`.
   - **Ventas ganadas del mes** (clientes `WON` con `lastContactAt` en el mes) → `/ventas?status=PAID&dateFrom=mes-actual`.

3. **Mes actual**:
   - **Utilidad del mes** = `subtotal_ventas_no_canceladas − COGS − gastos_no_anulados`. Decisión: dejar el IVA débito afuera porque no es ganancia operativa real (se balancea contra IVA crédito en el reporte de IVA). Verde si ≥ 0, destructivo si < 0.
   - **Valor inventario**: `SUM(stock.quantity × product.cost)` sobre productos activos.
   - **Gastos del mes**: suma de `expense.amount` excluyendo anulados.

4. **Alertas**:
   - **Stock crítico** (count productos `out`) — destructivo si > 0 → `/inventario?status=out`.
   - **Bajo stock** (count `low`) — ámbar si > 0 → `/inventario?status=low`.
   - **Sin movimiento 30d** (productos activos sin ningún movimiento en los últimos 30 días) → `/reportes/sin-movimiento`.
   - **Rotación de inventario** (`COGS_mes / inventario_actual`, marcado como aprox. mientras no exista snapshot histórico) → `/reportes/sin-movimiento`.

### Backend

[`GET /api/dashboard/summary`](apps/api/src/dashboard/dashboard.controller.ts) — endpoint único agregado. Llama `Promise.all` con todas las queries (12 paralelas) y devuelve un objeto con los 4 grupos. El frontend lo cachea con TanStack Query (refetch cada 60s).

```ts
type DashboardSummaryDto = {
  today: { sales, quotations, cash };
  lifecycle: { pendingFollowUp, overdueFollowUp, wonThisMonth };
  month: { profit, salesSubtotal, cogs, expenses, inventoryValue };
  alerts: { outOfStock, lowStock, noMovement30d, inventoryTurnover, inventoryTurnoverIsApprox };
};
```

[`GET /api/reports/no-movement?days=30|60|90|180`](apps/api/src/reports/reports.service.ts) — reporte nuevo de productos sin movimiento. Devuelve fila por producto con `sku`, nombre, categoría, marca, stock total agregado, valor inmovilizado, fecha del último movimiento y días transcurridos. También `GET /api/reports/no-movement.csv` exporta a CSV con BOM UTF-8.

### Frontend

- [`apps/web/app/(dashboard)/page.tsx`](apps/web/app/(dashboard)/page.tsx) — dashboard principal, client component que usa `useQuery({ refetchInterval: 60_000 })`. Estructura: 4 `<Section>` con cards `<KpiCard>`. Cards usan `<Link>` (no `<button>`) para soportar middle-click y prefetch.
- [`apps/web/app/(dashboard)/reportes/sin-movimiento/page.tsx`](apps/web/app/(dashboard)/reportes/sin-movimiento/page.tsx) — listado tabular con selector de días (30/60/90/180), 2 cards de totales (productos + valor inmovilizado), botón "Exportar CSV".
- [`apps/web/lib/dashboard-api.ts`](apps/web/lib/dashboard-api.ts) — wrappers axios + `getNoMovementCsvUrl()`.
- Entrada en el sidebar bajo **Reportes**: "Sin movimiento".

### Cómo testear

Ver [TEST.md](TEST.md#fase-9--dashboard) — sección "Fase 9".

### Decisiones de diseño

- **Un endpoint vs varios**: elegido endpoint agregado por mobile-first (menos round trips). Hay 12 queries en paralelo en backend; el response típico pesa ~1 KB.
- **Refresh automático cada 60s**: balance entre datos frescos y costo. El operador puede pull-to-refresh manualmente si quiere ver cambios instantáneos.
- **Rotación de inventario aproximada**: `COGS_mes / inventario_ACTUAL` (no promedio del mes) — single-point. La fórmula correcta requiere un job diario que snapshote stock, lo que aún no tenemos. Marcamos `inventoryTurnoverIsApprox: true` en el response y la UI muestra "aprox." debajo del número.
- **"Ventas ganadas del mes"**: conteo de clientes `WON` con `lastContactAt` en el mes (no de ventas individuales) — coincide con la semántica del embudo de Fase 8.5.

---

## Fase 10 — Carga masiva Excel

Importador de productos en bloque para acelerar la carga inicial del catálogo o actualizaciones masivas (precio, costo, códigos compatibles). Flujo de 2 pasos: **subir → preview → confirmar**.

### Decisiones de diseño

- **Estrategia: UPSERT por SKU.** Si el SKU del Excel ya existe en el sistema, la fila lo **actualiza**; si no, lo **crea**. Permite cargar planillas incrementales sin duplicados ni errores. El preview marca cada fila como "Nuevo" (badge verde) o "Actualizar" (badge azul) antes de confirmar.
- **Auto-create de categorías y marcas.** Si la columna `Categoria` trae un nombre que no existe en el sistema, se crea automáticamente al confirmar. Idem `Marca`. El preview los lista como "Se crearán automáticamente: 5 categorías, 3 marcas" para que el operador no se sorprenda.
- **Partial success.** Si una fila tiene error (SKU vacío, costo no numérico, etc.), se reporta en el preview con número de fila + motivo. Al confirmar, **las filas válidas se importan y las inválidas se omiten** — no se aborta el batch. La pantalla de resultado lista cada error para que el operador corrija y re-suba si quiere.
- **No carga stock inicial.** El Excel solo define metadata del catálogo. Stock arranca en 0 en todas las bodegas. Para cargar stock inicial el operador hace una compra histórica o un ajuste manual desde `/inventario`.
- **Solo .xlsx (no .csv).** Aprovecha celdas tipadas y soporte nativo de Excel/Numbers. Tamaño máximo 5 MB.

### Plantilla

[`GET /api/imports/products/template.xlsx`](apps/api/src/imports/imports.service.ts) — descarga una plantilla con:

- **Hoja "Productos"** con headers en español + 1 fila de ejemplo.
- **Hoja "Instrucciones"** con descripción de cada columna y cuáles son obligatorias.

### Columnas

| Columna del Excel | Obligatoria | Descripción |
| --- | --- | --- |
| `SKU` | ✅ | Código único interno. Sirve de clave para upsert. |
| `Nombre` | ✅ | Nombre comercial. |
| `PartNumber` | — | Código de pieza del fabricante. Indexado para búsqueda. |
| `Codigo de barras` | — | Barcode escaneado. |
| `Codigo universal` | — | Código universal (Fase 4B). Compartido entre productos equivalentes. |
| `Descripcion` | — | Texto libre. |
| `Categoria` | — | Nombre. Si no existe, se crea. Si vacío, producto sin categoría. |
| `Marca` | — | Nombre. Si no existe, se crea. |
| `Costo (bruto)` | — | CLP con IVA. Acepta `8000` o `8.000` o `8,00`. Default 0. |
| `Precio (bruto)` | — | CLP con IVA. Default 0. |
| `Stock minimo` | — | Entero ≥ 0. Default 0. |
| `Stock maximo` | — | Entero ≥ 0. Vacío = sin límite. |
| `Ubicacion (deprecated)` | — | Deprecated desde Fase 7.5. Usar `locationCode` por bodega. |
| `Tipo (ORIGINAL/ALTERNATIVE)` | — | Default ORIGINAL. Acepta también "ALTERNATIVO". |
| `Codigos compatibles (separados por ;)` | — | Lista de equivalencias separados por punto y coma. Ej: `A123; B456; XYZ-789`. Estrategia replace: borra los anteriores y reinserta. |

### Endpoints

- [`POST /api/imports/products/preview`](apps/api/src/imports/imports.controller.ts) — multipart con `file`. Parsea, valida, devuelve `ProductImportPreviewDto` (conteos + primeras 10 filas + errores + categorías/marcas a crear).
- [`POST /api/imports/products/confirm`](apps/api/src/imports/imports.controller.ts) — mismo multipart. Ejecuta el upsert + auto-create. Devuelve `ProductImportResultDto` (importedCount, createdCount, updatedCount, failedCount, errors).
- [`GET /api/imports/products/template.xlsx`](apps/api/src/imports/imports.controller.ts) — descarga la plantilla.

### UI

- **`/productos/importar`** ([apps/web/app/(dashboard)/productos/importar/page.tsx](apps/web/app/(dashboard)/productos/importar/page.tsx)) — drag&drop o file picker. Tres estados:
  1. **Subir**: zona drop con borde punteado. Acepta solo `.xlsx`.
  2. **Preview**: 4 cards de conteo + lista de categorías/marcas a crear + lista de errores + tabla con primeras 10 filas válidas + botones "Cancelar" / "Confirmar e importar N productos".
  3. **Resultado**: card verde de éxito + 4 cards de conteo final + lista de errores no resueltos + botones "Ver catálogo" / "Importar otro Excel".
- Botón **"Importar Excel"** en el header de `/productos` que abre la pantalla.

### Cómo testear

Ver [TEST.md](TEST.md#fase-10--carga-masiva-excel) — sección "Fase 10".

---

## Ronda 5 — Correcciones tras pruebas de Fases 0–7.7

Ronda de bugfixes transversal a partir de las pruebas del cliente. Cuatro problemas más una mejora de UX del sidebar.

### Bug 1 — Validación de RUT inconsistente

El RUT se validaba de forma distinta según el formulario. Ahora **todos** los campos RUT usan el mismo validador (formato + dígito verificador módulo 11) y se normalizan al guardar (`12.345.678-9` → `12345678-9`).

- **Backend** ([`common/validators/rut.ts`](apps/api/src/common/validators/rut.ts)): el decorador `@IsValidRut()` se aplica en `CreateCustomerDto`/`UpdateCustomerDto`, `CreateSupplierDto`/`UpdateSupplierDto`, `CreateQuotationDto.customerTaxIdSnapshot` y `UpdateCompanySettingsDto.taxId`. Los services llaman `normalizeRut()` antes de persistir.
- **Regla campo obligatorio vs opcional**: el RUT del cliente es obligatorio (valida siempre); proveedor, snapshot de cotización libre y RUT de empresa son opcionales — `@IsOptional()` hace que solo se valide si viene con contenido.
- **Frontend** ([`lib/validators/rut.ts`](apps/web/lib/validators/rut.ts)): espejo del validador. Aplicado en `customer-form`, `register-customer-from-snapshot-dialog`, el diálogo de proveedores (`/proveedores`) y `quotation-form` (campo `customerTaxIdSnapshot`). Se normaliza en `onBlur` y al enviar.

### Bug 2 — Solapamiento de rangos de compatibilidad en productos

Al editar un producto, el tab "Compatibilidad" permitía cargar rangos de años solapados para el mismo modelo (ej: `Corolla 2015–2018` y `Corolla 2010–2020`).

- **Fix** ([`components/forms/product-form.tsx`](apps/web/components/forms/product-form.tsx)): el `superRefine` del schema detecta **solapamiento inclusivo** — si dos filas del mismo `modelId` comparten ≥1 año, error inline en la fila (`fitments.<idx>.yearFrom`) que bloquea el guardado.
- **Convención de bordes**: `yearTo = null` se interpreta como `yearFrom + 1` (una fila "desde 2018" sin "hasta" cubre 2018 y 2019, no hasta el infinito). `yearFrom = null` se trata como −∞.

### Bug 3 — Stock asignado a la bodega equivocada (crítico)

Cuando se activaba la bodega "Mercado Libre Full", las compras/ventas/ajustes que no especificaban bodega caían en ella en vez de "Principal", porque el default ordenaba alfabéticamente (`Mercado...` < `Principal`).

- **Fix backend**: los cuatro métodos `defaultWarehouseId`/`firstWarehouseId` (en `PurchasesService`, `SalesService`, `InventoryService`, `ReturnsService`) ahora filtran `isActive = TRUE` y ordenan `(name = 'Principal') DESC, name ASC` — "Principal" gana siempre que esté activa.
- **Fix UX — bodega activa visible y global**: nuevo hook [`useCurrentWarehouse`](apps/web/lib/use-current-warehouse.ts) persiste la bodega activa en `localStorage` y la sincroniza entre componentes (custom event) y entre tabs (`storage` event). El **sidebar** muestra el nombre de la empresa (de `CompanySettings`) como título y debajo `Almacén: <nombre>` — con selector inline cuando hay 2+ bodegas activas. `/inventario`, `AdjustStockDialog`, el form de compra y el selector "Stock evaluado contra:" del tab Items de cotización se conectan al mismo hook.

### Bug 4 — No se podían editar compras

Una compra creada era inmutable; no se podía adjuntar la factura después.

- **`PATCH /purchases/:id`** ([`purchases.controller.ts`](apps/api/src/purchases/purchases.controller.ts)): edita **solo campos no críticos** — `invoiceUrl`, `notes`, `date`. Items, costos, totales y proveedor son inmutables (para corregirlos hay que cancelar y crear nueva).
- **`POST /purchases/:id/cancel`**: cancelación atómica con motivo (mín. 5 caracteres). Revierte el stock emitiendo `RETURN_OUT` con qty negativa equivalente a cada `PURCHASE_IN` original (los movimientos son la fuente de verdad de a qué bodega volver) y anula la transacción de caja con `voidTransaction`. Si el stock ya se consumió, `applyMovement` rechaza con 409 — hay que revertir esas operaciones derivadas primero.
- **Migración** `1779200000000-PurchaseEditCancelRound5.ts`: agrega a `purchase_entries` el enum `status` (`ACTIVE` | `CANCELLED`, default `ACTIVE`) más `cancelledAt`, `cancelReason`, `cancelledById` (FK a `users`) e índice sobre `status`.
- **Frontend**: el listado `/compras` muestra badge de estado y las filas linkean al nuevo detalle [`/compras/[id]`](apps/web/app/(dashboard)/compras/[id]/page.tsx), con `EditPurchaseDialog` y `CancelPurchaseDialog`.

---

## Tema oscuro

El frontend soporta **light / dark / system** vía [`next-themes`](https://github.com/pacocoursey/next-themes). El toggle (sol/luna) vive en el header del dashboard. La preferencia se persiste en `localStorage` y respeta `prefers-color-scheme` del sistema cuando está en modo "system".

- **Activación**: `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` en [`components/providers.tsx`](apps/web/components/providers.tsx).
- **Toggle**: [`components/theme-toggle.tsx`](apps/web/components/theme-toggle.tsx) — botón ghost con ícono Sun/Moon. Usa `mounted` flag para evitar hydration mismatch.
- **Variables CSS**: definidas en [`app/globals.css`](apps/web/app/globals.css) bajo `:root` (light) y `.dark` (dark). El stack de shadcn las consume vía Tailwind (`bg-background`, `text-foreground`, etc.).
- **Vista pública forzada en light**: [`/p/cotizacion/[token]/layout.tsx`](apps/web/app/p/cotizacion/[token]/layout.tsx) usa la clase `force-light` (definida en `globals.css`) que reescribe las variables al palette claro. Esto garantiza que el cliente final ve la cotización igual sin importar la preferencia del operador interno.
- **Componentes con colores semánticos** (badges de estado de cotización, alertas, badges de tipos de movimiento) tienen variantes `dark:` agregadas para contraste correcto en ambos temas.
- **PDF**: lo genera el backend con jsPDF — siempre fondo blanco / texto negro (no afectado por el tema).

---

## Stack

- **Frontend** ([apps/web](apps/web/)): Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Hook Form + Zod
- **Backend** ([apps/api](apps/api/)): NestJS 10 + TypeScript + TypeORM 0.3 + MySQL 8 + Passport JWT + bcrypt
- **Validación de teléfono** (Fase 4+): `libphonenumber-js` con país default Chile, formato canónico E.164.
- **Compartido** ([packages/shared](packages/shared/)): enums y tipos consumidos por ambas apps
- **Gestor de paquetes:** pnpm (workspaces) — fijado a `9.12.0` vía `packageManager` en el `package.json` raíz

---

## Requisitos previos

Mismos para cualquier OS:

- **Node.js `>=20.11`** (recomendado 22.x — ver [.nvmrc](.nvmrc))
- **pnpm** — se habilita automáticamente con `corepack enable` (no instalar global)
- **MySQL 8** instalado localmente con cliente CLI en el `PATH` (`mysql` y `mysqladmin`). Probado con MySQL 8.4. **No usamos Docker.**
- **Git Bash** o **WSL2** si estás en **Windows**. El `run.sh` no corre en PowerShell/cmd nativos.

### Cómo cumplir los requisitos por OS

<details>
<summary><b>macOS</b></summary>

```bash
# Node + corepack (recomendado vía nvm)
brew install nvm
nvm install 22 && nvm use 22
corepack enable

# MySQL (incluye cliente CLI)
brew install mysql
brew services start mysql
```
</details>

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
# Node + corepack (vía nodesource o nvm — ejemplo con nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 22 && nvm use 22
corepack enable

# MySQL
sudo apt update
sudo apt install mysql-server mysql-client
sudo systemctl start mysql

# Una sola vez: dejar root sin contraseña (solo para dev local)
# (o ajustá scripts/init-db.sql para usar contraseña de root)
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY ''"
```
</details>

<details>
<summary><b>Windows</b></summary>

Tenés dos caminos:

**Opción A — Git Bash (más fácil):**
1. Instalá [Git for Windows](https://git-scm.com/download/win) — incluye Git Bash.
2. Instalá [Node.js 22 LTS](https://nodejs.org/) (incluye corepack).
3. Instalá [MySQL Installer for Windows](https://dev.mysql.com/downloads/installer/) — durante el setup, **agregá la carpeta `bin` al PATH** y dejá el root sin contraseña (development setup).
4. Abrí **Git Bash** desde el menú inicio y desde ahí corrés todos los `./run.sh ...`.

**Opción B — WSL2 (recomendado para dev serio):**
1. Instalá WSL2 con Ubuntu (`wsl --install` en PowerShell admin).
2. Adentro del WSL seguí las instrucciones de Linux de arriba.
</details>

---

## Primera configuración (one-time)

**Un solo comando** instala todo de cero. Es idempotente: lo podés correr varias veces sin romper nada.

```bash
./run.sh setup
```

Esto hace, en orden:
1. Verifica/habilita pnpm vía corepack
2. Verifica que MySQL esté corriendo (intenta iniciarlo con `brew services start mysql` en Mac o `systemctl start mysql` en Linux si está caído)
3. Crea `apps/api/.env.local` y `apps/web/.env.local` desde sus `.env.example`
4. Corre `pnpm install`
5. Compila `@inventory/shared` (la api lo necesita en runtime)
6. Crea la base `inventory` y el usuario `inventory@127.0.0.1` con password `Inv3ntory!` en tu MySQL local
7. Aplica todas las migraciones pendientes
8. Carga los seeds (admin, almacén, categorías, settings)

Cuando termina, arrancás el proyecto con:

```bash
./run.sh dev
```

Una vez levantado:
- **Web:** http://localhost:3000
- **API:** http://localhost:4000/api/health
- **Login:** `admin@inventory.local` / `admin123`

Si algo falla en el setup, corré `./run.sh doctor` para ver qué requisito está faltando.

---

## Levantar y apagar el proyecto

Una vez hecho el `setup`, el día a día se reduce a dos comandos.

### Levantar

```bash
./run.sh dev
```

Qué hace:

1. Verifica que MySQL esté corriendo (lo intenta arrancar si no lo está).
2. Confirma que la conexión `inventory@127.0.0.1/inventory` funciona — si no, te pide correr `./run.sh setup` primero.
3. Arranca **api** y **web** en background (modo watch), guardando los PIDs en [.run/api.pid](.run/) y [.run/web.pid](.run/), y los logs en [.run/api.log](.run/) y [.run/web.log](.run/).
4. Espera hasta 90s a que ambos respondan en sus puertos. Si la api no levanta, imprime las últimas 30 líneas de su log y aborta.

Cuando termina te quedás con el shell libre (no bloquea) y los servicios corriendo:

- **Web:** http://localhost:3000
- **API health:** http://localhost:4000/api/health
- **Login:** `admin@inventory.local` / `admin123`

> `./run.sh dev` y `./run.sh up` son equivalentes (alias).

### Ver logs mientras corre

```bash
./run.sh logs       # tail -f de api.log y web.log
./run.sh status     # qué está arriba (MySQL, API, Web, PIDs)
```

### Apagar

```bash
./run.sh stop
```

Qué hace:

1. Lee los PIDs guardados en `.run/` y mata el **árbol completo** de procesos de cada uno (pnpm → `nest --watch` / `next dev` → node app), no solo el padre.
2. Como red de seguridad, barre cualquier proceso que haya quedado escuchando en `:4000` o `:3000` — esto cubre el caso en que el watcher de NestJS reparenta el server a PID 1 y el kill por árbol no lo alcanza.
3. Borra los pidfiles de `.run/`.

**Lo que NO toca:** MySQL local sigue corriendo (gestionalo con tu init system: `brew services stop mysql` en Mac, `sudo systemctl stop mysql` en Linux, o `./run.sh mysql:restart` si lo querés reiniciar). Y `./run.sh down` es alias de `stop`.

### Verificar que quedó todo apagado

```bash
./run.sh status
```

Tiene que decir `API :4000 no responde` y `Web :3000 no responde`. Si alguno sigue arriba, repetí `./run.sh stop` — si insiste, hay algo externo al script ocupando el puerto:

```bash
lsof -i :4000 -i :3000   # ¿qué proceso es?
```

---

## Datos por defecto (seed)

El seed es **idempotente** — corré `./run.sh db:seed` cuantas veces quieras, no duplica nada.

### Usuario admin

| Email | Password | Rol |
| --- | --- | --- |
| `admin@inventory.local` | `admin123` | `ADMIN` |

> Para cambiar las credenciales del admin antes de seedear, definí `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` como variables de entorno.

### Almacén único

- `Principal` (sin dirección) — id auto-generado UUID

### Categorías de producto

`Motor`, `Frenos`, `Suspensión`, `Eléctrico`, `Carrocería`, `Filtros`, `Aceites y lubricantes`, `Otros`

### Categorías de gasto

`Arriendo`, `Transporte`, `Publicidad`, `Servicios`, `Sueldos`, `Otros`

### Comunas chilenas (Fase 4)

346 comunas seedeadas desde [`apps/api/src/database/seeds/data/communes-cl.json`](apps/api/src/database/seeds/data/communes-cl.json), agrupadas por región. Insertadas en chunks de 100 la primera vez; en re-seeds solo agrega las que falten (idempotente).

### CompanySettings

| Campo | Valor por defecto |
| --- | --- |
| `name` | `Mi Empresa` |
| `currency` | `USD` |
| `defaultValidityDays` | `15` |
| `quotationFooter` | `Esta cotización tiene una validez de 15 días desde su emisión.` |
| Resto | `null` (se completa desde la pantalla de Configuración cuando exista) |

---

## Conexión a la base de datos

| Campo | Valor |
| --- | --- |
| Host | `127.0.0.1` |
| Puerto | `3306` |
| Usuario | `inventory` |
| Contraseña | `Inv3ntory!` |
| Base | `inventory` |
| Plugin de auth | `caching_sha2_password` (default de MySQL 8.4) |

> **Por qué esa contraseña:** tu MySQL nativo tiene el componente `validate_password=MEDIUM` instalado, que rechaza contraseñas vacías o débiles. `Inv3ntory!` cumple la política (≥8, mayúsculas, número, especial). Está hardcodeada en [apps/api/.env.example](apps/api/.env.example) y se copia automáticamente a `.env.local` la primera vez que corrés `./run.sh dev`. **No tenés que tipearla nunca**: la api la lee del archivo, y en MySQL Workbench la guardás una sola vez.

Para conectar **MySQL Workbench**: `127.0.0.1:3306` con `inventory` / `Inv3ntory!`, default schema `inventory`.

---

## Comandos diarios

Todo se hace desde `./run.sh`. Si pasás algún argumento que no entiende, te muestra el listado completo.

### Setup y diagnóstico

| Comando | Qué hace |
| --- | --- |
| `./run.sh setup` | Instalación completa de cero (idempotente) |
| `./run.sh doctor` | Diagnostica qué falta sin tocar nada (Node, pnpm, MySQL, .env, etc.) |
| `./run.sh status` | Muestra qué servicios están arriba y qué procesos del proyecto corren |

### Desarrollo diario

| Comando | Qué hace |
| --- | --- |
| `./run.sh dev` | Arranca api+web en watch mode (background), espera que respondan |
| `./run.sh stop` | Detiene los procesos node de api y web |
| `./run.sh logs` | `tail -f` de los logs de api y web |
| `./run.sh build` | Rebuild de shared/api/web |

### Base de datos

| Comando | Qué hace |
| --- | --- |
| `./run.sh db:init` | Crea base `inventory` y usuario en tu MySQL local |
| `./run.sh db:migrate` | Aplica migraciones pendientes |
| `./run.sh db:revert` | Revierte la última migración aplicada |
| `./run.sh db:generate <Nombre>` | Genera una nueva migración desde el diff entidades vs DB |
| `./run.sh db:seed` | Corre los seeds (idempotente) |
| `./run.sh db:reset` | DROP + CREATE de la base + migrate + seed (**borra todos los datos**) |

### MySQL

| Comando | Qué hace |
| --- | --- |
| `./run.sh mysql:restart` | Reinicia el servicio MySQL local (`brew services restart mysql` o `systemctl restart mysql`) |
| `./run.sh mysql:cli` | Abre shell `mysql` como `inventory@127.0.0.1/inventory` |

### Paquete shared (enums/tipos)

| Comando | Qué hace |
| --- | --- |
| `./run.sh shared:build` | Compila `packages/shared` (necesario tras modificar enums) |
| `./run.sh shared:watch` | `tsc --watch` sobre `packages/shared` |

### Otros (vía pnpm directamente)

| Comando | Qué hace |
| --- | --- |
| `pnpm typecheck` | Type-check de todos los paquetes |
| `pnpm lint` | Lint de todos los paquetes |
| `pnpm format` | Prettier sobre todo el repo |

### Logs en dev mode

Cuando corrés `./run.sh dev`, los logs van a `.run/api.log` y `.run/web.log`. Atajo:

```bash
./run.sh logs
```

---

## Estructura del repo

```
inventory-management/
├── apps/
│   ├── api/                              # NestJS — REST API
│   │   ├── src/
│   │   │   ├── auth/                     # JWT + cookies httpOnly + guard global
│   │   │   ├── database/
│   │   │   │   ├── data-source.ts        # DataSource compartido (CLI + runtime)
│   │   │   │   ├── entities/             # 21 entidades + index.ts (barrel)
│   │   │   │   ├── migrations/           # SQL versionado (no editar a mano)
│   │   │   │   └── seeds/run-seeds.ts    # admin, almacén, categorías, settings
│   │   │   ├── categories/               # CRUD categorías de producto
│   │   │   ├── brands/                   # CRUD marcas de producto
│   │   │   ├── vehicles/                 # CRUD VehicleMake + VehicleModel
│   │   │   ├── products/                 # CRUD productos + búsqueda + by-vehicle + quick-search
│   │   │   ├── suppliers/                # CRUD proveedores
│   │   │   ├── inventory/
│   │   │   │   ├── inventory.service.ts  # applyMovement() — ÚNICA vía para mutar stock
│   │   │   │   └── inventory.controller.ts # GET /stock, GET /movements, POST /adjust
│   │   │   ├── purchases/                # PurchaseEntry + items, dispara applyMovement
│   │   │   ├── app.module.ts
│   │   │   ├── health.controller.ts      # GET /api/health (público)
│   │   │   └── main.ts                   # bootstrap, cookie-parser, CORS, ValidationPipe
│   │   ├── .env.example                  # vars de la api (PORT, DB_*, JWT_*, RESEND_*)
│   │   ├── nest-cli.json                 # deleteOutDir: false (ver Troubleshooting)
│   │   └── package.json
│   │
│   └── web/                              # Next.js 15 App Router
│       ├── app/
│       │   ├── (auth)/login/             # form RHF + Zod
│       │   └── (dashboard)/              # grupo protegido — layout llama getCurrentUser()
│       │       ├── page.tsx              # dashboard placeholder
│       │       ├── productos/            # lista + nuevo + [id] (form con tabs)
│       │       ├── categorias/           # CRUD via SimpleNameList
│       │       ├── marcas/               # CRUD via SimpleNameList
│       │       ├── vehiculos/            # tabs: marcas / modelos
│       │       ├── proveedores/          # CRUD con dialog completo
│       │       ├── inventario/           # vista de stock con semáforo + ajuste inline
│       │       │   └── movimientos/      # historial paginado con filtros
│       │       └── compras/              # lista + nuevo (form con items + ProductPicker)
│       ├── components/
│       │   ├── ui/                       # shadcn: button, input, label, card, select, tabs,
│       │   │                             #   table, dialog, dropdown-menu, badge, separator,
│       │   │                             #   skeleton, command, toaster (sonner)
│       │   ├── forms/product-form.tsx    # 3 tabs: Datos / Precios y stock / Compatibilidad
│       │   ├── sidebar.tsx               # nav lateral por secciones (Catálogo / Operación)
│       │   ├── quick-search.tsx          # Cmd+K global
│       │   ├── product-picker.tsx        # dialog de búsqueda — reusable en compras/cotizaciones/ventas
│       │   ├── adjust-stock-dialog.tsx   # ajuste inline desde la vista de inventario
│       │   ├── simple-name-list.tsx      # CRUD genérico de entidades single-field
│       │   ├── providers.tsx             # QueryClientProvider
│       │   └── logout-button.tsx
│       ├── lib/
│       │   ├── api.ts                    # axios + interceptor refresh (browser)
│       │   ├── server-api.ts             # fetch + cookies forwarded (Server Components)
│       │   ├── catalog-api.ts            # wrappers tipados de productos/categorías/marcas/vehículos
│       │   ├── inventory-api.ts          # wrappers tipados de stock/movements/suppliers/purchases
│       │   └── utils.ts                  # cn() helper
│       ├── components.json               # config shadcn
│       ├── tailwind.config.ts            # tokens semáforo, container, etc.
│       └── .env.example                  # NEXT_PUBLIC_API_URL
│
├── packages/
│   └── shared/                           # ⚠️ debe estar buildeado para que la api lo use
│       ├── src/
│       │   ├── enums.ts                  # InventoryMovementType, QuotationStatus, etc.
│       │   ├── types.ts                  # ProductDto, StockSummary, MovementDto, etc.
│       │   └── index.ts
│       └── package.json                  # main → dist/index.js (CommonJS)
│
├── scripts/
│   └── init-db.sql                       # crea DB + usuario inventory en MySQL local
├── run.sh                                # helper: setup/dev/stop/db:*/mysql:*/shared:*
├── pnpm-workspace.yaml
├── tsconfig.base.json                    # config TS compartida
├── PLAN.md                               # plan completo de implementación
└── README.md
```

---

## Variables de entorno

Hay dos archivos `.env.local` (no commiteados, los crea `./run.sh dev` automáticamente):

### `apps/api/.env.local`

```bash
# Servidor
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Base de datos
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=inventory
DB_PASSWORD=Inv3ntory!
DB_DATABASE=inventory
DB_SYNCHRONIZE=false           # NUNCA poner true — siempre usar migraciones
DB_LOGGING=false               # true para ver SQL en consola

# JWT
JWT_SECRET=cambia-este-secreto-en-produccion
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=cambia-este-refresh-secreto
JWT_REFRESH_EXPIRES_IN=7d

# Email (Fase 6)
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@example.com

# URL pública (links a PDFs en emails/WhatsApp, Fase 6)
PUBLIC_API_URL=http://localhost:4000
```

### `apps/web/.env.local`

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

## Base de datos

### Modelo

21 entidades agrupadas por dominio. Los archivos están en [`apps/api/src/database/entities/`](apps/api/src/database/entities/) y se exportan desde [`entities/index.ts`](apps/api/src/database/entities/index.ts). Ver [PLAN.md](PLAN.md#modelo-de-datos-entidades-clave) para el modelo conceptual completo.

#### Catálogo de productos

| Entidad | Tabla | Propósito | Notas clave |
| --- | --- | --- | --- |
| `Product` | `products` | Repuesto que se vende. Carga la mayoría de los datos del negocio (SKU, partNumber, barcode, precio, costo, stock mínimo/máximo, ubicación física). | `sku` único. `cost` y `price` son `decimal(15,2)` mapeados a `string` (no `number`) para no perder precisión. |
| `Category` | `categories` | Agrupador jerárquico de productos. | Auto-referencia opcional `parentId` (categoría padre). `onDelete: SET NULL` para no borrar hijos al eliminar el padre. |
| `Brand` | `brands` | Marca del repuesto (Bosch, NGK, etc.). **No** marca de vehículo. | `name` único. |
| `VehicleMake` | `vehicle_makes` | Marca de vehículo (Toyota, Ford). | `name` único. |
| `VehicleModel` | `vehicle_models` | Modelo de vehículo asociado a una marca (Corolla, Hilux, Fiesta). | `(makeId, name)` único. |
| `VehicleFitment` | `vehicle_fitments` | Asocia un `Product` con un `VehicleModel` y un rango de años. Permite la búsqueda "qué tengo para Toyota Corolla 2015". | `yearFrom` y `yearTo` son nullables — `null` significa "cualquier año". `onDelete: CASCADE` con producto. |

#### Inventario

| Entidad | Tabla | Propósito | Notas clave |
| --- | --- | --- | --- |
| `Warehouse` | `warehouses` | Almacén físico. Por ahora hay 1 (`Principal`); el modelo soporta N para una fase futura. | Seed crea uno con nombre `Principal`. |
| `Stock` | `stocks` | **Caché** del stock actual por (producto, almacén). | Único `(productId, warehouseId)`. **Se actualiza dentro de la misma transacción que inserta un `InventoryMovement`**. La fuente de verdad sigue siendo `InventoryMovement`. |
| `InventoryMovement` | `inventory_movements` | **Fuente de verdad** del stock: cada entrada/salida/ajuste se registra acá. Permite recalcular el stock desde cero auditándolo. | `type`: `PURCHASE_IN`, `SALE_OUT`, `ADJUSTMENT`, `RETURN_IN`, `RETURN_OUT`. `qty` es signada (positiva entradas, negativa salidas). `unitCost` se llena en compras. `reference` + `refId` apuntan al documento origen genéricamente (no FK porque puede ser de varias tablas). |

#### Comercial

| Entidad | Tabla | Propósito | Notas clave |
| --- | --- | --- | --- |
| `Customer` | `customers` | Cliente al que se le cotiza/vende. | Tiene `internalNotes` (texto libre interno, no se imprime en PDFs). El `phone` se usa para WhatsApp en Fase 6. |
| `Supplier` | `suppliers` | Proveedor de mercadería. | Asociable a `Product.supplierId` y a `PurchaseEntry`. |
| `Quotation` | `quotations` | Cotización emitida a un cliente. | Numeración correlativa (`COT-2026-00001`). `status`: `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `CONVERTED`, `EXPIRED`. `validUntil` opcional. Se convierte a `Sale` en Fase 7. |
| `QuotationItem` | `quotation_items` | Línea de una cotización (producto + cantidad + precio + descuento + subtotal). | `onDelete: CASCADE` con cotización. |
| `Sale` | `sales` | Nota de venta confirmada. | Numeración correlativa (`VTA-2026-00001`). `status`: `PENDING`, `PAID`, `CANCELLED`. `paymentMethod`: `CASH`, `TRANSFER`, `CARD`. `quotationId` opcional (FK a la cotización origen, `SET NULL` si se borra). |
| `SaleItem` | `sale_items` | Línea de una venta. | **`unitCost` se congela** al confirmar la venta — clave para reportes de rentabilidad históricos cuando el costo del producto cambia después. `onDelete: CASCADE` con venta. |
| `PurchaseEntry` | `purchase_entries` | Entrada directa de mercadería desde un proveedor. (No hay OC formal en MVP.) | Genera `InventoryMovement(PURCHASE_IN)` por cada item y un `CashTransaction(EXPENSE, source=PURCHASE)`. |
| `PurchaseEntryItem` | `purchase_entry_items` | Línea de una entrada de compra (producto + cantidad + costo unitario + subtotal). | `onDelete: CASCADE` con la entrada. |

#### Caja y gastos

| Entidad | Tabla | Propósito | Notas clave |
| --- | --- | --- | --- |
| `CashTransaction` | `cash_transactions` | Movimiento del libro de caja consolidado: ingresos por ventas + egresos por compras + gastos manuales. | `type`: `INCOME` / `EXPENSE`. `source`: `SALE`, `PURCHASE`, `MANUAL`. `sourceId` apunta al documento origen (no FK porque puede ser `sales.id`, `purchase_entries.id` o `null` para manuales). `expenseCategoryId` solo se usa cuando `source=MANUAL`. `isVoided` marca la transacción anulada cuando se cancela una venta/compra. |
| `ExpenseCategory` | `expense_categories` | Categoría de gasto manual (arriendo, transporte, publicidad, servicios, sueldos, otros). Seedeadas. | `name` único. |

#### Settings

| Entidad | Tabla | Propósito | Notas clave |
| --- | --- | --- | --- |
| `User` | `users` | Usuario que se loguea al sistema. En MVP solo hay rol `ADMIN`. | `email` único. `passwordHash` (bcrypt) marcado `select: false` — solo se trae explícitamente en login. |
| `CompanySettings` | `company_settings` | Singleton con datos de la empresa (nombre, dirección, teléfono, logo, moneda, footer de cotización, validez por defecto). | Convención: 1 sola fila. Editable desde la pantalla de Configuración (Fase 1+ refinada). |

### Reglas de integridad críticas

- **Stock = `InventoryMovement` agregado.** La tabla `Stock` se mantiene como caché y se actualiza dentro de la misma transacción que inserta el movimiento. Toda mutación de stock pasa por `InventoryService.applyMovement()` (a implementar en Fase 3).
- **Caja consolidada.** Cada `Sale` confirmada (`status=PAID`) inserta `CashTransaction(INCOME, source=SALE)` automáticamente. Cada `PurchaseEntry` inserta `CashTransaction(EXPENSE, source=PURCHASE)`. Cancelar revierte la transacción de caja (compensación con monto negativo o `isVoided=true`).
- **`SaleItem.unitCost` se congela** al confirmar la venta — los reportes de rentabilidad histórica no se ven afectados si después cambia el costo del producto.
- **PKs UUID** en todas las entidades (no auto-incrementales). Conviene para no exponer enumeración en URLs públicas (ej. PDFs de cotizaciones).
- **`onDelete` explícito en cada FK:** `CASCADE` en items hijos (QuotationItem, SaleItem, PurchaseEntryItem, VehicleFitment), `RESTRICT` en referencias críticas (Product en movements/items), `SET NULL` en parents opcionales (Category.parent, Sale.quotationId).

### Migraciones

- **Nunca** poner `synchronize: true`. Todo cambio de schema pasa por migraciones.
- Para agregar/modificar entidades:
  1. Editar el archivo en `apps/api/src/database/entities/`
  2. Generar migración: `./run.sh db:generate AddProductTags`
  3. Revisar el SQL generado a mano en `apps/api/src/database/migrations/` (a veces TypeORM emite cosas raras con renames)
  4. Aplicar: `./run.sh db:migrate`
- Si te equivocaste y querés revertir la última: `./run.sh db:revert`

### Reset completo de la DB en dev

```bash
./run.sh db:reset
```

(equivale a DROP + CREATE de la base + migrate + seed; te avisa con 3s para cancelar antes de borrar)

---

## Autenticación

### Cómo funciona

- **Login** (`POST /api/auth/login`) recibe `{email, password}`, valida con bcrypt, emite dos JWT:
  - **`access_token`** (15min, secret `JWT_SECRET`) → cookie `access_token`, path `/`
  - **`refresh_token`** (7d, secret `JWT_REFRESH_SECRET`) → cookie `refresh_token`, path `/api/auth`
- Cookies son **httpOnly** + **SameSite=Lax** + `Secure` solo en `NODE_ENV=production`. No se exponen al JS del navegador.
- **Refresh** (`POST /api/auth/refresh`) lee el `refresh_token` cookie, valida, emite nuevo access+refresh.
- **Logout** (`POST /api/auth/logout`) limpia ambas cookies.
- **`GET /api/auth/me`** devuelve `{id, name, email, role}` del usuario actual (lee `access_token`).

### Backend

- `JwtAuthGuard` está registrado como `APP_GUARD` global en `AuthModule`. **Por defecto todas las rutas requieren JWT.**
- Para hacer pública una ruta, decorala con `@Public()`:
  ```typescript
  import { Public } from '@/auth/decorators/public.decorator';

  @Public()
  @Get('health')
  check() { ... }
  ```
- Para acceder al usuario autenticado:
  ```typescript
  import { CurrentUser } from '@/auth/decorators/current-user.decorator';
  import type { JwtPayload } from '@/auth/types';

  @Get('cosa')
  doStuff(@CurrentUser() user: JwtPayload) {
    // user.sub, user.email, user.role
  }
  ```
- El `passwordHash` está marcado como `select: false` en la entidad `User` — solo se trae explícitamente en el flow de login.

### Frontend

- **`apps/web/lib/api.ts`** es el cliente axios para el browser. Tiene `withCredentials: true` y un interceptor que en respuestas 401:
  1. Llama a `/auth/refresh`
  2. Si funciona, reintenta el request original
  3. Si falla, redirige a `/login`
- Requests concurrentes que disparan refresh comparten la misma promesa para no llamarlo N veces.
- **`apps/web/lib/server-api.ts`** es un helper para Server Components que forwarda las cookies del request entrante (`cookies()` de `next/headers`) al backend. **No hace refresh** — el layout protegido se encarga del redirect si la sesión expiró.
- **Layout protegido** (`app/(dashboard)/layout.tsx`) llama `getCurrentUser()` y hace `redirect('/login')` si devuelve `null`. El grupo `(auth)/` no tiene esta verificación.

---

## Inventario y movimientos de stock

> **Regla arquitectónica clave:** **toda mutación de stock pasa por `InventoryService.applyMovement()`.** Nunca llamar `Stock` repo directamente desde otros servicios — bypassearía la validación de stock negativo y el registro del `InventoryMovement` (la fuente de verdad).

### `applyMovement(manager, input)` — la única vía

Vive en [`apps/api/src/inventory/inventory.service.ts`](apps/api/src/inventory/inventory.service.ts) y recibe un `EntityManager` (no un repo) para componerse con transacciones externas.

```typescript
await this.dataSource.transaction(async (manager) => {
  // ... otras operaciones tuyas ...
  await this.inventory.applyMovement(manager, {
    productId,
    warehouseId,
    type: InventoryMovementType.PURCHASE_IN,  // o SALE_OUT, ADJUSTMENT, RETURN_IN, RETURN_OUT
    qty: 100,                                  // SIGNADA: + entrada, - salida
    unitCost: '3.50',                          // opcional, sólo PURCHASE_IN/RETURN_OUT
    reference: 'PurchaseEntry',                // tabla origen (texto libre)
    refId: entry.id,                           // id del documento origen
    userId,
  });
});
```

Lo que hace `applyMovement`, en orden, dentro de la transacción que recibe:

1. Valida que `productId` y `warehouseId` existan.
2. Inserta el `InventoryMovement` (la fuente de verdad).
3. UPSERT atómico en `stocks` con `INSERT ... ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`. Esto serializa updates concurrentes a nivel MySQL.
4. Re-lee `stocks` y, si `quantity < 0`, hace `throw ConflictException` (HTTP 409). El throw rollbackea **toda** la transacción, incluyendo lo que hayas hecho antes.

### Convenciones de `qty`

- **Signada**: `+100` para una compra, `-5` para una merma o venta.
- `qty = 0` → 400 Bad Request.
- `unitCost` solo tiene sentido en entradas (compras o devoluciones de venta).

### Cómo escribir un servicio nuevo que mueve stock

Patrón que sigue [`PurchasesService.create()`](apps/api/src/purchases/purchases.service.ts) — replicalo en Sales (Fase 7), Returns, etc.:

```typescript
const entryId = await this.dataSource.transaction(async (manager) => {
  // 1. Insertar el documento "padre" (PurchaseEntry, Sale, etc.)
  const entry = manager.create(PurchaseEntry, { ... });
  await manager.save(entry);

  // 2. Por cada item: insertar el item Y disparar applyMovement
  for (const item of items) {
    const itemEntity = manager.create(PurchaseEntryItem, { ... });
    await manager.save(itemEntity);
    await this.inventory.applyMovement(manager, {
      productId: item.productId,
      warehouseId,
      type: InventoryMovementType.PURCHASE_IN,
      qty: item.qty,
      unitCost: item.unitCost,
      reference: 'PurchaseEntry',
      refId: entry.id,
      userId,
    });
  }
  return entry.id;
});
return this.getOne(entryId);  // re-leer DESPUÉS del commit
```

Notar: `getOne()` se llama **fuera** de la transacción. Si lo metés adentro, no ve sus propios writes hasta el commit (TypeORM 0.3 no usa view-after-write dentro de la misma transacción).

### Semáforo de stock (vista `/inventario`)

`GET /api/inventory/stock` devuelve un row por producto **activo** (incluso productos sin movimientos aparecen con `quantity: 0`). El campo `status` lo computa el backend:

| Condición | Estado | Color | Badge |
| --- | --- | --- | --- |
| `quantity <= 0` | `out` | rojo (`--stock-out`) | `<Badge variant="out">` |
| `0 < quantity <= product.minStock` | `low` | amarillo (`--stock-low`) | `<Badge variant="low">` |
| `quantity > product.minStock` | `ok` | verde (`--stock-ok`) | `<Badge variant="ok">` |

Los tokens viven en [`apps/web/app/globals.css`](apps/web/app/globals.css) y las variantes del Badge en [`apps/web/components/ui/badge.tsx`](apps/web/components/ui/badge.tsx). Para usar los colores en otros lados: `bg-stock-ok`, `text-stock-low/15`, etc. (Tailwind ya los conoce).

### Ajuste manual

`POST /api/inventory/adjust` con `{ productId, qty (signada), reason, unitCost? }`:
- Internamente llama `applyMovement` con `type: ADJUSTMENT`, `reference: 'Adjustment'`.
- `reason` es texto libre obligatorio. Por ahora se loggea pero no se persiste en una columna dedicada (futuro: ampliar `InventoryMovement.reason`).
- Desde la UI: cualquier fila de `/inventario` tiene un botón ⚙️ que abre [`AdjustStockDialog`](apps/web/components/adjust-stock-dialog.tsx). El diálogo muestra el stock resultante en vivo y bloquea el submit si daría negativo (validación cliente — el backend igual valida y devuelve 409 si pasa de largo).

### Compras (entrada de mercadería)

`POST /api/purchases` recibe `{ supplierId, date?, notes?, items: [{productId, qty, unitCost}] }` y crea, en una sola transacción atómica:
- Un `PurchaseEntry` con `total` calculado.
- Un `PurchaseEntryItem` por cada item.
- Un `InventoryMovement(PURCHASE_IN)` por cada item, vía `applyMovement`.

**Importante:** todavía no genera el `CashTransaction(EXPENSE, source=PURCHASE)` — eso llega en Fase 5 (Caja). El gancho del flujo está, falta el wiring.

### Productos sin compatibilidad histórica con `Stock`

Si un producto se crea **antes** de tener stock, no aparece como fila en la tabla `stocks` hasta su primer movimiento. La query de `GET /inventory/stock` hace `LEFT JOIN ... COALESCE(s.quantity, 0)` para mostrar todos los productos activos con `quantity = 0` por default.

---

## Pantallas del frontend

Recorrido de cada pantalla con qué hace, dónde está el código y qué endpoints consume. Las rutas siguen el App Router de Next.js — el grupo `(auth)/` es público, `(dashboard)/` es protegido y se renderiza dentro del shell con sidebar + header.

### Shell global del dashboard

Visible en todas las pantallas dentro de `(dashboard)/`:

- **[`app/(dashboard)/layout.tsx`](apps/web/app/(dashboard)/layout.tsx)** — Server Component. Llama `getCurrentUser()`; si la cookie no es válida, hace `redirect('/login')`. Compone Sidebar + header + slot principal.
- **[`components/sidebar.tsx`](apps/web/components/sidebar.tsx)** — Nav lateral con secciones (`Catálogo`, `Operación`). Cada item resalta cuando el `pathname` coincide (exact o prefix). Oculto en móvil (`md:flex`).
- **Header** — Muestra a la izquierda el `<QuickSearch>` (botón con atajo) y a la derecha el email del usuario con el botón "Cerrar sesión".
- **[`components/quick-search.tsx`](apps/web/components/quick-search.tsx)** — Buscador global tipo Cmd+K. Atajo: `⌘K` en Mac, `Ctrl+K` en Linux/Windows. Debounce 250 ms, llama `GET /products/quick-search?q=...` y al seleccionar navega a `/productos/[id]`.
- **[`components/logout-button.tsx`](apps/web/components/logout-button.tsx)** — `POST /auth/logout` y redirige a `/login`.

### Login

| Ruta | Archivo | Para qué sirve |
| --- | --- | --- |
| `/login` | [`app/(auth)/login/page.tsx`](apps/web/app/(auth)/login/page.tsx) | Form de email + password con RHF + Zod. En éxito el backend setea cookies httpOnly y redirige a `/`. Si el password es incorrecto, muestra el mensaje del 401 en el card. |

### Dashboard

| Ruta | Archivo | Para qué sirve |
| --- | --- | --- |
| `/` | [`app/(dashboard)/page.tsx`](apps/web/app/(dashboard)/page.tsx) | Placeholder: saludo al usuario logueado. Se llena con KPIs y alertas en **Fase 9**. |

### Catálogo

| Ruta | Archivo | Para qué sirve |
| --- | --- | --- |
| `/productos` | [`app/(dashboard)/productos/page.tsx`](apps/web/app/(dashboard)/productos/page.tsx) | Lista paginada (20/página) **con filtros sincronizados a la URL**. Filtros: búsqueda libre por SKU/partNumber/barcode/nombre (debounce 250 ms), categoría, marca. Sección dedicada **"Buscar por vehículo compatible"** (marca → modelo → **año como `Select`** 1980→actual+1) que cambia la query de `/products` por `/products/by-vehicle`. Costo y precio formateados con `formatCurrency`. Click en una fila navega a la edición. Botón "Limpiar todos los filtros" cuando hay filtros activos. |
| `/productos/nuevo` | [`app/(dashboard)/productos/nuevo/page.tsx`](apps/web/app/(dashboard)/productos/nuevo/page.tsx) | Form de creación. Renderiza el `<ProductForm>` sin valores iniciales. |
| `/productos/[id]` | [`app/(dashboard)/productos/[id]/page.tsx`](apps/web/app/(dashboard)/productos/[id]/page.tsx) | Form de edición. Server Component que llama `GET /products/:id` y rehidrata el `<ProductForm>` con todos los campos + fitments. Si el id no existe, `notFound()`. **Botón "Eliminar"** con confirm modal — devuelve un mensaje claro si el producto tiene movimientos asociados (en lugar de 500). |
| `/categorias` | [`app/(dashboard)/categorias/page.tsx`](apps/web/app/(dashboard)/categorias/page.tsx) | CRUD simple de categorías de producto (`Motor`, `Frenos`, etc. — las del seed). Usa el componente reutilizable `<SimpleNameList>` con búsqueda + paginación + dialog para crear/editar. Filtros en URL. Borrar una categoría con productos asociados muestra mensaje claro (no 500). |
| `/marcas` | [`app/(dashboard)/marcas/page.tsx`](apps/web/app/(dashboard)/marcas/page.tsx) | CRUD de marcas de **repuestos** (NGK, Bosch, etc.). Mismo patrón que categorías (búsqueda + paginación + URL + manejo FK). |
| `/vehiculos` | [`app/(dashboard)/vehiculos/page.tsx`](apps/web/app/(dashboard)/vehiculos/page.tsx) | Pestañas internas. **Marcas:** CRUD de `VehicleMake` (Toyota, Ford) vía `<SimpleNameList>` (paginación + búsqueda + URL). **Modelos:** CRUD de `VehicleModel` con búsqueda + filtro por marca + paginación + URL. La unicidad es `(makeId, name)`. Estos datos alimentan la sub-form de Compatibilidad de productos y el filtro "buscar por vehículo". |

#### Componente `<ProductForm>` (3 tabs)

Vive en [`components/forms/product-form.tsx`](apps/web/components/forms/product-form.tsx) y lo usan tanto `nuevo` como `[id]`:

- **Datos:** SKU (único), partNumber, barcode, nombre, descripción, categoría, marca, ubicación física, activo/inactivo.
- **Precios y stock:** costo, precio de venta, stock mínimo (umbral del semáforo amarillo), stock máximo opcional.
- **Compatibilidad:** filas dinámicas (`useFieldArray` de RHF). Cada fila tiene selector de modelo de vehículo + **`Select` de año desde** + **`Select` de año hasta** (rango 1980 → año actual + 1). Validación zod: `desde <= hasta` con error inline por fila + detección de **duplicados** (mismo modelo + mismo rango → error inline). La estrategia del backend es replace — se reenvían **todas** las filas en cada save.

> **Próximas extensiones del form (Fase 4B):** sub-form de códigos múltiples (interno/universal/fabricante/compatible/alternativo), upload de foto del producto, selector ORIGINAL/ALTERNATIVO.

### Operación

| Ruta | Archivo | Para qué sirve |
| --- | --- | --- |
| `/inventario` | [`app/(dashboard)/inventario/page.tsx`](apps/web/app/(dashboard)/inventario/page.tsx) | Vista de **stock por producto** con badges del semáforo (`OK` verde / `Bajo stock` amarillo / `Sin stock` rojo). Arriba muestra el conteo por estado. Filtros (búsqueda libre + estado) + paginación (50/página) sincronizados con la URL. Cada fila tiene un botón ⚙️ que abre `<AdjustStockDialog>` para corregir cantidades. |
| `/inventario/movimientos` | [`app/(dashboard)/inventario/movimientos/page.tsx`](apps/web/app/(dashboard)/inventario/movimientos/page.tsx) | Historial paginado (50/página) de **todos** los `InventoryMovement`. Filtros (tipo, rango de fechas) en URL + botón **"Limpiar filtros"**. La columna "Cantidad" se colorea: rojo si negativa, verde si positiva. Costo unitario formateado con `formatCurrency`. Muestra fecha local del usuario, badge del tipo, producto (con SKU), origen (`PurchaseEntry`, `Adjustment`, etc.) y email del usuario que hizo el movimiento. |
| `/compras` | [`app/(dashboard)/compras/page.tsx`](apps/web/app/(dashboard)/compras/page.tsx) | Lista paginada de entradas de mercadería (`PurchaseEntry`). Filtros (proveedor + rango de fechas) en URL + botón "Limpiar filtros". Total formateado con `formatCurrency`. |
| `/compras/nuevo` | [`app/(dashboard)/compras/nuevo/page.tsx`](apps/web/app/(dashboard)/compras/nuevo/page.tsx) | Form de **registrar una entrada**. Selector de proveedor + fecha + notas + tabla dinámica de items. El botón "Agregar producto" abre el `<ProductPicker>` (búsqueda + click). Por cada fila se editan cantidad y costo unitario; subtotal y total se calculan en vivo. Al guardar se dispara el flujo transaccional del backend (`PurchaseEntry` + items + `applyMovement(PURCHASE_IN)` por item). En Fase 5 se agrega adjuntar **factura** (upload). |
| `/proveedores` | [`app/(dashboard)/proveedores/page.tsx`](apps/web/app/(dashboard)/proveedores/page.tsx) | CRUD de proveedores con dialog completo (nombre, taxId, email, teléfono, dirección, notas). Búsqueda por nombre/NIT/email/teléfono + paginación, todo en URL. Validación de **unicidad de NIT/RUC** en backend. Implementado en Fase 3 porque las compras lo requieren — el detalle con tab *Historial de compras* llega en **Fase 4**. |

### Componentes reutilizables del frontend

| Componente | Para qué sirve |
| --- | --- |
| [`components/forms/product-form.tsx`](apps/web/components/forms/product-form.tsx) | Form de producto con tabs Datos / Precios / Compatibilidad. Usado en `nuevo` y `[id]`. |
| [`components/product-picker.tsx`](apps/web/components/product-picker.tsx) | Dialog de búsqueda de producto (SKU/partNumber/barcode/nombre). Devuelve el producto elegido vía callback. **Pensado para reutilizar en cotizaciones (Fase 6) y ventas (Fase 7).** |
| [`components/adjust-stock-dialog.tsx`](apps/web/components/adjust-stock-dialog.tsx) | Diálogo de ajuste manual de stock. Muestra stock actual y resultante en vivo, bloquea si daría negativo. |
| [`components/simple-name-list.tsx`](apps/web/components/simple-name-list.tsx) | CRUD genérico para entidades single-field (categorías, marcas, makes). Acepta `list`/`create`/`update`/`remove` por props. |
| [`components/quick-search.tsx`](apps/web/components/quick-search.tsx) | Buscador global Cmd+K. Vive en el header del `(dashboard)`. |
| [`components/sidebar.tsx`](apps/web/components/sidebar.tsx) | Nav lateral con secciones. Para agregar un item nuevo, editar el array `SECTIONS`. |
| [`components/providers.tsx`](apps/web/components/providers.tsx) | `QueryClientProvider` con `staleTime: 30s` y `refetchOnWindowFocus: false`. |
| [`components/logout-button.tsx`](apps/web/components/logout-button.tsx) | Botón "Cerrar sesión" del header. |

### Helpers de datos

| Archivo | Qué hace |
| --- | --- |
| [`lib/api.ts`](apps/web/lib/api.ts) | Cliente axios browser-side, `withCredentials: true`, interceptor de refresh en 401. |
| [`lib/server-api.ts`](apps/web/lib/server-api.ts) | `serverFetch()` para Server Components — forwarda las cookies entrantes al backend. Sin refresh (el layout protegido se encarga del redirect). |
| [`lib/catalog-api.ts`](apps/web/lib/catalog-api.ts) | Wrappers tipados de `/categories`, `/brands`, `/vehicles`, `/products` (incluye variantes `*Paginated`) + helper `apiErrorMessage()`. |
| [`lib/inventory-api.ts`](apps/web/lib/inventory-api.ts) | Wrappers tipados de `/suppliers`, `/inventory/*`, `/purchases` (incluye variantes `*Paginated`). |
| [`lib/customers-api.ts`](apps/web/lib/customers-api.ts) | Wrappers tipados de `/customers`, `/communes` y `/suppliers/:id/purchases` (Fase 4). |
| [`lib/format.ts`](apps/web/lib/format.ts) | `formatCurrency(value)` y `formatNumber(value)` con `Intl.NumberFormat`. **Toda visualización de monto debe pasar por acá.** |
| [`lib/use-url-filters.ts`](apps/web/lib/use-url-filters.ts) | Hook `useUrlFilters({ q: '', page: '', ... })` que sincroniza filtros con la URL (`router.replace`). Returns `{ values, setFilter, setFilters, clear }`. **Toda nueva pantalla de listado lo usa.** |
| [`lib/validators/rut.ts`](apps/web/lib/validators/rut.ts) | Validador RUT chileno (formato + DV módulo 11) + normalización + formateo con puntos. Espejo del backend. |
| [`lib/validators/phone.ts`](apps/web/lib/validators/phone.ts) | Validador de teléfono (libphonenumber-js) + normalización a E.164 + formateo internacional. Espejo del backend. |
| [`lib/utils.ts`](apps/web/lib/utils.ts) | `cn()` — merge de clases Tailwind con `clsx + twMerge`. |

---

## Convenciones de código

### TypeScript

- `strict: true` + `noUncheckedIndexedAccess` en [tsconfig.base.json](tsconfig.base.json).
- En entidades TypeORM, todos los campos llevan el operador `!` (definite assignment) porque TypeORM los hidrata vía decoradores. `strictPropertyInitialization` está desactivado solo en la api.
- Nada de `any` salvo en bordes contra librerías sin tipos. Usar `unknown` y `narrow` con type guards.

### Entidades

- Nombres de tabla en `snake_case_plural` (`purchase_entries`, `vehicle_fitments`).
- PKs UUID con `@PrimaryGeneratedColumn('uuid')`.
- Para cada FK: declarar **tanto** la relación (`@ManyToOne`) **como** la columna (`@Column('char', {length: 36})`). Esto permite queries que usan solo el ID sin joinear.
- `onDelete` explícito en cada `@ManyToOne` / `@JoinColumn`.
- Decimales monetarios: `decimal(15, 2)` mapeado a `string` en TS (no `number`, para no perder precisión).
- Cantidades: `int` (los repuestos automotrices son enteros).
- Timestamps: `datetime(6)` con `@CreateDateColumn` / `@UpdateDateColumn`.

### Servicios que mutan stock o caja

- **Stock:** siempre vía `InventoryService.applyMovement(manager, ...)`. Nunca tocar `Stock` repo directamente. Ver sección [Inventario y movimientos de stock](#inventario-y-movimientos-de-stock).
- **Caja** (Fase 5+): mismo patrón con `CashboxService.recordTransaction(manager, ...)`.
- Si tu operación abarca varios writes que deben ser atómicos (ej. crear `Sale` + items + movimientos + transacción de caja), envolvé todo en `dataSource.transaction(async (manager) => ...)` y pasá ese `manager` a cada service llamado.
- Re-leer entidades para devolver al cliente (`getOne(...)`) **fuera** de la transacción, después del commit.

### DTOs y validación

- Cada controlador valida via `class-validator` con DTOs explícitos. `ValidationPipe` está global en `main.ts` con `whitelist: true` + `forbidNonWhitelisted: true`, así que campos extra del cliente devuelven 400.
- Para PATCHes parciales usar `extends PartialType(CreateXDto)` de `@nestjs/mapped-types` — hace todos los campos opcionales sin repetir la definición.
- `@ParseUUIDPipe()` en cada `:id` de ruta para que IDs malformados devuelvan 400 antes de tocar la DB.

### Commits

- Convencionales: `feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`.
- Co-author de Claude se agrega automáticamente en commits hechos vía la asistencia AI.

### Nombres de archivos

- API: `kebab-case` para archivos (`auth.service.ts`, `inventory-movement.entity.ts`).
- Web: `kebab-case` para archivos, `PascalCase` para componentes.
- Rutas Next: convención App Router (`page.tsx`, `layout.tsx`, grupos con `()`).

---

## Troubleshooting

### `nest start --watch` arranca y muere con `Cannot find module '.../dist/main'`

Race entre tsc-watch y nest-cli. Ya está mitigado con `deleteOutDir: false` en [apps/api/nest-cli.json](apps/api/nest-cli.json). Si vuelve a aparecer, hacé:

```bash
rm -rf apps/api/dist apps/api/tsconfig.tsbuildinfo apps/api/tsconfig.build.tsbuildinfo
./run.sh build
./run.sh dev
```

### `Cannot find module '@inventory/shared'` o `Cannot find module '.../packages/shared/src/enums'`

El paquete `@inventory/shared` se consume **en runtime** desde la api (CommonJS). Si modificás algo en `packages/shared/src/`, tenés que rebuildear:

```bash
./run.sh shared:build
```

O dejá tsc en watch en otra terminal:

```bash
./run.sh shared:watch
```

### `EADDRINUSE: address already in use :::4000` (o :3000)

Quedó un proceso huérfano de un dev anterior. Matalo:

```bash
lsof -ti:4000,3000 | xargs -r kill -9
./run.sh dev
```

### MySQL: `Cannot connect to local MySQL server through socket`

En macOS, conectate a `127.0.0.1` y no a `localhost` — `localhost` a veces resuelve a un socket Unix inexistente.

### MySQL: `Plugin 'mysql_native_password' is not loaded`

MySQL 8.4 desactiva ese plugin por default. El usuario `inventory` se crea con `caching_sha2_password` (el default actual) — el driver `mysql2` y MySQL Workbench moderno lo soportan sin problema. **No** uses `IDENTIFIED WITH mysql_native_password` en SQL nuevo.

### MySQL: `Your password does not satisfy the current policy requirements`

Tu MySQL tiene `validate_password=MEDIUM` instalado. Cualquier password nueva debe cumplir: ≥8 chars, mayúscula, número, especial. La password de `inventory` (`Inv3ntory!`) ya cumple.

### `./run.sh dev` dice "API ya corriendo" pero no responde

Hay un PID viejo en `.run/api.pid`. Limpialo:

```bash
./run.sh stop
rm -rf .run
./run.sh dev
```

### Necesito resetear la DB completa

```bash
./run.sh db:reset
```

### MySQL se cuelga o se comporta raro

```bash
./run.sh mysql:restart
```

### `409 Stock insuficiente para "..."` al hacer un ajuste o venta

`InventoryService.applyMovement` valida que el stock resultante no quede negativo y rollbackea si pasa. Significa lo que dice: la cantidad signada que pasaste haría que `quantity < 0`. Verificá el stock actual en `/inventario` y ajustá hacia arriba primero, o reducí la cantidad. Para hacer un conteo físico que “fija” el stock en X (no incremental), por ahora usá un ajuste con `qty = X - currentQty`.

### Después de cambiar `minStock` en un producto, el semáforo no se actualiza en `/inventario`

TanStack Query cachea la respuesta de `/inventory/stock` por 30s (`staleTime` default en [`components/providers.tsx`](apps/web/components/providers.tsx)). Refrescá la página o esperá. Si querés invalidación instantánea, agregá `qc.invalidateQueries({ queryKey: ['stock'] })` en el `onSuccess` del mutate del producto (en `components/forms/product-form.tsx`).

### Quiero crear un producto sin stock pero ya aparece como "Sin stock" en `/inventario`

Es esperado: la vista incluye todos los productos activos, así sepan o no de movimientos. Para ocultarlo de la lista, desactivá el producto (`isActive=false` en su form) — la query filtra por `p.isActive = TRUE`.

### Quiero entrar al shell de MySQL como la app

```bash
./run.sh mysql:cli
```

### No estoy seguro de qué falta para arrancar

```bash
./run.sh doctor
```

### Necesito otro usuario admin con otra contraseña

Antes de seedear (o como variables de entorno al correr seed):

```bash
SEED_ADMIN_EMAIL=otro@ejemplo.com SEED_ADMIN_PASSWORD=otra-pass ./run.sh db:seed
```

Si el admin ya existe, **el seed no lo recrea** — borralo manualmente primero o cambialo desde la pantalla de Configuración (cuando exista).

---

## Decisiones pendientes con el cliente

> Las que están como ✅ ya fueron confirmadas y aplicadas. Las pendientes se trabajan con la **asunción** indicada.

| # | Pregunta | Fase | Estado |
| --- | --- | --- | --- |
| 1 | ¿Separar `customers.address` en calle/número/comuna o dejar texto libre? | 4 | ✅ Separar — las 3 opcionales |
| 2 | "Mismo producto con mismo código" — ¿permitir duplicados de SKU? ¿códigos compartidos? | 4B | Pendiente. Asunción: `sku` único, `product_codes` permite código compartido entre productos. |
| 3 | Comisión por tarjeta: ¿% fijo, por método, por venta? | 5 / 7 | Pendiente. Asunción: `cardCommissionRate` único en `CompanySettings`. |
| 4 | Tasa de IVA: ¿fija 19% o configurable? | 5 | Pendiente. Asunción: configurable, default `0.19`. |
| 5 | Mercado Libre: ¿integración real con API ML o registro manual? | 7.5 | Pendiente. Asunción: manual. |
| 6 | Almacenamiento de archivos: ¿disco local, S3, Cloudinary? | 4B / 5 | Pendiente. Asunción: disco local en `apps/api/uploads/`. |
| 7 | Guía de despacho: ¿numeración propia? ¿requisitos SII? | 7.7 | Pendiente. Asunción: entidad `DispatchNote`, sin emisión SII. |
| 8 | Impresión 80mm: ¿impresora térmica POS o vista web? | 6 / 7 / 7.7 | Pendiente. Asunción: HTML con `@page` 80mm. |
| 9 | Validación de RUT chileno: formato vs formato + DV | 4 | ✅ Formato + dígito verificador + normalización |
| 10 | Cotización por WhatsApp: ¿"el número" del cliente o correlativo? | 6 | Pendiente. Asunción: correlativo + mensaje al teléfono del cliente. |
| 11 | Validación de teléfono | 4 | ✅ `libphonenumber-js` + E.164, default Chile |
| 12 | Comuna: texto libre vs catálogo | 4 | ✅ Catálogo de 346 comunas (FK) |
| 13 | Email del cliente: obligatorio / único | 4 | ✅ Opcional, puede repetirse |
| 14 | RUT cliente: obligatorio | 4 | ✅ Obligatorio + único (índice DB) |
| 15 | Cliente "Consumidor final" seedeado | 4 | ✅ No se seedea |
| 16 | Validación de RUT en proveedores | 4 | ✅ Mismas reglas que clientes |
| 17 | Unicidad de NIT/RUC en proveedores a nivel DB | 4 | ✅ Índice único en DB |
| 18 | Tabs del detalle de cliente | 4 | ✅ Solo Datos por ahora |
| 19 | Detalle proveedor con historial de compras | 4 | ✅ Tabs Datos + Compras |
| 20 | Sidebar: ubicación de Clientes | 4 | ✅ Sección "Operación" |
| 21 | Notas internas de cliente — visibilidad | 4 | ✅ Solo dentro del sistema |
| 22 | Precios netos vs brutos | 5 | ✅ Brutos (incluyen IVA), descompuesto al confirmar |
| 23 | Métodos de pago en gastos manuales | 5 | ✅ Mismos 3 que ventas (CASH/TRANSFER/CARD) |
| 24 | Cancelación de compras | 5/7 | ✅ Postergada a Fase 7 con cancelación de ventas |
| 25 | Categorías de gasto editables o fijas | 5 | ✅ CRUD + flag `isSystem` para protegidas |
| 26 | Numeración de gastos manuales | 5 | ✅ `GAS-AAAA-NNNNN` correlativo atómico |
| 27 | Formatos aceptados en facturas/comprobantes | 5 | ✅ PDF + JPG/PNG/WEBP, máx 10 MB |
| 28 | Saldo apertura de caja | 5 | ✅ Sin pantalla; saldo inicial como movimiento manual |
| 29 | Edición de gastos | 5 | ✅ Libre en mes actual; anular con compensación si es anterior |
| 30 | Backfill de compras existentes en caja | 5 | ✅ Automático e idempotente en la migración |
| 31 | IVA en compras (calc auto u override) | 5 | ✅ Auto-calculado, override opcional |
| 32 | Cliente en cotización: catálogo o libre | 6 | ✅ Libre permitido — `customerId` nullable + columnas snapshot |
| 33 | Estado inicial al guardar cotización | 6 | ✅ DRAFT siempre + botón separado "Enviar" la pasa a SENT |
| 34 | Generación de PDF para email/WhatsApp | 6 | ✅ `jspdf` + `jspdf-autotable` server-side. WhatsApp envía link al PDF público |
| 35 | Vigencia (validUntil) y auto-expiración | 6 | ✅ 15 días default + cron diario marca EXPIRED |
| 36 | Reserva de stock al cotizar | 6 | ✅ No se reserva. Stock baja solo al confirmar venta |
| 37 | Edición de cotización después de SENT | 6 | ✅ Editable libremente hasta CONVERTED |
| 38 | "Convertir a venta" — flujo | 6/7 | ✅ Abre `/ventas/nueva?fromQuotation=<id>` con form prellenado |
| 39 | Vigencia del link público | 6 | ✅ Token expira = `validUntil`. Después 410 Gone |
| 40 | Formato de impresión default | 6 | ✅ Carta default + selector "Imprimir 80mm" |
| 41 | Descuentos en cotización | 6 | ✅ Por línea (monto o %), sin descuento global |
| 42 | Plantilla mensaje WhatsApp | 6 | ✅ Saludo + número cot + total + link al PDF |
| 43 | Plantilla email | 6 | ✅ HTML simple branded + PDF adjunto |
| 44 | Resend — dominio verificado | 6/12 | ✅ Dev (`onresend.dev`) en Fase 6, dominio real en Fase 12 |
| 45 | Modal "Venta o Cotización" en Fase 6 | 6 | ✅ Implementado con opción "Venta" deshabilitada hasta Fase 7 |
| 46 | Sidebar — ubicación de Cotizaciones | 6 | ✅ Sección "Operación" → "Cotizaciones" |
| 47 | Transición APPROVED / REJECTED | 6 | ✅ Botones manuales en el detalle interno |
| 48 | Columnas del PDF de cotización | 6 | ✅ Código + Descripción + Cant + P.Unit + Desc + Subtotal |
| 49 | Estado inicial al confirmar la venta | 7 | ✅ Directo a `PAID` (sin paso intermedio `PENDING`). Para registrar pedidos no cobrados existe Cotización. |
| 50 | Cliente en venta: catálogo o libre | 7 | ✅ Solo del catálogo (RUT obligatorio). Si no existe, el operador lo crea en `/clientes/nuevo` y vuelve — sin snapshot inline para preservar la regla "RUT obligatorio en ventas mostrador". |
| 51 | Forma del form de venta | 7 | ✅ `SaleForm` separado de `QuotationForm`. Comparte building blocks (ProductPicker, CustomerCombobox, toggle $/%) pero NO el shell — diferencias clave (método de pago, stock por línea, sin envío) justifican componentes propios. |
| 52 | Convertir cotización → venta: flujo | 6 / 7 | ✅ El backend marca `Quotation.status = CONVERTED` en la **misma transacción** del create de venta cuando llega `quotationId`. El operador puede ajustar items/pago antes de confirmar; si cancela el form, la cotización queda intacta. |
| 53 | Cancelación de venta: reglas | 7 | ✅ Cualquier venta no-cancelada puede cancelarse, sin ventana de tiempo. Motivo obligatorio (mínimo 5 chars). Revierte stock vía `RETURN_IN` + anula transacciones de caja con compensación, todo atómico. No reactivable. |
| 54 | UX de stock disponible en venta | 7 | ✅ Badge "Stock: X" debajo del input de cantidad. Si la cantidad excede el disponible, la fila se pinta rojo y el botón "Confirmar" queda deshabilitado. Backend revalida en `applyMovement` (defensa en profundidad). |
| 55 | Notas en venta | 7 | ✅ Campo opcional visible en el PDF de la nota de venta. Cubre observaciones de despacho hasta que llegue Guía de Despacho en Fase 7.7. |
| 56 | Salida del PDF de venta | 7 | ✅ Botón "Imprimir" en el detalle con dropdown Carta (A4) + Térmica 80mm. Sin link público — la venta es documento interno, no se envía al cliente vía WhatsApp/email. |
| 57 | Selector de bodega en venta | 7 | ✅ Schema preparado (`Sale.warehouseId NOT NULL`) pero **sin selector visible** mientras solo exista "Principal". El backend asigna automáticamente. En Fase 7.5 aparece el selector sin tocar schema. |
| 58 | Acceso al form de venta | 7 | ✅ Item "Ventas" en sidebar (sección Operación). Botón directo "Nueva venta" en `/ventas` que abre el dialog. El FAB global también lo abre vía el modal "Venta o Cotización". |
| 59 | Etiquetas térmicas para productos | 11 | ✅ **Confirmado: formato 50 mm ancho × 30 mm alto** para impresora térmica. Se entrega en Fase 11 junto con scanners USB/cámara como un bloque coherente. Endpoint `GET /products/:id/label?format=50x30` + botón "Imprimir etiqueta" en el detalle. Usa `bwip-js` para el barcode CODE128. |
| 60 | Código de ubicación de producto por bodega | 7.5 | ✅ **Confirmado: por bodega**, no global. Se agrega `Stock.locationCode` (varchar 30, nullable) en Fase 7.5 cuando multi-bodega se active de verdad. Durante esta fase se migran los valores existentes del campo global `Product.location` al nuevo, y queda deprecated. Editable inline desde `/inventario` con la bodega seleccionada. Búsqueda por código de ubicación. |
| 61 | Conversión de cotización libre → venta | 6/7 (Ronda 3) | ✅ **Registrar al cliente antes de continuar**: el SaleForm muestra el snapshot en un banner readonly y un dialog inline registra al cliente en el catálogo (pre-llenado, con búsqueda anti-duplicados por RUT). Tras registrar, la cotización origen queda linkeada al nuevo cliente (`Quotation.customerId` setteado) y los snapshots se mantienen como histórico. Respeta la regla #14 "RUT obligatorio para ventas mostrador" sin tocar el schema de `sales`. |
| 62 | Control de stock en items de cotización | 6 (Ronda 3) | ✅ **Warning informativo, no bloqueante**. Badge "Stock: X" siempre visible bajo cada input de cantidad; cuando se excede, la fila se pinta ámbar y el badge muestra "Stock: 5 (faltan 3)". Banner ámbar al final de la tabla con la lista completa de items afectados. Diferencia con venta (donde el exceso bloquea con rojo): cotización permite exceso porque puede haber importaciones en tránsito (lead time 2-3 meses). El stock se revalida en duro al convertir a venta. |
| 63 | Alcance de HubSpot (dirección del sync) | 8.5 | ✅ **Confirmado mayo 2026: push desde el sistema** (sistema = fuente de verdad). El sistema empuja contactos + lifecycle a HubSpot vía `@hubspot/api-client`. Bidireccional (webhook inverso, Deals, embeds) queda para Fase 13 si el cliente lo necesita tras usar el MVP. |
| 64 | Identificador primario del lead | 8.5 | ✅ **Confirmado mayo 2026: WhatsApp en E.164** (`customer.whatsappPhone`). Email queda como fallback de upsert. La mayoría de los contactos comerciales empiezan por WhatsApp. |
| 65 | Estados del lifecycle | 8.5 | ✅ **Confirmado mayo 2026**: `NEW` (crear contacto/cotización) → `QUOTED` (al enviar cotización) → `FOLLOW_UP` (cron tras N horas sin respuesta) → `WON` (al confirmar venta) o `LOST` (manual con motivo). Solo `LOST` es transición manual; el resto se calcula desde eventos del sistema. |
| 66 | Bandeja `/seguimiento` con tabs | 8.5 | ✅ **Confirmado mayo 2026**: 4 tabs — Pendientes / Sin respuesta / Vencidos / Último contacto. Botones rápidos WhatsApp + "Marcar contacto" + "Marcar como perdido" + link a cotizaciones del cliente. |
| 67 | Horas para `FOLLOW_UP` | 8.5 | Pendiente. Asunción: **48h** default. Configurable desde `/configuracion` vía `companySettings.followUpHoursDefault`. |
| 68 | Lifecycle en `Customer` extendido vs entidad `Lead` separada | 8.5 | Pendiente. Asunción: **extensión de `Customer`** (simplicidad + RUT obligatorio para venta). Si aparecen contactos sin RUT que nunca compran, evaluar `Lead` aparte. |
| 69 | Hooks lifecycle: sync vs async | 8.5 | Pendiente. Asunción: **async vía queue** para que HubSpot caído no rompa el create de venta. |
| 70 | Plantilla mensaje WhatsApp en `/seguimiento` | 8.5 | Pendiente. Asunción: **texto editable** desde `/configuracion` con tokens `{cliente}`, `{cotizacion}`, `{total}`. |
| 71 | KPIs del día en el dashboard | 9 | ✅ **Confirmado mayo 2026**: agregar Ventas del día, Cotizaciones del día, Pendientes de seguimiento, Vencidos, Ventas ganadas, Rotación de inventario. **Todos clicables** — cada card navega al detalle filtrado. Vista **mobile-first** desde la primera entrega. |
| 72 | Responsive móvil prioritario | Transversal | ✅ **Confirmado mayo 2026**: operación comercial frecuente desde teléfono. **Ronda 4** transversal antes de Fase 9 cierra brechas: sidebar drawer, tablas con scroll horizontal + primera columna sticky o vista de cards, revisión de forms en mobile. |

---

## Próximas fases

Cada fase es un PR independiente con verificación end-to-end al cierre. Ver [PLAN.md](PLAN.md#plan-de-implementación-por-fases) para el detalle.

**Fase 5:** ✅ Caja, gastos, IVA y comisiones — ver sección "Fase 5" arriba.

**Fase 6:** ✅ Cotizaciones + modal "venta o cotización" + impresión 80mm/Carta + WhatsApp/email — ver sección "Fase 6" arriba.

**Fase 7:** ✅ Ventas con caja integrada (warehouseId + método de pago + comisión tarjeta atómica + cancelación con motivo + PDF Carta/80mm + convertir desde cotización) — ver sección "Fase 7" arriba.

**Fase 7.5:** ✅ Multi-bodega + transferencias entre bodegas + código de ubicación por bodega + bodega "Mercado Libre Full" seedeada (inactiva por defecto) — ver sección "Fase 7.5" arriba.

**Fase 7.6:** ✅ Devoluciones (cliente y proveedor) + Garantías (no afectan stock) — ver sección "Fase 7.6" arriba.

**Fase 7.7:** ✅ Guía de despacho con correlativo DESP-AAAA-NNNNN, dirección de entrega editable, PDF Carta/80mm, anulación con motivo + cascada al cancelar venta — ver sección "Fase 7.7" arriba.

**Fase 8 (siguiente):** Reportes + **Proyección de stock** con lista de productos críticos exportable a CSV/Excel (importante por el lead time de 2-3 meses de las importaciones del cliente).

**Fase 8.5 (nueva — pedida en mayo 2026):** **Lead lifecycle + Seguimiento comercial + HubSpot push**. Formaliza el flujo comercial real: WhatsApp como identificador del lead, lifecycle automático (`NEW` → `QUOTED` → `FOLLOW_UP` → `WON` / `LOST`) calculado desde eventos del sistema, cron diario para detectar follow-ups vencidos, bandeja `/seguimiento` con tabs Pendientes/Sin respuesta/Vencidos/Último contacto + botones rápidos WhatsApp, sync one-way a HubSpot vía `@hubspot/api-client` (sistema como fuente de verdad). Bloquea Fase 9 porque el dashboard depende del concepto de "pendientes de seguimiento".

**Ronda 4 (transversal, antes de Fase 9):** Responsive móvil — sidebar pasa a drawer (`<Sheet>` de shadcn) en `<md`, tablas grandes con scroll horizontal + primera columna sticky o vista de cards, revisión de SaleForm/QuotationForm/TransferForm en mobile, FAB ajustado.

**Fase 9:** Dashboard **mobile-first** con KPIs **clicables**. KPIs nuevos respecto del PLAN original: Ventas del día, Cotizaciones del día, Pendientes de seguimiento, Vencidos, Ventas ganadas, Rotación de inventario. Iteración 9.2 agrega embudo del lifecycle (NEW → QUOTED → WON / LOST).

**Fase 11:** Códigos de barras (lector USB + cámara `@zxing/browser`) + **etiquetas térmicas 50×30 mm con barcode CODE128** (`bwip-js`) + refinamiento de plantillas con branding final.

**Fase 13:** HubSpot refinamientos post-MVP — webhook inverso (HubSpot → sistema), sync de Deals, embed de formularios HubSpot, sync histórico inicial. Solo se ejecuta si el cliente lo pide tras usar Fase 8.5 en producción.

---

## Soporte

Si te trabás con algo y este README no lo cubre, agregalo acá cuando lo resuelvas. La idea es que un dev nuevo pueda llegar a `./run.sh dev` y hacer login en menos de 15 minutos sin preguntar nada.
