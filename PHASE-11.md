# Fase 11 — Códigos de barras, etiquetas térmicas y refinamiento de plantillas

> Documento dedicado a la Fase 11 del MVP. Cubre contexto, decisiones de
> diseño, arquitectura, endpoints, UI, dependencias y plan completo de tests
> end-to-end. El `README.md` general tiene una sección resumen; este archivo
> es la referencia exhaustiva.

---

## Contexto

El cliente atiende mostrador y bodega de repuestos automotrices. Hoy busca productos por nombre tipeando en la barra global. Con la operación creciendo, **necesitan escanear** para ser más rápidos:

- **En mostrador / venta**: el operador arma una venta o cotización escaneando los productos uno a uno. Cada segundo cuenta.
- **En bodega**: el encargado verifica precio, stock y ubicación de un producto sacándolo de la góndola y escaneando el código.
- **Al recibir mercadería**: pegar etiquetas con barcode + precio en cada unidad que llega a la bodega para que pueda escanearse después.

La Fase 11 cubre los **3 lados del mismo problema**:

1. **Entrada por escáner** (input): leer un código y resolverlo a un producto del sistema, ya sea con lector USB (que se comporta como teclado) o con la cámara del celular/laptop.
2. **Salida por etiqueta** (output): generar un PDF de etiqueta térmica 50×30mm con barcode imprimible para pegar en producto físico.
3. **Refinamiento de plantillas**: agregar barcode CODE128 al PDF de la **guía de despacho** para que pueda escanearse desde la guía de papel (útil para tracking interno).

---

## Decisiones de diseño

