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
| 7 | Ventas con caja integrada (selector de bodega + comisión tarjeta + impresión) | pendiente |
| 7.5 | Multi-bodega + transferencias (flujo Mercado Libre Full manual) | pendiente |
| 7.6 | Devoluciones + Garantías | pendiente |
| 7.7 | Guía de despacho con número correlativo | pendiente |
| 8 | Reportes + proyección de stock + lista de productos críticos (CSV/Excel) | pendiente |
| 9 | Dashboard (KPIs + alertas + gráficos) | pendiente |
| 10 | Carga masiva Excel | pendiente |
| 11 | Códigos de barras + etiquetas + refinamiento de plantillas | pendiente |
| 12 | Deploy (Railway + Vercel + Resend) | pendiente |
| 13 | Integración HubSpot (alcance a confirmar) | pendiente |
| 14 | Manual + video + soporte post-entrega | pendiente |

---

## Historial de correcciones (feedback del cliente)

> Bitácora de fixes de UX y bugs reportados por el cliente sobre módulos ya entregados. Cada entrada describe el problema, la solución aplicada y los archivos tocados, para no perder el contexto cuando vuelvan a aparecer dudas o se quiera auditar el motivo de un cambio.

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

---

## Próximas fases

Cada fase es un PR independiente con verificación end-to-end al cierre. Ver [PLAN.md](PLAN.md#plan-de-implementación-por-fases) para el detalle.

**Fase 5:** ✅ Caja, gastos, IVA y comisiones — ver sección "Fase 5" arriba.

**Fase 6:** ✅ Cotizaciones + modal "venta o cotización" + impresión 80mm/Carta + WhatsApp/email — ver sección "Fase 6" arriba.

**Fase 7 (siguiente):** Ventas con caja integrada, selector de bodega, comisión tarjeta automática, impresión 80mm/Carta. Habilita la opción "Venta" del modal y reemplaza el placeholder de `/ventas/nueva`. La conversión cotización → venta queda funcional al confirmar la venta (cotización pasa a CONVERTED + items consumen stock + caja registra ingreso).

**Fases 7.5 / 7.6 / 7.7:** Multi-bodega + transferencias (flujo Mercado Libre Full); Devoluciones (suman stock) y Garantías (no afectan stock); Guía de despacho con número correlativo.

**Fase 8:** Reportes + **Proyección de stock** con lista de productos críticos exportable a CSV/Excel (importante por el lead time de 2-3 meses de las importaciones del cliente).

---

## Soporte

Si te trabás con algo y este README no lo cubre, agregalo acá cuando lo resuelvas. La idea es que un dev nuevo pueda llegar a `./run.sh dev` y hacer login en menos de 15 minutos sin preguntar nada.
