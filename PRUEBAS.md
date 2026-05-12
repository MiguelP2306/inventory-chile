# Guía de pruebas — Fases 0 a 7.7

> Este documento es un **manual operativo** para validar todo el sistema antes de continuar con Fase 8 (Reportes) y siguientes. Está organizado por fase, con pasos concretos, respuestas esperadas y errores esperados (que también hay que validar — confirmar que el sistema falla cuando tiene que fallar).
>
> **No es una doc de uso para el cliente final** — es para el desarrollador testeando. Por eso incluye queries SQL, endpoints HTTP y validaciones de bajo nivel.

---

## Tabla de contenidos

- [Antes de empezar](#antes-de-empezar)
- [Fase 0 — Bootstrap del monorepo](#fase-0--bootstrap-del-monorepo)
- [Fase 1 — Base de datos y autenticación](#fase-1--base-de-datos-y-autenticación)
- [Fase 2 — Catálogo de productos + compatibilidad vehicular](#fase-2--catálogo-de-productos--compatibilidad-vehicular)
- [Fase 3 — Inventario](#fase-3--inventario)
- [Refinamientos transversales post-Fase 3](#refinamientos-transversales-post-fase-3)
- [Fase 4 — Clientes y proveedores](#fase-4--clientes-y-proveedores)
- [Fase 4B — Catálogo extendido](#fase-4b--catálogo-extendido)
- [Fase 5 — Caja, gastos, IVA y comisiones](#fase-5--caja-gastos-iva-y-comisiones)
- [Fase 6 — Cotizaciones](#fase-6--cotizaciones)
- [Fase 7 — Ventas con caja integrada](#fase-7--ventas-con-caja-integrada)
- [Fase 7.5 — Multi-bodega + transferencias](#fase-75--multi-bodega--transferencias)
- [Fase 7.6 — Devoluciones y garantías](#fase-76--devoluciones-y-garantías)
- [Fase 7.7 — Guía de despacho](#fase-77--guía-de-despacho)
- [Rondas de correcciones](#rondas-de-correcciones)
- [Apéndices](#apéndices)

---

## Antes de empezar

### Levantar el proyecto desde cero

Necesitás Git Bash o WSL2 si estás en Windows. PowerShell no corre `run.sh`.

```bash
# 1) Setup inicial (una sola vez)
./run.sh setup

# 2) Crear DB y aplicar migraciones
./run.sh db:init
./run.sh db:migrate

# 3) Sembrar datos iniciales (admin, almacenes, comunas, categorías)
./run.sh db:seed

# 4) Levantar backend + frontend
./run.sh dev
```

Si algo falla en el paso 1, ejecutá `./run.sh doctor` para ver qué requisito está faltando (Node, pnpm, MySQL).

### URLs

| Servicio | URL |
| --- | --- |
| Frontend (Next.js) | http://localhost:3000 |
| Backend (NestJS) | http://localhost:4000/api |
| Vista pública de cotización | http://localhost:3000/p/cotizacion/`<token>` |

### Credenciales de admin

| Email | Password |
| --- | --- |
| `admin@inventory.local` | `admin123` |

> Para cambiar, definí `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` antes de correr `db:seed`.

### Acceso directo a la base de datos

```bash
# Cliente CLI
mysql -u inventory -h 127.0.0.1 inventory

# Querys útiles que vas a usar mucho durante el testing
SHOW TABLES;
SELECT * FROM users;
SELECT * FROM warehouses;
SELECT * FROM company_settings;
SELECT * FROM counters;  -- correlativos por kind/year
```

### Limpiar todo y volver a empezar

```bash
./run.sh db:reset    # drop + create + migrate + seed
```

---

## Fase 0 — Bootstrap del monorepo

### Qué cubre

Estructura del repo, pnpm workspaces, `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared`. ESLint, Prettier, MySQL local. Script `run.sh`.

### Pruebas

#### ✅ 0.1 — El proyecto levanta sin errores

```bash
./run.sh dev
```

**Respuesta esperada:**
- Console muestra:
  - `[api] Nest application successfully started` en puerto 4000
  - `[web] Ready in X ms` en puerto 3000
- Sin warnings rojos ni stack traces.

#### ✅ 0.2 — Typecheck pasa en los 3 paquetes

```bash
pnpm --filter @inventory/shared build
pnpm --filter @inventory/api typecheck
pnpm --filter @inventory/web typecheck
```

**Respuesta esperada:** los 3 terminan sin errores TypeScript.

#### ✅ 0.3 — La página de health responde

```bash
curl http://localhost:4000/api/health
```

**Respuesta esperada:** `{"status":"ok"}` (o similar — verificá que devuelva 200).

#### ❌ 0.4 — MySQL apagado da error claro

Parar MySQL (`net stop MySQL80` en Windows o `sudo systemctl stop mysql` en Linux).

Reiniciar el backend.

**Respuesta esperada:** Console muestra error de conexión claro tipo `ER_CONN_HOST_ERROR` o `ECONNREFUSED`. Restartear MySQL y volver a levantar.

---

## Fase 1 — Base de datos y autenticación

### Qué cubre

21 entidades base con migración inicial. Auth JWT con cookies httpOnly, login, refresh, logout. Guard global. Decorador `@CurrentUser()`.

### Pruebas

#### ✅ 1.1 — Login con admin seedeado

Ir a http://localhost:3000/login.

Ingresar `admin@inventory.local` / `admin123`. Click "Iniciar sesión".

**Respuesta esperada:**
- Redirige a `/` (dashboard).
- En DevTools → Application → Cookies aparecen `access_token` y `refresh_token` con flags `HttpOnly`.

#### ❌ 1.2 — Login con credenciales malas

Ingresar `admin@inventory.local` / `wrong-password`.

**Respuesta esperada:**
- Toast rojo: "Email o contraseña incorrectos" (o mensaje similar).
- HTTP 401 en la network tab.
- No se setean cookies.

#### ✅ 1.3 — Página protegida sin sesión redirige a login

En modo incógnito, abrir http://localhost:3000/productos.

**Respuesta esperada:** Redirige inmediatamente a `/login`.

#### ✅ 1.4 — Refresh token funciona transparente

Estar logueado. En DevTools, **borrar manualmente** la cookie `access_token` (dejar `refresh_token`).

Navegar a `/productos`.

**Respuesta esperada:**
- La página carga normalmente (sin redirect a login).
- En Network: una llamada a `/auth/refresh` devuelve 200 con nuevo `access_token`.

#### ❌ 1.5 — Sin refresh tampoco → redirect a login

Borrar **ambas** cookies. Navegar a `/productos`.

**Respuesta esperada:** Redirige a `/login`.

#### ✅ 1.6 — Logout

Click en el menú de usuario (esquina superior) → "Cerrar sesión".

**Respuesta esperada:**
- Cookies eliminadas.
- Redirige a `/login`.

### Verificación en DB

```sql
-- Confirmar que el admin existe
SELECT id, name, email, role, isActive FROM users;

-- Las migraciones deberían haber creado todas las tablas
SHOW TABLES;
-- Debería listar ~25 tablas (users, warehouses, products, etc.)
```

---

## Fase 2 — Catálogo de productos + compatibilidad vehicular

### Qué cubre

CRUD de Categorías, Marcas, Vehículos (marcas y modelos), Productos. Compatibilidad vehicular (`VehicleFitment`). Búsqueda por SKU/partNumber/barcode/nombre. Buscador global Cmd+K.

### Pruebas

#### ✅ 2.1 — Crear taxonomía completa

1. Ir a `/categorias` → "Nueva categoría" → nombre "Frenos". Guardar.
2. Ir a `/marcas` → "Nueva marca" → "Bosch". Guardar.
3. Ir a `/vehiculos` → tab "Marcas" → "Nueva" → "Toyota". Guardar.
4. Mismo lugar, tab "Modelos" → "Nueva" → marca Toyota, nombre "Corolla". Guardar.

**Respuesta esperada:** Las 4 entidades aparecen en sus listados respectivos con toasts de éxito.

#### ❌ 2.2 — Crear duplicado da error

Crear otra categoría con nombre "Frenos".

**Respuesta esperada:**
- Toast rojo: "Ya existe una categoría con nombre 'Frenos'".
- HTTP 409 en la network tab.

#### ✅ 2.3 — Crear producto con compatibilidad

1. Ir a `/productos` → "Nuevo producto".
2. Llenar:
   - SKU: `BR-001`
   - Nombre: `Pastilla de freno delantera Bosch`
   - Categoría: Frenos
   - Marca: Bosch
   - Costo: 5000
   - Precio: 9990
   - Stock mín: 5
3. Ir a tab "Compatibilidad" → agregar fila: Marca Toyota, Modelo Corolla, Desde 2010, Hasta 2020.
4. Guardar.

**Respuesta esperada:** Producto creado, redirige al detalle. La compatibilidad aparece en el tab.

#### ✅ 2.4 — Buscar por compatibilidad vehicular

En `/productos`, en el filtro "Buscar por vehículo compatible", elegir Marca: Toyota, Modelo: Corolla, Año: 2015.

**Respuesta esperada:** El producto BR-001 aparece (porque 2015 está entre 2010-2020).

#### ❌ 2.5 — Buscar año fuera del rango

Mismo filtro pero año 2005.

**Respuesta esperada:** Lista vacía ("Sin resultados").

#### ✅ 2.6 — Validación zod de duplicados en compatibilidad

Editar el producto. En tab "Compatibilidad", agregar otra fila con Toyota Corolla 2015-2018 (rango que se superpone con el existente).

**Respuesta esperada:** Error inline en la fila: "Ya existe una compatibilidad con este modelo y rango se superpone".

#### ❌ 2.7 — Borrar categoría con productos

Intentar borrar la categoría "Frenos".

**Respuesta esperada:**
- Toast rojo: "No se puede eliminar la categoría: hay productos asociados. Reasigná los productos o desactívalos primero."
- HTTP 409 (NO 500).
- La categoría sigue existiendo.

#### ✅ 2.8 — Buscador rápido Cmd+K

Apretar `Cmd+K` (Mac) o `Ctrl+K` (Win/Linux) en cualquier pantalla.

**Respuesta esperada:** Abre command palette. Tipear "pastilla" → aparece BR-001. Click → navega al detalle.

### Verificación en DB

```sql
SELECT id, sku, name, categoryId, brandId FROM products;
SELECT * FROM vehicle_fitments;
```

---

## Fase 3 — Inventario

### Qué cubre

`InventoryService.applyMovement()` como única vía de mutar stock (transaccional). Entradas de mercadería (compras). Ajustes manuales con motivo. Movimientos con filtros. Vista de stock con semáforo verde/amarillo/rojo.

### Pruebas

#### ✅ 3.1 — Crear proveedor + entrada de compra

1. Ir a `/proveedores` → "Nuevo proveedor" → nombre "Proveedor Test", RUT válido (ej: `78773510-K`). Guardar.
2. Ir a `/compras` → "Nueva entrada":
   - Proveedor: Proveedor Test
   - Agregar producto BR-001 con cantidad 100, costo unitario 5000.
3. Confirmar.

**Respuesta esperada:**
- Compra creada con total `595.000` (100 × 5000 + 19% IVA = 595.000) o `500.000` según cómo esté el seed.
- Aparece movimiento `PURCHASE_IN` en `/inventario/movimientos`.
- Stock de BR-001 en `/inventario` sube a 100.

#### ✅ 3.2 — Ajuste manual de stock (modal con tabs)

1. En `/inventario`, click en el ícono ⚙️ de la fila BR-001.
2. Tab "Disminuir", cantidad 5, motivo "Merma por inspección". Confirmar.

**Respuesta esperada:**
- Toast: "Stock ajustado".
- Stock de BR-001 baja a 95.
- En `/inventario/movimientos` aparece `ADJUSTMENT` con qty `-5`.

#### ✅ 3.3 — Semáforo cambia color al cruzar `minStock`

El producto BR-001 tiene `minStock=5`. Hacer ajuste de -91 (queda en 4).

**Respuesta esperada:** En `/inventario` el badge del producto cambia a `Bajo stock` (amarillo).

Hacer otro ajuste de -4 (queda en 0).

**Respuesta esperada:** Badge cambia a `Sin stock` (rojo).

#### ❌ 3.4 — Ajuste deja stock negativo

En `/inventario`, BR-001 está en 0. Modal de ajuste → Disminuir 5.

**Respuesta esperada:**
- En el modal aparece "Stock resultante: -5 (no permitido)" en rojo.
- Botón "Ajustar" deshabilitado.

#### ✅ 3.5 — Modal de ajuste con modo "Establecer"

Hacer entrada de 100 unidades para BR-001. Volver a 100.

Abrir modal de ajuste → Tab "Establecer" → cantidad final 95, motivo "Conteo físico".

**Respuesta esperada:**
- En el modal: "Variación calculada: -5 · Stock resultante: 95".
- Al confirmar, stock baja a 95. Aparece movimiento `ADJUSTMENT -5` con motivo "Conteo físico".

#### ✅ 3.6 — Filtros en movimientos

En `/inventario/movimientos`:
1. Filtrar por tipo `Compra` → solo aparecen los `PURCHASE_IN`.
2. Filtrar por fecha `hoy` → solo aparecen los del día.
3. Click "Limpiar filtros" → vuelve a la vista completa.

**Respuesta esperada:** Los filtros se sincronizan con la URL (`?type=PURCHASE_IN&dateFrom=...`).

### Verificación en DB

```sql
SELECT type, qty, reference, refId FROM inventory_movements ORDER BY createdAt DESC LIMIT 10;
SELECT productId, warehouseId, quantity FROM stocks;
```

---

## Refinamientos transversales post-Fase 3

### Qué cubre

Helper `rethrowFkAsConflict` (FK → 409). Paginación universal. Búsqueda libre `q`. Unicidad de RUT en proveedores. `formatCurrency`. `useUrlFilters` + `useDebouncedUrlFilter`.

### Pruebas

#### ✅ R3.1 — Formato monetario CLP

En `/productos`, ver la columna Precio.

**Respuesta esperada:** Precios se muestran como `$9.990` (no `$9990.00`).

#### ✅ R3.2 — Filtros persistentes en URL

En `/productos` filtrar por categoría "Frenos". URL cambia a `?category=<uuid>`. Recargar la página.

**Respuesta esperada:** El filtro se mantiene aplicado tras el reload.

#### ✅ R3.3 — Input de búsqueda fluido (Ronda 1)

En `/productos`, escribir rápido "pastilla" en el input de búsqueda.

**Respuesta esperada:**
- Cada tecla se ve inmediatamente en el input (sin lag).
- A los ~300ms de detener la escritura, la URL se actualiza con `?q=pastilla` y se dispara la query.

#### ❌ R3.4 — Borrar producto con movimientos

Intentar borrar BR-001 (que ya tiene movimientos).

**Respuesta esperada:**
- Toast rojo: "No se puede eliminar el producto: hay movimientos asociados...".
- HTTP 409.

#### ✅ R3.5 — Paginación

Si tenés >20 productos, ver que en `/productos` aparece `X productos · página 1 de N` y botones Anterior/Siguiente.

---

## Fase 4 — Clientes y proveedores

### Qué cubre

`Customer` con RUT obligatorio + único (índice DB). Dirección desglosada (calle/número/comuna). Catálogo de 346 comunas chilenas. Validación RUT chileno (formato + DV). Validación teléfono E.164. Detalle de proveedor con historial de compras.

### Pruebas

#### ✅ 4.1 — Crear cliente con RUT válido

Ir a `/clientes` → "Nuevo cliente":
- Nombre: "Juan Pérez"
- RUT: `12345678-5` (DV correcto)
- Email: opcional
- Comuna: Providencia (usar el selector con búsqueda)

Guardar.

**Respuesta esperada:** Cliente creado, RUT se normaliza a `12345678-5`.

#### ❌ 4.2 — RUT con DV incorrecto

Crear cliente con RUT `12345678-9` (DV incorrecto).

**Respuesta esperada:** Error inline: "RUT inválido (formato 12345678-9)".

#### ❌ 4.3 — RUT duplicado

Crear otro cliente con RUT `12345678-5`.

**Respuesta esperada:**
- Toast rojo: "Ya existe un cliente con ese RUT" (o similar).
- HTTP 409.

#### ✅ 4.4 — Teléfono internacional válido

En el cliente, agregar teléfono `+56 9 1234 5678`.

**Respuesta esperada:** Se guarda normalizado a `+56912345678` (E.164).

#### ❌ 4.5 — Teléfono inválido

Intentar teléfono `123`.

**Respuesta esperada:** Error inline: "Teléfono inválido (ej: +56 9 1234 5678)".

#### ✅ 4.6 — Detalle de proveedor con tab Compras

Ir a `/proveedores/<id-de-Proveedor-Test>`. Tab "Compras".

**Respuesta esperada:** Aparece la compra hecha en Fase 3 (100 unidades de BR-001 por $500.000 o similar).

#### ✅ 4.7 — Comuna con búsqueda

Al crear o editar un cliente, en el selector de comuna escribir "provi".

**Respuesta esperada:** Aparecen las comunas que contienen "provi" (Providencia, etc.) agrupadas por región.

#### ❌ 4.8 — Borrar cliente con ventas (cuando tengamos ventas)

Crear venta para el cliente, después intentar borrarlo.

**Respuesta esperada:** 409 con mensaje claro. (Validar al hacer la prueba de Fase 7).

### Verificación en DB

```sql
SELECT id, name, taxId, phone, communeId FROM customers;
-- Confirmar que taxId tiene índice único
SHOW INDEX FROM customers WHERE Key_name='idx_customers_taxid';
SELECT COUNT(*) FROM communes;  -- Debería ser 346
```

---

## Fase 4B — Catálogo extendido

### Qué cubre

`Product.universalCode`, `productKind` (ORIGINAL/ALTERNATIVE), galería `product_images`, códigos múltiples `product_codes`. Upload de imágenes (JPEG/PNG/WEBP, max 10MB).

### Pruebas

#### ✅ 4B.1 — Crear producto ALTERNATIVE con código universal

En `/productos/nuevo`:
- SKU: `ALT-001`
- Nombre: "Filtro de aceite genérico"
- Tipo: `Alternativo`
- Código universal: `OF-7890`

Guardar.

#### ✅ 4B.2 — Agregar códigos compatibles

Editar ALT-001 → tab "Códigos" → agregar 2 códigos compatibles: `OF-7891`, `OF-7892`. Guardar.

**Respuesta esperada:** Los códigos se persisten. En `/productos` buscar `OF-7891` → encuentra ALT-001.

#### ✅ 4B.3 — Subir imágenes de producto

Editar ALT-001 → tab "Imágenes":
1. Drag-drop una imagen JPG.
2. Subir otra PNG.
3. Marcar la segunda como portada.
4. Eliminar la primera.

**Respuesta esperada:**
- Las imágenes aparecen como miniaturas.
- La cover se marca con un badge.
- Al eliminar la cover, la siguiente se promueve a cover automáticamente.

#### ❌ 4B.4 — Subir archivo no permitido

Intentar subir un `.pdf` o `.gif` (no en whitelist).

**Respuesta esperada:** Toast rojo: "Tipo de archivo no permitido. Usá JPG, PNG o WEBP.".

#### ❌ 4B.5 — Imagen > 10 MB

Intentar subir una imagen de 12 MB.

**Respuesta esperada:** Toast: "El archivo excede los 10 MB" (o similar). HTTP 413.

#### ✅ 4B.6 — Filtro ORIGINAL vs ALTERNATIVE en listado

En `/productos`, filtrar por tipo "Alternativo".

**Respuesta esperada:** Solo aparece ALT-001 (no BR-001 que es default ORIGINAL).

#### ✅ 4B.7 — Búsqueda extendida por código universal

En `/productos`, buscar `OF-7890`.

**Respuesta esperada:** Aparece ALT-001 (matchea contra `universalCode`).

### Verificación en DB

```sql
SELECT id, sku, universalCode, productKind FROM products;
SELECT * FROM product_images;
SELECT * FROM product_codes;
```

Verificación física en disco:

```bash
ls apps/api/uploads/products/
# Debería haber archivos <uuid>.jpg / .png
```

---

## Fase 5 — Caja, gastos, IVA y comisiones

### Qué cubre

`expenses` con correlativo `GAS-AAAA-NNNNN`. Caja consolidada (`CashTransaction`). IVA en compras descompuesto. Comisión tarjeta (preparada para Fase 7). Adjuntos de factura. `/configuracion` con tasa IVA y comisión.

### Pruebas

#### ✅ 5.1 — Registrar gasto manual

Ir a `/gastos` → "Nuevo gasto":
- Categoría: Arriendo
- Descripción: "Arriendo local marzo"
- Monto: 350000
- Método: Transferencia

Guardar.

**Respuesta esperada:**
- Gasto creado con número `GAS-2026-00001`.
- En `/caja` aparece un EGRESO de $350.000 con `source=MANUAL`.
- Saldo total baja en $350.000.

#### ✅ 5.2 — Anular gasto

En `/gastos`, click ícono ⊘ del gasto recién creado. Confirmar anulación.

**Respuesta esperada:**
- El gasto pasa a estado anulado (filas en gris con badge "Anulado").
- En `/caja` ahora hay 2 transacciones: la EGRESO original (con `isVoided=true`) y una compensatoria INGRESO.
- Saldo vuelve al estado previo.

#### ✅ 5.3 — Categorías de gasto del sistema

Ir a `/configuracion/categorias-gasto`. Las 3 categorías reservadas (`IVA Compra`, `IVA Venta`, `Comisión Tarjeta`) tienen badge "Sistema" y los botones de editar/borrar están deshabilitados.

**Respuesta esperada:** Confirmar que no se pueden modificar.

#### ❌ 5.4 — Editar gasto de mes anterior

Crear un gasto y editar manualmente la fecha en DB para que sea del mes pasado:
```sql
UPDATE expenses SET date = DATE_SUB(NOW(), INTERVAL 1 MONTH) WHERE number='GAS-2026-00002';
```
Volver a `/gastos`, intentar editar ese gasto.

**Respuesta esperada:** HTTP 409 con mensaje "Solo se pueden editar gastos del mes actual. Anulá con compensación.".

#### ✅ 5.5 — Compra con IVA descompuesto

Hacer una compra de 100 unidades a $5950 (con IVA, default = 19%).

**Respuesta esperada:** En el listado de `/compras` se ve:
- Subtotal: $500.000
- IVA: $95.000
- Total: $595.000

En `/caja` aparece EGRESO de $595.000 con `source=PURCHASE`.

#### ✅ 5.6 — Adjuntar factura a compra

Editar la compra, subir un PDF de factura.

**Respuesta esperada:** En el listado de `/compras`, la fila muestra un ícono de paperclip 📎 que linkea al archivo.

#### ✅ 5.7 — Cambiar tasa de IVA

Ir a `/configuracion` → cambiar tasa IVA a 16% (Argentina). Guardar.

**Respuesta esperada:** Toast de éxito. Próximas compras descomponen IVA al 16%.

#### ✅ 5.8 — Saldo por método de pago en caja

En `/caja`, los 4 cards de arriba muestran:
- Saldo total
- Efectivo (suma de CASH transactions)
- Transferencia
- Tarjeta

**Respuesta esperada:** Los saldos cuadran con la suma manual de las transacciones.

### Verificación en DB

```sql
SELECT id, number, type, source, amount, isVoided FROM cash_transactions ORDER BY createdAt DESC LIMIT 20;
SELECT * FROM counters WHERE kind IN ('EXPENSE', 'PURCHASE');
SELECT taxRate, cardCommissionRate FROM company_settings;
```

---

## Fase 6 — Cotizaciones

### Qué cubre

Cotizaciones con correlativo `COT-AAAA-NNNNN`. Cliente catálogo o libre (snapshot). Items con descuentos $ o %. Estados DRAFT/SENT/APPROVED/REJECTED/CONVERTED/EXPIRED. Envío por WhatsApp (`wa.me`) y email (Resend). PDF carta + 80mm. Link público con token. Cron diario de expiración.

### Pruebas

#### ✅ 6.1 — Crear cotización con cliente catálogo

En `/cotizaciones` → "Nueva cotización":
1. Tab Cliente: elegir "Juan Pérez" del catálogo.
2. Tab Items: agregar BR-001 (qty 2, precio $9990, sin descuento).
3. Tab Notas: "Plazo de entrega: 5 días hábiles".
4. "Guardar borrador".

**Respuesta esperada:**
- Toast: "Cotización guardada como borrador".
- Aparece en el listado con estado `Borrador`.
- En el detalle, el total bruto = $19.980, IVA descompuesto, subtotal neto.

#### ✅ 6.2 — Crear cotización con cliente libre

Nueva cotización → Tab Cliente → botón "Cliente libre (sin guardar)" → llenar solo nombre "Pedro Sin Catálogo" (sin RUT).

Items: agregar producto, qty 1.

Guardar borrador.

**Respuesta esperada:** Se crea con `customerId=null` y `customerNameSnapshot="Pedro Sin Catálogo"`.

#### ✅ 6.3 — Descuento por línea ($ y %)

En una cotización con un item de qty 10 × $1000 = $10.000:
1. Editar el item. En el campo de descuento, escribir 1000 con el toggle en `$`.
2. **Respuesta esperada:** Subtotal de la línea = $9000.
3. Cambiar toggle a `%` y escribir 20.
4. **Respuesta esperada:** Subtotal = $8000 (20% × $10.000 = $2000 desc).

#### ✅ 6.4 — Stock warning en items (Ronda 3)

En una cotización agregar BR-001 con qty mayor al stock disponible.

**Respuesta esperada:**
- La fila se pinta en ámbar suave.
- Badge "Stock: X (faltan Y)" en ámbar.
- Banner ámbar al final de la tabla listando los items afectados.
- Botón "Guardar" NO se bloquea (warning, no error).

#### ✅ 6.5 — Imprimir PDF

En el detalle, botón "Imprimir" → seleccionar "Carta (A4)" o "Térmica 80mm".

**Respuesta esperada:** Se abre el PDF en una nueva pestaña con:
- Empresa + RUT
- Cliente + datos
- Tabla de items con código, descripción, qty, precio, descuento, subtotal
- Totales (subtotal neto + IVA + total)
- Notas al final del documento
- Sin texto "15 días" — solo la fecha real de validez (Ronda 2)

#### ✅ 6.6 — Enviar por WhatsApp

En el detalle, dropdown "Guardar y enviar" → "Enviar por WhatsApp".

**Respuesta esperada:**
- Se abre en una nueva pestaña `wa.me/<phone>?text=<mensaje>` con un mensaje plantilla que incluye:
  - Saludo con nombre del cliente
  - Número de cotización
  - Total
  - Link a la página pública
- La cotización pasa a estado `Enviada`.

#### ❌ 6.7 — Enviar a cliente del catálogo sin teléfono (Ronda 2)

Crear cotización con un cliente catalogado que no tenga teléfono.

Dropdown "Guardar y enviar" → "Enviar por WhatsApp".

**Respuesta esperada:**
- Toast rojo: "Este cliente no tiene teléfono guardado." + botón "Ir al cliente" que abre el perfil del cliente.
- La cotización NO se guarda (modal queda abierto, datos intactos).

#### ✅ 6.8 — Enviar por email (Resend)

Para que funcione, configurar `RESEND_API_KEY` en `.env.local`.

Crear cotización con un cliente con email válido. Enviar por email.

**Respuesta esperada:**
- Toast: "Cotización guardada y enviada por email".
- El email llega al destinatario con asunto "Cotización COT-AAAA-NNNNN - Mi Empresa" y PDF adjunto.

#### ✅ 6.9 — Link público

En el detalle, copiar el "Link público de la cotización" (icono de copy junto al número).

Abrir el link en modo incógnito.

**Respuesta esperada:** Renderiza la cotización en modo público sin login, con botón "Descargar PDF" que funciona. Las notas aparecen visibles (Ronda 2).

#### ✅ 6.10 — Link público vencido devuelve 410

Editar la cotización para que `validUntil` sea ayer:
```sql
UPDATE quotations SET validUntil = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE number='COT-2026-00001';
```

Abrir el link público.

**Respuesta esperada:** Página "Cotización vencida" con mensaje claro. HTTP 410 en la network tab.

#### ✅ 6.11 — Convertir cotización a venta (cliente catálogo)

Estado APPROVED. Click "Convertir a venta".

**Respuesta esperada:** Navega a `/ventas/nueva?fromQuotation=<id>` con el form pre-llenado (cliente, items, descuentos, notas).

#### ✅ 6.12 — Convertir cotización libre a venta (Ronda 3)

Crear cotización libre con nombre + RUT en el snapshot. Aprobarla. Convertir a venta.

**Respuesta esperada:**
- En el SaleForm aparece un banner amarillo + card readonly con los datos del snapshot.
- Botón "Registrar y continuar" → abre dialog con CustomerForm pre-llenado.
- Si el RUT ya existe, banner verde "Ya existe un cliente con este RUT" con botón "Usar este cliente".
- Al registrar, el cliente queda en el catálogo, el SaleForm continúa normal.
- Tras confirmar la venta, la cotización origen queda con `Quotation.customerId` setteado al nuevo cliente.

### Verificación en DB

```sql
SELECT id, number, status, customerId, customerNameSnapshot, validUntil, publicToken FROM quotations;
SELECT * FROM quotation_items WHERE quotationId='<id>';
SELECT * FROM counters WHERE kind='QUOTATION';
```

---

## Fase 7 — Ventas con caja integrada

### Qué cubre

Ventas con correlativo `VTA-AAAA-NNNNN`. Cliente solo del catálogo. Método de pago (CASH/TRANSFER/CARD). Comisión tarjeta automática. Stock atómico. PDF Carta + 80mm. Cancelación con motivo + reversión atómica.

### Pruebas

#### ✅ 7.1 — Confirmar venta efectivo

1. Hacer entrada de stock para BR-001 (100 unidades) si no quedan.
2. En `/ventas` → "Nueva venta":
   - Cliente: Juan Pérez
   - Método: Efectivo
   - Items: BR-001 qty 3
3. Confirmar.

**Respuesta esperada:**
- Toast: "Venta VTA-2026-00001 registrada".
- Stock baja a 97.
- En `/caja` aparece INGRESO de $29.970 con `source=SALE, paymentMethod=CASH`.
- Saldo de efectivo sube.

#### ✅ 7.2 — Venta con tarjeta + comisión

Mismo flujo pero método "Tarjeta".

**Respuesta esperada:**
- INGRESO por el total bruto (sin descontar comisión).
- EGRESO adicional por la comisión (2.5% × total, ~$749 si total=$29.970), con `expenseCategoryId=Comisión Tarjeta`.
- Saldo de tarjeta = total - comisión.

#### ✅ 7.3 — Validación de stock antes de confirmar

Crear venta con qty mayor al disponible.

**Respuesta esperada:**
- Badge rojo "Stock: X" debajo del input.
- Fila pintada en rojo claro.
- Botón "Confirmar" deshabilitado.

#### ❌ 7.4 — Race condition de stock

(Difícil de simular sin script.) Como prueba sustituta: con stock=5, intentar vender qty=5 desde dos pestañas distintas casi al mismo tiempo.

**Respuesta esperada:** La segunda venta debería fallar con 409 "Stock insuficiente" — la primera tomó el lock.

#### ✅ 7.5 — Cancelar venta efectivo

En el detalle de la venta, click "Cancelar venta". Motivo: "Cliente desistió". Confirmar.

**Respuesta esperada:**
- Stock vuelve a 100 (movimiento `RETURN_IN`).
- En `/caja`: la transacción INGRESO original queda con `isVoided=true`, aparece una compensatoria EGRESO por el mismo monto. Saldo cuadra con el estado pre-venta.
- La venta queda en estado `CANCELLED` con motivo + auditoría.

#### ✅ 7.6 — Cancelar venta con tarjeta también revierte la comisión

Hacer venta tarjeta, después cancelarla.

**Respuesta esperada:**
- Tanto el INGRESO como el EGRESO de comisión quedan `isVoided=true`, con sus respectivas compensaciones.

#### ❌ 7.7 — Cancelar venta ya cancelada

Intentar cancelar nuevamente.

**Respuesta esperada:** HTTP 409 "La venta ya está cancelada".

#### ✅ 7.8 — Imprimir nota de venta

En el detalle, "Imprimir" → Carta o Térmica 80mm.

**Respuesta esperada:** PDF con título "Nota de venta VTA-AAAA-NNNNN", método de pago en el encabezado, sin "Válida hasta", notas al final si las hay.

#### ✅ 7.9 — Convertir cotización a venta marca cotización CONVERTED

Tomar una cotización SENT, convertirla a venta y confirmar.

**Respuesta esperada:**
- La cotización pasa a estado `Convertida en venta`.
- La venta tiene `quotationId` setteado.
- En el detalle de la venta aparece link "Desde cotización COT-XXX".

### Verificación en DB

```sql
SELECT id, number, status, paymentMethod, total, commissionAmount, quotationId FROM sales;
SELECT id, type, qty, reference FROM inventory_movements WHERE refId IN (SELECT id FROM sales);
SELECT type, source, amount, isVoided FROM cash_transactions WHERE source='SALE';
```

---

## Fase 7.5 — Multi-bodega + transferencias

### Qué cubre

`Warehouse.isActive` (soft delete). `InventoryMovementType.TRANSFER_OUT/IN`. `transfers` con correlativo `TRF-AAAA-NNNNN`. `Stock.locationCode` editable inline en `/inventario`. Bodega "Mercado Libre Full" seedeada inactiva.

### Pruebas

#### ✅ 7.5.1 — Activar "Mercado Libre Full"

En `/almacenes`, la bodega "Mercado Libre Full" aparece en gris con badge "Inactiva". Click el ⚡ (icono de toggle).

**Respuesta esperada:** Pasa a Activa. Aparece en selectores de venta y transferencia.

#### ✅ 7.5.2 — Transferir stock entre bodegas

Tener stock de BR-001 en Principal. Ir a `/transferencias/nueva`:
- Origen: Principal
- Destino: Mercado Libre Full
- Agregar BR-001 qty 10

Confirmar.

**Respuesta esperada:**
- Transferencia creada con número `TRF-2026-00001`.
- En `/inventario/movimientos` aparecen 2 movimientos nuevos:
  - `TRANSFER_OUT -10` en Principal
  - `TRANSFER_IN +10` en ML Full
- Stock de BR-001 en Principal baja por 10, en ML Full sube por 10.

#### ❌ 7.5.3 — Transferir más de lo disponible

Intentar transferir qty mayor al stock origen.

**Respuesta esperada:**
- Fila pintada en rojo, botón "Confirmar" deshabilitado.
- Si por race condition pasa, backend devuelve 409.

#### ❌ 7.5.4 — Origen = destino

En el form, elegir misma bodega como origen y destino.

**Respuesta esperada:** El selector deshabilita la misma opción en el otro select. Si lográs enviarlo, backend rechaza con 400 "La bodega origen y destino no pueden ser la misma".

#### ✅ 7.5.5 — Stock por bodega en `/inventario`

En `/inventario`, selector de bodega arriba. Cambiar entre "Principal" y "Mercado Libre Full".

**Respuesta esperada:**
- La tabla se actualiza con el stock de la bodega seleccionada.
- URL refleja `?warehouse=<id>`.

#### ✅ 7.5.6 — Editar ubicación inline

En `/inventario` (bodega Principal), click en la celda "Ubicación" de BR-001. Tipear "A-12-3". Enter para guardar.

**Respuesta esperada:** Toast "Ubicación actualizada". El valor se persiste y queda visible al recargar.

#### ✅ 7.5.7 — Buscar por código de ubicación

En `/inventario`, en el campo de búsqueda escribir "A-12-3".

**Respuesta esperada:** El producto con esa ubicación aparece.

#### ✅ 7.5.8 — Venta desde Mercado Libre Full

Crear venta seleccionando bodega "Mercado Libre Full" en el form.

**Respuesta esperada:** Stock baja de ML Full (no de Principal).

#### ✅ 7.5.9 — Cancelar transferencia

En `/transferencias/<id>` → "Cancelar transferencia" con motivo.

**Respuesta esperada:**
- 2 movimientos compensatorios: `TRANSFER_IN` en origen (devuelve) + `TRANSFER_OUT` en destino (saca).
- Stock vuelve al estado pre-transferencia.

#### ❌ 7.5.10 — Cancelar transferencia con stock destino ya consumido

Hacer transferencia, vender ese stock desde la bodega destino, después intentar cancelar la transferencia.

**Respuesta esperada:** HTTP 409 "Stock insuficiente para…" — la cancelación falla porque no puede dejar stock negativo silenciosamente. Hay que revertir la venta primero.

#### ✅ 7.5.11 — Eliminar bodega virgen

Crear una bodega "Bodega Temporal" (no la uses para nada). En `/almacenes`, click 🗑️.

**Respuesta esperada:** Toast "Bodega eliminada". Desaparece de la lista (hard delete).

#### ✅ 7.5.12 — Eliminar bodega con historial → soft delete

Intentar eliminar "Principal" (que tiene movimientos).

**Respuesta esperada:** Toast "Bodega desactivada (tenía movimientos asociados)". La bodega queda en la lista en gris.

### Verificación en DB

```sql
SELECT id, name, isActive FROM warehouses;
SELECT type, qty, warehouseId FROM inventory_movements WHERE type IN ('TRANSFER_OUT', 'TRANSFER_IN');
SELECT productId, warehouseId, quantity, locationCode FROM stocks;
SELECT * FROM transfers;
SELECT * FROM transfer_items;
```

---

## Fase 7.6 — Devoluciones y garantías

### Qué cubre

`returns` con tipo CUSTOMER/SUPPLIER. Items con condición RESELLABLE/DAMAGED. Anti-doble-devolución. Cancelación atómica. `warranty_claims` con transiciones de estado. Sin efecto sobre stock para garantías.

### Pruebas

#### ✅ 7.6.1 — Devolución parcial de cliente (Vendible)

Tener una venta confirmada con BR-001 qty 5. En `/ventas/<id>` → "Crear devolución":
- Marcar BR-001 con qty 2, condición "Vendible"
- Motivo: "Producto equivocado"
- Método de reembolso: Efectivo

Confirmar.

**Respuesta esperada:**
- Devolución creada con número `DEV-2026-00001`.
- Stock de BR-001 sube por 2 (movimiento `RETURN_IN` en la bodega de la venta).
- En `/caja` aparece EGRESO de `2 × $9990 = $19.980` con `source=SALE_RETURN`.

#### ✅ 7.6.2 — Devolución con condición Dañado (no restockea)

Misma venta, devolver 1 unidad más con condición "Dañado".

**Respuesta esperada:**
- Stock NO sube (no hay `RETURN_IN` para esa línea).
- Sí se registra EGRESO en caja por $9990.

#### ❌ 7.6.3 — Anti-doble-devolución

En la misma venta (vendió 5, ya se devolvieron 3), intentar devolver 5 más.

**Respuesta esperada:**
- En el form, el input limita a max 2 (5 - 3 ya devuelto).
- Si lográs forzar más, backend devuelve 409 con mensaje "Se intentó devolver X de un item con N vendidas y M ya devueltas. Disponible: …".

#### ✅ 7.6.4 — Cancelar devolución

En `/devoluciones/<id>` → "Cancelar devolución" con motivo.

**Respuesta esperada:**
- Para los items RESELLABLE: emite `RETURN_OUT` (saca lo que pusimos).
- Para items DAMAGED: nada de stock (no se había movido).
- Caja: la transacción `SALE_RETURN` queda `isVoided=true` con compensación INCOME.
- Devolución queda en estado CANCELLED.

#### ✅ 7.6.5 — Abrir reclamo de garantía

En `/ventas/<id>`, en cada fila de item hay un ícono ⚠️. Click sobre un item.

Dialog: agregar nota "Cliente reporta que dejó de funcionar a los 10 días". Confirmar.

**Respuesta esperada:**
- Reclamo creado con número `GAR-2026-00001`, estado `Abierto`.
- Redirige a `/garantias/<id>`.
- **No se mueve stock.** Confirmar en `/inventario/movimientos` que no hay nada nuevo.

#### ❌ 7.6.6 — Abrir otro reclamo sobre el mismo item

Mientras el primer reclamo está activo (no REJECTED ni RESOLVED), abrir otro reclamo sobre el mismo `saleItem`.

**Respuesta esperada:** HTTP 409 "Ya hay un reclamo activo sobre este item (GAR-2026-00001, estado OPEN). Cerrá ese primero…".

#### ✅ 7.6.7 — Transiciones de estado del reclamo

En `/garantias/<id>`:
1. Click "Pasar a revisión" → estado `IN_REVIEW`.
2. Click "Aprobar" → estado `APPROVED`. Aparece banner verde sugiriendo crear devolución.
3. Click "Marcar como resuelto" → dialog pide texto de resolución obligatorio. Escribir "Cambio por producto nuevo bajo garantía". Confirmar → estado `RESOLVED` con `resolvedAt` setteado.

**Respuesta esperada:** Cada transición se persiste. Estados terminales (RESOLVED, REJECTED) no permiten cambiar más.

#### ❌ 7.6.8 — Transición inválida

Crear otro reclamo (OPEN). Intentar pasar directo a APPROVED.

**Respuesta esperada:** HTTP 409 "Transición inválida: OPEN → APPROVED. Transiciones permitidas: IN_REVIEW, REJECTED.".

#### ❌ 7.6.9 — Marcar como RESOLVED sin texto

En un reclamo APPROVED, intentar pasar a RESOLVED sin escribir resolución.

**Respuesta esperada:** Validación de zod en el dialog: "Resolución (obligatoria)". Si fuerzas el envío, backend rechaza con 400.

### Verificación en DB

```sql
SELECT id, number, type, status, refundAmount, saleId, paymentMethod FROM returns;
SELECT * FROM return_items;
SELECT type, qty FROM inventory_movements WHERE refId IN (SELECT id FROM returns);
SELECT type, source, amount FROM cash_transactions WHERE source LIKE '%RETURN%';
SELECT id, number, status, saleItemId, openedAt, resolvedAt FROM warranty_claims;
```

---

## Fase 7.7 — Guía de despacho

### Qué cubre

`dispatch_notes` con correlativo `DESP-AAAA-NNNNN`. Una guía activa por venta. Anulación con motivo. Cascada al cancelar venta. PDF Carta + 80mm. Sugerencias de transportista.

### Pruebas

#### ✅ 7.7.1 — Generar guía desde una venta

En `/ventas/<id>` confirmada → "Generar guía de despacho":
- Verificar que la dirección pre-llenada coincide con la del cliente.
- Editar el número (ej: cambiar 1234 por 5678 — para esta guía).
- Transportista: "Chilexpress"
- Tracking: "ABC123"
- Observaciones: "Entregar en horario laboral"

Confirmar.

**Respuesta esperada:**
- Toast: "Guía DESP-2026-00001 generada".
- Redirige a `/guias/<id>`.
- El detalle muestra los 3 bloques (venta origen, dirección con número modificado, transporte).
- **No** tocó stock ni caja.

#### ✅ 7.7.2 — Botón cambia a "Ver guía" en la venta

Volver a `/ventas/<id>` de la misma venta.

**Respuesta esperada:** Donde estaba "Generar guía de despacho" ahora dice "Ver guía DESP-2026-00001" y es un link al detalle.

#### ❌ 7.7.3 — Intentar generar segunda guía activa

Si por algún motivo intentás generar otra guía sin anular la primera (con curl directo):

```bash
curl -X POST http://localhost:4000/api/dispatch \
  -H "Cookie: access_token=…" \
  -H "Content-Type: application/json" \
  -d '{"saleId":"<id>", "carrier":"Otro"}'
```

**Respuesta esperada:** HTTP 409 "Esta venta ya tiene una guía activa (DESP-2026-00001). Anulala antes de generar una nueva.".

#### ✅ 7.7.4 — Sugerencias de transportista

Generar una segunda guía (en otra venta). En el campo "Transportista" empezar a tipear "Chi".

**Respuesta esperada:** El datalist HTML sugiere "Chilexpress" (porque ya se usó antes).

#### ✅ 7.7.5 — Anular guía

En `/guias/<id>` → "Anular guía" → motivo: "Transportista cargado mal".

**Respuesta esperada:**
- Guía pasa a estado VOIDED con banner rojo.
- En la venta vuelve el botón "Generar guía de despacho" (puede generar una nueva).

#### ✅ 7.7.6 — Generar nueva guía tras anular

En la venta cuya guía anulamos → "Generar guía" → confirmar.

**Respuesta esperada:** Se crea con el siguiente correlativo (DESP-2026-00003 si la anulada era 00002). La 00002 queda en el historial en gris.

#### ✅ 7.7.7 — PDF de la guía

En `/guias/<id>` → "Imprimir" → "Carta (A4)".

**Respuesta esperada:** PDF con:
- "Guía de despacho DESP-AAAA-NNNNN"
- Datos empresa
- Cliente + Entrega (con la dirección modificada, no la del cliente)
- Tabla items con cantidades **sin precios**
- Transportista + tracking
- Observaciones
- Línea para firma del receptor

#### ✅ 7.7.8 — PDF de guía anulada muestra "ANULADA" en rojo

Imprimir el PDF de una guía VOIDED.

**Respuesta esperada:** Aparece "ANULADA" en rojo cerca del título.

#### ✅ 7.7.9 — Cascada: cancelar venta anula guía activa

Tener una venta con guía activa. Cancelar la venta con motivo "Cliente desistió".

**Respuesta esperada:**
- Venta CANCELLED.
- Guía pasa a VOIDED automáticamente con motivo "Venta cancelada · Cliente desistió" y `voidedById` setteado.
- En `/guias/<id>` se ve el banner rojo con ese motivo compuesto.

### Verificación en DB

```sql
SELECT id, number, saleId, status, carrier, trackingNumber, voidedAt, voidReason FROM dispatch_notes;

-- Confirmar que solo hay una ACTIVE por venta
SELECT saleId, COUNT(*) FROM dispatch_notes WHERE status='ACTIVE' GROUP BY saleId HAVING COUNT(*) > 1;
-- Debería devolver 0 filas (regla de unicidad activa por venta).
```

---

## Rondas de correcciones

Estas se prueban implícitamente al usar las pantallas que afectan, pero acá los casos puntuales para verificar.

### Ronda 1 — Inputs de búsqueda fluidos

Escribir rápido en los inputs de búsqueda de:
- `/productos`, `/inventario`, `/clientes`, `/proveedores`, `/vehiculos`, `/gastos`, `/cotizaciones`, `/ventas`, `/transferencias`, `/devoluciones`, `/garantias`, `/guias`.

**Respuesta esperada en todos:** cero pérdida de caracteres, escritura fluida, query se dispara ~300ms después del último keystroke.

### Ronda 2 — Cotizaciones

- Toggle $/% en items de cotización: en mobile (responsive del navegador), el toggle debe ser tocable cómodamente.
- Modal con error: provocar un error de envío (cliente sin email/teléfono) → el modal NO se cierra y los datos quedan intactos.
- Texto "15 días" obsoleto: imprimir cotización → debería NO aparecer "Esta cotización tiene una validez de 15 días desde su emisión".
- Notas: agregar nota a una cotización → debe aparecer en PDF Y en link público.

### Ronda 3 — Conversión cotización libre y stock en items

- Convertir cotización libre → SaleForm muestra banner amarillo con datos del snapshot, botón "Registrar y continuar" abre dialog con búsqueda anti-duplicados.
- Stock en items de cotización: warning ámbar (NO bloqueante) cuando se excede.

### Ronda 4 — Responsive móvil (pendiente)

⚠️ **Esta ronda aún NO se implementó** — está pendiente antes de Fase 9. Por ahora el sidebar desaparece en mobile sin reemplazo (`hidden md:flex`). Anotar como bug visible si testeás en teléfono.

---

## Apéndices

### A. Queries SQL útiles

#### Ver todos los correlativos en uso

```sql
SELECT kind, year, lastNumber FROM counters ORDER BY kind, year;
```

#### Saldo de caja por método de pago

```sql
SELECT
  paymentMethod,
  SUM(CASE WHEN type='INCOME' AND isVoided=0 THEN amount ELSE 0 END) AS ingresos,
  SUM(CASE WHEN type='EXPENSE' AND isVoided=0 THEN amount ELSE 0 END) AS egresos,
  SUM(CASE WHEN type='INCOME' AND isVoided=0 THEN amount
           WHEN type='EXPENSE' AND isVoided=0 THEN -amount
           ELSE 0 END) AS saldo
FROM cash_transactions
GROUP BY paymentMethod;
```

#### Productos con stock crítico

```sql
SELECT p.sku, p.name, s.warehouseId, s.quantity, p.minStock
FROM products p
JOIN stocks s ON s.productId = p.id
WHERE s.quantity <= p.minStock AND p.isActive = TRUE
ORDER BY s.quantity ASC;
```

#### Stock por producto en todas las bodegas

```sql
SELECT p.sku, p.name, w.name AS warehouse, s.quantity, s.locationCode
FROM stocks s
JOIN products p ON p.id = s.productId
JOIN warehouses w ON w.id = s.warehouseId
ORDER BY p.sku, w.name;
```

#### Ventas del día con totales

```sql
SELECT number, paymentMethod, status, total, commissionAmount
FROM sales
WHERE DATE(date) = CURDATE()
ORDER BY date DESC;
```

#### Trazar movimientos de una venta (incluyendo cancelaciones)

```sql
SELECT m.type, m.qty, m.reference, m.createdAt
FROM inventory_movements m
WHERE m.refId = '<sale-id>'
ORDER BY m.createdAt;
```

### B. Troubleshooting común

#### "Error: connect ECONNREFUSED 127.0.0.1:3306"

MySQL apagado. Levantarlo: `net start MySQL80` (Win) o `sudo systemctl start mysql` (Linux).

#### "No estás autorizado" en endpoints sin razón aparente

Cookie expirada. Cerrar sesión y volver a entrar. Si pasa seguido, ver si `JWT_SECRET` cambió entre restarts.

#### Migración pendiente

```bash
./run.sh db:migrate
```

Si una migración corrió a medias y quedó inconsistente:

```bash
./run.sh db:reset   # ⚠️ Borra TODOS los datos
```

#### Subir imagen falla con "EACCES"

Permisos del directorio `apps/api/uploads/`. Linux: `chmod -R 755 apps/api/uploads`.

#### Resend no envía emails

Verificar que `RESEND_API_KEY` esté en `.env.local` Y que el dominio del `from` esté verificado en Resend. En desarrollo, usar `onresend.dev` (dominio dev de Resend) o sandbox.

#### El cron diario de expiración de cotizaciones / lifecycle no corre

`ScheduleModule.forRoot()` debe estar en `AppModule`. Verificar con:

```bash
grep "ScheduleModule" apps/api/src/app.module.ts
```

### C. Checklist final antes de Fase 8

Antes de empezar Fase 8 (Reportes), verificar que estos puntos pasen:

- [ ] Todos los `pnpm typecheck` pasan en `shared`, `api`, `web`.
- [ ] `./run.sh db:reset && ./run.sh dev` levanta de cero sin errores.
- [ ] Login funciona con `admin@inventory.local` / `admin123`.
- [ ] CRUD completo de productos, categorías, marcas, vehículos.
- [ ] Crear cliente con RUT chileno valida DV.
- [ ] Crear venta efectivo + tarjeta + cancelar → stock y caja cuadran.
- [ ] Crear cotización libre, convertirla a venta registrando al cliente.
- [ ] Transferencia entre bodegas refleja movimientos y stock por bodega.
- [ ] Devolución parcial con condición Vendible/Dañado.
- [ ] Reclamo de garantía con transiciones de estado.
- [ ] Guía de despacho con anulación y cascada en cancelación de venta.
- [ ] PDFs de cotización, venta y guía abren correctamente.
- [ ] Filtros de URL se preservan al recargar.

Si todos pasan: listo para arrancar Fase 8.

### D. Datos de prueba sugeridos

Para tener un escenario denso para testear reportes en Fase 8, sembrar:

- 5 categorías de productos.
- 3 marcas.
- 2-3 marcas de vehículo + 5-10 modelos.
- 20-30 productos variados (mix ORIGINAL/ALTERNATIVE, distintos precios y stocks mínimos).
- 5 clientes con datos completos (RUT, teléfono, dirección).
- 2 proveedores.
- 10 compras a lo largo del último mes (variar fechas).
- 15-20 ventas (mix de métodos de pago, algunas canceladas).
- 5 cotizaciones (mix de estados).
- 2-3 transferencias entre bodegas.
- 3-5 devoluciones (mix CUSTOMER/SUPPLIER, Vendible/Dañado).
- 2-3 reclamos de garantía en distintos estados.
- 2-3 guías de despacho (alguna anulada).

Con eso podrás validar los reportes de Fase 8 contra datos reales.

---

**Fin del documento.** Cuando termines la ronda completa de testing y estés cómodo con todo, podemos arrancar **Fase 8 — Reportes + Proyección de stock**.