| Tema | Decisión |
| --- | --- |
| Tipo de barcode | **CODE128** para todo (etiquetas + guía). Alfanumérico (acepta SKUs con letras como `FIL-AC-001`), denso, universalmente soportado por scanners y térmicas. Para EAN-13/UPC del fabricante, el `Product.barcode` los almacena tal cual; al imprimir, ponemos lo que esté en `barcode` (priorizado sobre SKU). |
| Formato etiqueta | **50 mm × 30 mm**, una etiqueta por página del PDF (la térmica las corta una a una). Confirmado con el cliente desde antes (ver tabla "Decisiones acordadas" del README #59). |
| Contenido etiqueta | **Nombre · Barcode · SKU · Precio · LocationCode (opcional)**. Si el producto se imprime desde una pantalla con bodega activa (`?warehouseId=…`), el footer incluye el `Stock.locationCode` de esa bodega. |
| Cantidad de copias | **Configurable por dialog** (default 1, max 100). El operador elige; el PDF resultante tiene N páginas idénticas. |
| Scanner USB | **Funciona como teclado**: cualquier input `<input>` recibe el código + ENTER. No requiere driver ni código JS adicional. Le agregamos **handler `onKeyDown Enter`** en los pickers para hacer **lookup exacto** automático tras el ENTER (sin esperar a que el usuario haga click). |
| Scanner cámara | Componente reutilizable `<CameraScanner>` que usa `@zxing/browser` (`BrowserMultiFormatReader`). Soporta CODE128, EAN-13, EAN-8, QR, Code39, ITF y más sin configuración. Pide permiso de cámara; busca cámara trasera primero (mejor para mobile). |
| Lookup vs LIKE | **Endpoint dedicado `GET /products/lookup?code=…`** que hace EQUALS contra los 5 códigos del producto (`sku`, `partNumber`, `barcode`, `universalCode`, `product_codes.code`). Devuelve 404 si no hay match exacto. Distinto del `quick-search` que usa LIKE — el lookup es para scanners (un match → acción inmediata) y el quick-search es para humanos (varios matches → elegir). |
| Fallback de scanner | Si la cámara no se puede iniciar (sin permiso, sin MediaDevices, navegador antiguo) → mensaje claro con tip de fallback ("usá un lector USB o Cmd+K"). Si el lookup no encuentra match → caer a búsqueda libre con el código como `q`. |
| Branding de plantillas | **Mínimo viable**: agregar barcode CODE128 del número de documento al PDF de **guía de despacho** (lo pide el PLAN explícitamente). El branding completo (logo del cliente, paleta corporativa) queda para cuando el cliente entregue los assets finales. |

---

## Arquitectura

### Stack agregado

| Componente | Librería | Versión | Dónde |
| --- | --- | --- | --- |
| Generación de barcode server-side | [`bwip-js`](https://github.com/metafloor/bwip-js) | latest | `apps/api` |
| Lectura de barcode por cámara client-side | [`@zxing/browser`](https://github.com/zxing-js/browser) + [`@zxing/library`](https://github.com/zxing-js/library) | latest | `apps/web` |

> `jsPDF` ya estaba instalado en `apps/api` desde Fase 6 (lo usamos para
> cotización/venta/guía). Lo reusamos para generar la etiqueta térmica.

### Mapa de archivos nuevos

#### Backend (`apps/api`)

```
src/
├── common/
│   └── barcode.ts                    ← NEW · helper renderBarcodePng() compartido (LabelService + PdfService)
├── products/
│   ├── label.service.ts              ← NEW · genera PDF 50×30mm con barcode + SKU + precio + (opcional) locationCode
│   ├── products.controller.ts        ← MOD · agrega @Get('lookup'), @Get(':id/label')
│   ├── products.service.ts           ← MOD · agrega lookupExact(rawCode)
│   └── products.module.ts            ← MOD · registra LabelService + Stock entity
└── notifications/
    └── pdf.service.ts                ← MOD · barcode CODE128 del número en la guía de despacho
```

#### Frontend (`apps/web`)

```
components/
├── camera-scanner.tsx                ← NEW · modal con video + @zxing/browser
├── print-label-dialog.tsx            ← NEW · dialog "Imprimir etiqueta" (cantidad + opcional locationCode)
├── product-picker.tsx                ← MOD · botón "Escanear" cámara + Enter→lookup exacto
├── quick-search.tsx                  ← MOD · botón cámara dentro del CommandDialog Cmd+K
├── forms/product-form.tsx            ← MOD · botón "Imprimir etiqueta" en header del detalle
└── sidebar.tsx                       ← MOD · item "Escanear" en sección Operación

app/(dashboard)/
└── escanear/page.tsx                 ← NEW · pantalla dedicada (input USB + botón cámara)

lib/
└── catalog-api.ts                    ← MOD · lookupProductByCode() + getProductLabelUrl()
```

---

## Endpoints nuevos

### `GET /api/products/lookup?code=<string>`

Lookup EXACTO por código. Optimizado para scanners (USB o cámara). Compara
por igualdad estricta contra:

- `Product.sku`
- `Product.partNumber`
- `Product.barcode`
- `Product.universalCode`
- `ProductCode.code` (compatibles)

**Respuestas:**
- `200` + `ProductDto` si hay match (con `category` y `brand` joineados, `coverUrl` resuelto).
- `400` si falta el query param `code`.
- `404` si el código no coincide con ningún producto.

**Por qué no usar `/products?q=<code>`**: el listado usa `LIKE %q%` y devuelve N resultados ordenados por nombre. Un scanner necesita una sola respuesta inmediata para tomar acción (agregar a venta, navegar a detalle). El endpoint `lookup` ahorra el round-trip a "elegir el primero".

### `GET /api/products/:id/label?qty=<1..100>&warehouseId=<uuid>`

Genera un PDF 50×30mm con N copias de la etiqueta de un producto.

**Query params:**
- `qty` (opcional, default 1, max 100): cantidad de copias del PDF. Cada copia es una página independiente para que la térmica corte una por una.
- `warehouseId` (opcional): si viene, el footer incluye el `Stock.locationCode` de esa bodega ("LOC: A-12"). Sin warehouse, el footer solo tiene el precio.

**Respuesta:**
- `200` + `application/pdf` inline (el browser puede abrirlo en pestaña nueva y mandar a imprimir).
- `400` si `qty` está fuera del rango 1..100.
- `404` si el producto no existe o no tiene SKU ni barcode (caso imposible en condiciones normales — el schema garantiza SKU autogenerado).

---

## UI / UX nuevos

### Pantalla dedicada `/escanear`

Accesible desde el sidebar (sección **Operación** → "Escanear", icono `ScanLine`).

Layout:
- **Card "Lector USB o ingreso manual"**: input autoFocus + botón Buscar. Pensado para conectar la pistola USB y disparar.
- **Card "Cámara"**: botón que abre el `<CameraScanner>`. Funciona en mobile (cámara trasera priorizada) y desktop con webcam.

Flujo: ingresar/escanear código → lookup exacto → si hay match navega a `/productos/<id>`; si no, muestra cartel "No hay ningún producto con código exacto" + tip para usar el listado.

### `<CameraScanner>` componente reutilizable

Modal con:
- `<video>` que muestra el feed de la cámara.
- Marco-guía centrado (rectángulo blanco con fondo oscuro fuera).
- `@zxing/browser` decodificando cada frame.
- Toast verde "Escaneado: XYZ" justo antes de cerrar.

Manejo robusto de errores:
- Browser sin `navigator.mediaDevices` → mensaje claro + fallback.
- Usuario rechaza permiso → mensaje + instrucción para habilitar.
- Stream se libera correctamente al cerrar (sin que la cámara quede encendida en background).

Soporta **múltiples formatos** automáticamente (`BrowserMultiFormatReader`): CODE128, EAN-13, EAN-8, QR, Code39, ITF, UPC-A, UPC-E, Codabar.

### Integración en `<ProductPicker>` (ventas / cotizaciones)

- Input ahora dice "SKU, código de barras o nombre · Enter escanea".
- **Handler `onKeyDown Enter`**: al apretar Enter con texto cargado, hace lookup exacto. Si hay match, agrega al picker y cierra (caso típico del lector USB). Si no, sigue mostrando matches LIKE debajo.
- **Botón ícono cámara** al lado del input → abre `<CameraScanner>`.
- Cuando la cámara detecta un código, mismo flujo que Enter: lookup → match → agregar + cerrar.

### Integración en `<QuickSearch>` (Cmd+K global)

- Botón "Escanear" agregado dentro del header del `CommandDialog`, junto al input.
- Al detectar un código, lookup exacto → navega al detalle del producto sin pasar por la lista.

### Botón "Imprimir etiqueta" en `/productos/[id]`

En el header del ProductForm (modo edición), junto a Eliminar / Cancelar / Guardar.

Abre `<PrintLabelDialog>` con:
- Input numérico "Cantidad de copias" (1..100, default 1).
- Checkbox "Incluir ubicación" (sólo visible si el dialog se abrió desde un contexto con `warehouseId` — futuro).
- Botón "Imprimir" → abre el PDF en pestaña nueva (`window.open` con `noopener,noreferrer`). El operador usa el diálogo de impresión nativo del browser para enviar a la térmica.

---

## Barcode CODE128 en la guía de despacho

Cuando se descarga el PDF de una guía de despacho activa (no anulada), el header ahora incluye un barcode CODE128 del **número de la guía** (ej. `DESP-2026-00042`), posicionado en la esquina superior derecha del bloque del título.

Caso de uso: el repartidor lleva la guía impresa; al volver al depósito, el encargado escanea el barcode con la pistola USB y abre la guía en pantalla para marcarla como entregada o anularla.

Implementación: `pdf.service.ts` llama a `renderBarcodePng(input.number, { height: 8, scale: 2 })` del helper compartido. Si la generación del barcode falla por alguna razón, el PDF se sigue armando sin él (best-effort, nunca rompe el download).

---

## Plan de tests end-to-end

### Pre-requisitos

```bash
./run.sh db:migrate   # nada nuevo en schema en esta fase
./run.sh db:seed
./run.sh dev          # levanta api + web
```

Datos de prueba mínimos en la DB (los crea el seed):
- Al menos 1 producto con `barcode` definido (ej. SKU `FIL-AC-001` con barcode `7891234567890`).
- Al menos 1 producto **sin** `barcode` (para verificar que el label cae al SKU).
- 1 cliente con dirección completa.
- 1 venta confirmada (para tener una guía de despacho a la cual generarle PDF).

### 1 · Lookup exacto vía API directo

Probar que el endpoint `/api/products/lookup` funciona en aislamiento, sin frontend.

```bash
# 1.1 — Match por SKU
curl -i http://localhost:4000/api/products/lookup?code=FIL-AC-001 \
  -H "Cookie: <tu-cookie-de-auth>"
# Esperado: 200, body con ProductDto (con category y brand joineados)

# 1.2 — Match por barcode
curl -i 'http://localhost:4000/api/products/lookup?code=7891234567890' \
  -H "Cookie: <tu-cookie-de-auth>"
# Esperado: 200, mismo producto si el barcode pertenece a FIL-AC-001

# 1.3 — Sin match
curl -i 'http://localhost:4000/api/products/lookup?code=NO_EXISTE_XYZ' \
  -H "Cookie: <tu-cookie-de-auth>"
# Esperado: 404, body con mensaje "Ningún producto coincide…"

# 1.4 — Sin código
curl -i 'http://localhost:4000/api/products/lookup' \
  -H "Cookie: <tu-cookie-de-auth>"
# Esperado: 400, body con "Query param `code` requerido"
```

### 2 · Etiqueta térmica desde la UI

1. Login → `/productos` → click en cualquier producto del listado.
2. En el header del detalle (junto a "Eliminar"), verificar el botón **"Imprimir etiqueta"** (con ícono `Printer`).
3. Click → debe abrir el dialog "Imprimir etiqueta" con:
   - Texto que menciona el nombre del producto.
   - Input "Cantidad de copias" en 1.
4. **Test cantidad = 1**: click "Imprimir etiqueta" → se abre una pestaña nueva con el PDF.
   - Verificar dimensiones del PDF: **50×30 mm** (en Acrobat, archivo → propiedades → tamaño de página debe decir `1.97 × 1.18 in` o `141.7 × 85 pts`).
   - **1 página única**.
   - Contenido: nombre arriba (2 líneas máx), barcode centrado, SKU debajo del barcode en monoespaciada, precio abajo a la izquierda.
5. **Test cantidad = 5**: cambiar el input a `5` → click "Imprimir 5 copias" → PDF con **5 páginas idénticas**.
6. **Test cantidad > 100**: tipear `999` → el input lo recorta a 100.
7. **Test producto sin barcode**: editar un producto y vaciar el campo `Codigo de barras` → guardar → imprimir etiqueta → verificar que el barcode del PDF contiene el **SKU** (no string vacío).
8. **Test barcode escaneable**: imprimir el PDF en una hoja A4. Con el celular u otro scanner, leer el barcode → debe arrojar exactamente el código del producto (`barcode` si está, si no el `SKU`).

### 3 · URL del label directo

Probar el endpoint en el browser sin pasar por el dialog:

```
http://localhost:4000/api/products/<UUID>/label                ← 1 copia
http://localhost:4000/api/products/<UUID>/label?qty=5           ← 5 copias
http://localhost:4000/api/products/<UUID>/label?qty=200         ← 400 (fuera de rango)
http://localhost:4000/api/products/<UUID>/label?qty=3&warehouseId=<warehouseUuid>  ← 3 copias con LOC en footer
```

Para el último caso, el producto debe tener `Stock.locationCode` definido en esa bodega (ver `/inventario` → seleccionar la bodega → click en la ubicación de la fila del producto y setearla).

### 4 · Scanner USB (input + ENTER)

Si tenés un lector USB:

1. Conectar → debe aparecer como teclado.
2. **En `/escanear`**: con el cursor en el input, disparar el láser sobre un código de barras de un producto cargado → el código se escribe en el input + ENTER automático → navega a `/productos/<id>`.
3. **En `/ventas/nueva` → ProductPicker**: abrir el modal "Agregar producto" → escanear con el USB → debe agregarlo y cerrar el picker directo (sin tener que clickear).
4. **En Cmd+K (QuickSearch)**: abrir Cmd+K → escanear → debe navegar al detalle.

Si NO tenés lector USB, podés simular: ingresar el código a mano + ENTER. Es exactamente lo mismo.

### 5 · Scanner cámara

**En desktop con webcam:**
1. Abrir `/escanear` → click "Abrir cámara".
2. El browser pide permiso → aceptar.
3. Aparece el modal con el video. Mostrar a la cámara una imagen de barcode (o el PDF de etiqueta impreso/abierto en pantalla).
4. Al detectar, aparece "Escaneado: XYZ" en verde y el modal cierra → navega al detalle.

**En mobile (Chrome o Safari del celular):**
1. Acceder al dashboard desde el celular (la app debe estar en red local o desplegada).
2. `/escanear` → "Abrir cámara".
3. Permiso → aceptar.
4. Debe usar la cámara **trasera** automáticamente (mejor para escanear).
5. Apuntar a un producto físico con código de barras → detección + navegación.

**Casos de error:**
- **Rechazar permiso**: dar "No permitir" cuando el browser pregunta → debe mostrar mensaje rojo claro + tip "habilitalo desde la barra del navegador".
- **Browser sin soporte**: probar en un browser muy viejo o con MediaDevices deshabilitado → mensaje "Tu navegador no soporta acceso a la cámara".
- **Código no reconocido**: escanear un código que no esté cargado en el sistema → toast amarillo "Sin match exacto" + el input queda con el código tipeado para que pueda buscar parcialmente.

### 6 · Barcode en guía de despacho

1. Ir a `/guias` → abrir una guía activa (no anulada).
2. Click "Imprimir" → seleccionar formato "Carta".
3. En el PDF generado, esquina superior derecha del título "Guía de despacho DESP-XXXX-XXXXX" debe verse un **barcode CODE128** con el número de la guía.
4. Verificar que sea escaneable: mostrar el PDF a la cámara o escanearlo impreso → debe arrojar exactamente el número de la guía.
5. Probar también con una guía **ANULADA**: el PDF debe mostrar "ANULADA" en rojo donde antes iría el barcode (los anulados no llevan barcode porque no se procesan).

### 7 · Regression — no se rompió nada

- `/productos` → buscar normalmente por nombre/SKU → el listado funciona igual que antes.
- Cmd+K → tipear sin escanear → muestra resultados LIKE como siempre.
- ProductPicker en `/ventas/nueva` → click "Agregar producto" → buscar por nombre → funciona.
- Guía de despacho ANULADA → PDF se ve igual (sin barcode, con sello "ANULADA").
- Cotización / venta PDFs → sin cambios visuales (no agregamos barcode ahí).

---

## Troubleshooting

### "Cannot find module bwip-js"

Asegurate de haber instalado las dependencias después del pull:

```bash
pnpm install
```

### "DOMException: Permission denied" en la cámara

El usuario rechazó el permiso. Solución:
- Chrome/Edge: click en el ícono de cámara/candado en la barra de URL → cambiar a "Permitir".
- Safari: Configuración → Sitios web → Cámara → permitir el dominio.

### La cámara se queda encendida después de cerrar el modal

No debería pasar — `CameraScanner` llama `stop()` en cleanup. Si pasa, hard refresh (Ctrl+Shift+R) libera el stream del browser.

### El barcode del PDF se ve "manchado" o no se puede escanear

Verificar que la impresora térmica esté usando 203 dpi o más. A 150 dpi el CODE128 de 50mm puede perder definición. Si el problema persiste, generar con `scale: 4` en `renderBarcodePng` (toca subir el config de `LabelService`).

### "No se pudo leer el código" intermitente con la cámara

- Asegurate de tener buena iluminación.
- Mantené el código a 15-25 cm de la cámara.
- Si el código está dañado/borroso, intentá con el lector USB.

---

## Pendientes / mejoras futuras

- **Lookup por `barcode` parcial**: hoy es EQUALS. Algunos scanners agregan un sufijo (terminador) que rompe el match. Si aparece el caso, agregar un trim de caracteres no imprimibles antes de la comparación.
- **Múltiples formatos de etiqueta**: hoy solo 50×30. Si el cliente pide A4 con grilla de 21 etiquetas (Avery 5160), agregar un endpoint `/products/labels.pdf?ids=…&format=avery5160` que tome N productos y los acomode en grilla.
- **Branding completo de PDFs**: agregar logo del cliente bien posicionado, paleta corporativa, footer con datos legales. Bloqueado hasta que el cliente entregue los assets.
- **Barcode en cotización y nota de venta**: hoy solo en guía de despacho. Si el cliente lo pide, agregar en los otros dos PDFs reusando el mismo helper.
- **Stock check al escanear**: en el ProductPicker, mostrar el stock disponible al lado del producto agregado para que el vendedor vea inmediatamente si hay para vender.
- **Logout de cámara guardada**: si el operador escanea seguido (varias ventas), mantener la cámara abierta entre operaciones sin volver a pedir permiso.
