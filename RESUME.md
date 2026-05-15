# RESUME — Ronda 6 + Fase 8 + Ronda 7

Documento de hand-off para QA. Cada bloque describe **qué cambió**, **archivos tocados**, **cómo testearlo paso a paso** y **respuestas esperadas** para validar que está OK.

Credenciales admin: `admin@inventory.local` / `admin123`.
Levantar: `./run.sh dev` (o `pnpm dev` desde la raíz).
URL local: API en `http://localhost:4000/api`, web en `http://localhost:3000`.

---

## Parte 0 — Ronda 7 · Stock en bodega equivocada + selector obligatorio en compras

Bugs reportados después de Fase 8: los ajustes de stock terminaban en "Mercado Libre Full" aunque el operador estuviera viendo "Principal", y el formulario de compra no permitía elegir la bodega destino. La causa raíz son dos: (1) el hook global `useCurrentWarehouse` seguía existiendo con estado en localStorage y se desincronizaba; (2) los defaults del backend ordenaban alfabéticamente sin preferir "Principal".

### 0A. Backend — fix de defaults + persistir bodega en compras

**Cambios**
- [apps/api/src/database/migrations/1779400000000-PurchaseWarehouseRound7.ts](apps/api/src/database/migrations/1779400000000-PurchaseWarehouseRound7.ts) — agrega `warehouseId` a `purchase_entries` (nullable, FK a `warehouses`) + backfill desde el primer movimiento `PURCHASE_IN` de cada entry.
- [apps/api/src/database/entities/purchase-entry.entity.ts](apps/api/src/database/entities/purchase-entry.entity.ts) — campo + relación `warehouse`.
- [apps/api/src/purchases/purchases.service.ts](apps/api/src/purchases/purchases.service.ts) — `create()` persiste `warehouseId`. `list()` y `getOne()` cargan la relación `warehouse`. `firstWarehouseId()` filtra activas y prefiere "Principal".
- [apps/api/src/inventory/inventory.service.ts](apps/api/src/inventory/inventory.service.ts) — `defaultWarehouseId()` ahora ordena `(name = 'Principal') DESC, name ASC` (antes era alfabético puro → ganaba "Mercado Libre Full").
- [apps/api/src/sales/sales.service.ts](apps/api/src/sales/sales.service.ts) — mismo fix en `defaultWarehouseId()`.
- [packages/shared/src/types.ts](packages/shared/src/types.ts) — `PurchaseEntryDto` ahora expone `warehouseId` y `warehouse: { id, name }`.

**Cómo aplicar la migración**
```bash
cd apps/api
pnpm migration:run
```
Verificar:
```sql
SHOW COLUMNS FROM purchase_entries LIKE 'warehouseId';
SELECT id, warehouseId FROM purchase_entries LIMIT 5;
```
Las compras existentes deberían tener su `warehouseId` backfilleado desde sus movimientos.

### 0B. Frontend — selector obligatorio + label en botón + hook global eliminado

**Cambios**
- Borrado: `apps/web/lib/use-current-warehouse.ts`. El hook global con localStorage desaparece — cada formulario maneja su propia bodega.
- [apps/web/app/(dashboard)/compras/nuevo/page.tsx](apps/web/app/(dashboard)/compras/nuevo/page.tsx) — selector "Bodega destino" **siempre visible** en el grid superior, obligatorio (bloquea submit), default "Principal" si activa. Botón primario muestra `Registrar compra en <bodega>`.
- [apps/web/components/adjust-stock-dialog.tsx](apps/web/components/adjust-stock-dialog.tsx) — ahora **recibe `warehouseId` y `warehouseName` como props** (no usa más default del backend ni hook global). El info box muestra "Bodega: <nombre>" y "Stock actual en esta bodega: N". Botón primario muestra `Ajustar stock en <bodega>`. El toast también lo cita.
- [apps/web/app/(dashboard)/inventario/page.tsx](apps/web/app/(dashboard)/inventario/page.tsx) — pasa al diálogo la bodega del filtro URL visible (`adjustTarget.warehouseId` + `currentWarehouse.name`). Si todavía no hay bodega seleccionada (caso patológico), el diálogo simplemente no se renderiza.
- [apps/web/components/forms/sale-form.tsx](apps/web/components/forms/sale-form.tsx) — botón primario muestra `Confirmar venta en <bodega>`.
- [apps/web/app/(dashboard)/compras/page.tsx](apps/web/app/(dashboard)/compras/page.tsx) — nueva columna "Bodega" en el listado mostrando `warehouse.name` (o "—" para filas históricas sin backfill).

### 0C. Cómo testear — Ajuste de stock

1. Asegurate de tener al menos 2 bodegas activas (`/almacenes`): por ejemplo "Principal" y "Mercado Libre Full".
2. Ir a `/inventario`. En el selector arriba, **elegir "Principal"**.
3. Click en el icono de ajuste de cualquier producto.

**Respuesta esperada**
- El diálogo muestra explícitamente: "Bodega: **Principal**" en el info box gris.
- "Stock actual en esta bodega: N" coincide con el valor de la tabla.
- Botón primario dice: **"Ajustar stock en Principal"**.
- Aumentar +5 unidades, motivo cualquiera, confirmar → toast "Stock ajustado en Principal".
- Volver a la tabla con "Principal" → el stock subió +5.
- Cambiar a "Mercado Libre Full" en el filtro → el stock de ese producto **NO** cambió ahí (sigue como estaba antes).

### 0D. Cómo testear — Compras

1. Ir a `/compras` → "Nueva entrada".
2. Mirar el grid superior.

**Respuesta esperada**
- Hay un campo **"Bodega destino"** siempre visible, junto a Proveedor / Fecha / Factura.
- Default = "Principal" si está activa, si no la primera activa.
- Si limpiás el selector (no se puede cuando es shadcn Select, pero conceptualmente), el botón "Registrar compra" queda deshabilitado.
- Elegir proveedor, agregar 1 item, dejar bodega = "Principal" → botón dice **"Registrar compra en Principal"**.
- Confirmar → toast "Compra registrada", redirige a `/compras`.
- En el listado de `/compras`: la compra recién creada aparece con la columna **"Bodega" = Principal**.
- Las compras viejas (anteriores a la migración) pueden mostrar "—" en la columna Bodega si el backfill no encontró movimientos. Eso es esperado.

### 0E. Checklist QA — Ronda 7

- [ ] Migración `1779400000000-PurchaseWarehouseRound7` aplicada.
- [ ] Compras existentes tienen `warehouseId` backfilleado (verificable por SQL).
- [ ] `/compras/nuevo` muestra "Bodega destino" obligatoria con default Principal.
- [ ] Botón "Registrar compra" lleva el nombre de la bodega.
- [ ] `/compras` (listado) tiene columna "Bodega".
- [ ] Ajustar stock desde `/inventario` lo hace en la bodega visible (no en otra).
- [ ] Botón "Ajustar stock en X" muestra el nombre de la bodega.
- [ ] Botón "Confirmar venta en X" muestra el nombre de la bodega (SaleForm).
- [ ] El archivo `apps/web/lib/use-current-warehouse.ts` no existe más.

---

## Parte 1 — Ronda 6 · Bugs de ventas

Bugfixes basados en feedback del cliente tras Ronda 5. Dos problemas: selector global en el sidebar que confundía contexto, y bloqueo al convertir cotización en venta por falta de stock sin opción de cambiar bodega.

### 1A. Quitar selector de bodega del header del sidebar

**Cambios**
- [components/sidebar.tsx](apps/web/components/sidebar.tsx): el header del sidebar pasa a mostrar **solo el nombre de la empresa** (de `CompanySettings.name`). Se eliminó el `<Select>` de bodega global y todos sus eventos.

**Por qué**
El selector global creaba estado oculto: el operador no veía con claridad contra qué bodega se evaluaba el stock en cada flujo. La bodega ahora es contextual a cada formulario (venta, compra, ajuste, cotización), no global.

**Cómo testear**
1. Login en `http://localhost:3000`.
2. Mirar el sidebar izquierdo.

**Respuesta esperada**
- El header del sidebar muestra el nombre de la empresa (por defecto seedeado o lo que esté en `/configuracion`).
- **No hay** selector ni texto "Almacén: X" en el header.

---

### 1B. Selector de bodega visible y explícito en el flujo venta

**Cambios**
- [components/forms/sale-form.tsx](apps/web/components/forms/sale-form.tsx): el selector de bodega se movió **fuera de los tabs**, al tope del modal, **siempre visible** (antes estaba escondido en el tab "Cliente y pago" y solo aparecía con 2+ bodegas activas).
- Default = **"Principal"** si está activa, si no la primera activa.
- Cambiar la bodega re-ejecuta el query de stock disponible (`getAvailableStock(productIds, warehouseId)`).
- Banner ámbar arriba del form cuando faltan items, indicando la bodega evaluada y cuántos productos no tienen stock. Las filas afectadas se pintan en rojo claro con su stock disponible visible.
- El botón "Confirmar venta" se deshabilita automáticamente cuando hay shortages (`stockShortages.length > 0`).
- El mismo formulario es usado por la venta directa (`/ventas/nueva`) y por la conversión cotización → venta vía [SaleFormDialog](apps/web/components/forms/sale-form-dialog.tsx).

**Cómo testear — venta directa**
1. Asegurate de tener al menos 2 bodegas activas (`/almacenes`).
2. Cargá stock en una sola de ellas para un producto (ej: 10 unidades en "Principal", 0 en otra).
3. Abrí "Nueva venta" desde el FAB o desde `/ventas/nueva`.

**Respuesta esperada — venta directa**
- El selector "Bodega de la venta" aparece arriba del modal, fuera de los tabs.
- Default = "Principal" si está activa.
- Si elegís un producto sin stock en la bodega seleccionada → banner ámbar "Stock insuficiente en `<bodega>`" + fila pintada + botón "Confirmar" deshabilitado.
- Cambiar a la otra bodega que sí tiene stock → el banner desaparece, las filas pierden el color rojo, el stock disponible se actualiza, el botón se habilita.

**Cómo testear — convertir cotización a venta**
1. Crear una cotización con un producto que tenga stock en una bodega y no en otra.
2. Desde la cotización, hacer click en "Convertir a venta".
3. En el modal de venta, mirar el selector arriba.

**Respuesta esperada — conversión**
- Modal abre con la cotización prellenada (cliente, items, notas).
- El selector de bodega está arriba, default "Principal" (o primera activa).
- Si esa bodega no tiene stock, banner ámbar + filas pintadas + botón "Confirmar" deshabilitado.
- Cambiar la bodega arriba refresca el stock disponible al toque y desbloquea la venta.

---

## Parte 2 — Fase 8 · Reportes y proyección de stock

Scope acordado: proyección + lista de críticos (CSV) + 3 reportes contables (ventas, IVA, flujo de caja) con export CSV.

### 2A. Backend

**Archivos nuevos**
- [apps/api/src/database/migrations/1779300000000-DefaultLeadTimePhase8.ts](apps/api/src/database/migrations/1779300000000-DefaultLeadTimePhase8.ts) — agrega `defaultLeadTimeDays` (int, default 75) a `company_settings`.
- [apps/api/src/projection/dto.ts](apps/api/src/projection/dto.ts) — `ProjectionQueryDto` con `leadTimeDays` opcional (override).
- [apps/api/src/projection/projection.service.ts](apps/api/src/projection/projection.service.ts) — cálculo de stock total, consumo diario, cobertura, fecha de quiebre, sugerencia de pedido y flag de crítico.
- [apps/api/src/projection/projection.controller.ts](apps/api/src/projection/projection.controller.ts) — `GET /projection` (JSON) y `GET /projection/export.csv`.
- [apps/api/src/projection/projection.module.ts](apps/api/src/projection/projection.module.ts) — módulo registrado en AppModule.
- [apps/api/src/reports/dto.ts](apps/api/src/reports/dto.ts) — `ReportDateRangeQueryDto`.
- [apps/api/src/reports/reports.service.ts](apps/api/src/reports/reports.service.ts) — agregaciones para ventas, IVA y flujo de caja.
- [apps/api/src/reports/reports.controller.ts](apps/api/src/reports/reports.controller.ts) — `GET /reports/{sales,iva,cash-flow}` (JSON) + variantes `.csv`.
- [apps/api/src/reports/reports.module.ts](apps/api/src/reports/reports.module.ts) — módulo registrado en AppModule.

**Archivos modificados**
- [apps/api/src/database/entities/company-settings.entity.ts](apps/api/src/database/entities/company-settings.entity.ts) — columna `defaultLeadTimeDays`.
- [apps/api/src/settings/dto.ts](apps/api/src/settings/dto.ts) — campo en `UpdateCompanySettingsDto`.
- [apps/api/src/app.module.ts](apps/api/src/app.module.ts) — registra `ProjectionModule` y `ReportsModule`.
- [packages/shared/src/types.ts](packages/shared/src/types.ts) — nuevos types (`ProjectionRowDto`, `ProjectionResponseDto`, `ReportSalesResponseDto`, `ReportIvaResponseDto`, `ReportCashFlowResponseDto` + filas). `CompanySettingsDto` ahora incluye `defaultLeadTimeDays`.

**Cálculos clave (proyección)**
- Ventana de consumo fija: 90 días.
- Stock total = suma de filas `Stock` en bodegas con `isActive = true`.
- Consumo diario = `|SUM(qty)|` de movimientos `SALE_OUT` en la ventana / 90.
- Cobertura (días) = `stockTotal / consumoDiario`. `null` si consumo = 0.
- Fecha de quiebre = hoy + cobertura.
- Crítico = `cobertura ≤ leadTime`.
- Sugerencia de pedido = `ceil(consumoDiario × (leadTime + 30) − stockTotal)`, mínimo 0.
- Productos inactivos están excluidos.

**Reportes — convención de canceladas**
- Reporte de ventas: las canceladas aparecen en la tabla con badge tachado pero **no suman** a los totales.
- Reporte de IVA: filtra ventas canceladas; las compras no tienen estado todavía.
- Reporte de flujo de caja: incluye las transacciones anuladas (`isVoided=true`) marcadas en la UI — el total ya cuadra porque al cancelar se crea automáticamente la compensación opuesta.

---

### 2B. Frontend

**Archivos nuevos**
- [apps/web/lib/reports-api.ts](apps/web/lib/reports-api.ts) — wrappers axios + builders de URL para CSV.
- [apps/web/app/(dashboard)/proyeccion/page.tsx](apps/web/app/(dashboard)/proyeccion/page.tsx) — pantalla principal de proyección.
- [apps/web/app/(dashboard)/reportes/ventas/page.tsx](apps/web/app/(dashboard)/reportes/ventas/page.tsx)
- [apps/web/app/(dashboard)/reportes/iva/page.tsx](apps/web/app/(dashboard)/reportes/iva/page.tsx)
- [apps/web/app/(dashboard)/reportes/flujo-caja/page.tsx](apps/web/app/(dashboard)/reportes/flujo-caja/page.tsx)

**Archivos modificados**
- [apps/web/components/sidebar.tsx](apps/web/components/sidebar.tsx) — nueva sección "Reportes" con sub-items: Proyección, Ventas, IVA, Flujo de caja.
- [apps/web/lib/cashbox-api.ts](apps/web/lib/cashbox-api.ts) — `UpdateCompanySettingsInput` incluye `defaultLeadTimeDays`.
- [apps/web/app/(dashboard)/configuracion/page.tsx](apps/web/app/(dashboard)/configuracion/page.tsx) — input "Lead time default (días)" en el form de impuestos y comisiones.

---

### 2C. Cómo aplicar la migración

Antes de testear cualquier cosa de Fase 8, hay que correr la migración nueva:

```bash
cd apps/api
pnpm migration:run
```

**Respuesta esperada**: log "Migration `DefaultLeadTimePhase8_1779300000000` has been executed successfully." Si ya estaba aplicada, dice "No migrations are pending."

Verificar en MySQL:
```sql
SELECT defaultLeadTimeDays FROM company_settings;
```
Debe devolver `75`.

---

### 2D. Lead time configurable en `/configuracion`

**Cómo testear**
1. Ir a `/configuracion`.
2. Mirar el form "Impuestos y comisiones".

**Respuesta esperada**
- Hay tres campos: IVA (%), Comisión tarjeta (%), **Lead time default (días)** = 75 por defecto.
- Cambiar el valor a 60, hacer click en "Guardar".
- Aparece toast "Configuración actualizada".
- Recargar la página: el valor se mantiene en 60.

---

### 2E. Pantalla `/proyeccion`

**Cómo testear**
1. Generar datos de prueba:
   - Crear 2-3 productos.
   - Cargar stock vía compra (10 unidades de cada uno).
   - Crear ventas (`SALE_OUT`) que descuenten stock — al menos 1 venta confirmada para cada producto, para tener "consumo" en la ventana de 90 días.
2. Navegar a `/proyeccion`.

**Respuesta esperada**
- El header muestra el lead time efectivo (default = `defaultLeadTimeDays` de settings) y la ventana de consumo (90 días).
- Por default se muestran **solo productos críticos**.
- Cada fila tiene: SKU, Producto, Stock (total agregado), Consumo/día, Cobertura (días), Quiebre estimado (fecha), Sugerencia pedido, Estado.
- Filas críticas en rojo claro con badge "Crítico".
- Productos sin ventas en la ventana aparecen con cobertura "∞" — NO se marcan críticos.
- Botón "Mostrar todos" alterna visualizar el catálogo completo proyectado.
- Cambiar el input "Lead time" + click "Aplicar" recalcula la lista contra el nuevo umbral sin tocar settings.
- Click en "Descargar lista de críticos" abre / descarga un CSV.

**Verificar el CSV**
- Se abre nativo en Excel sin problemas de encoding (acentos correctos).
- Columnas: SKU, Producto, Stock total, Consumo diario, Dias cobertura, Fecha quiebre, Sugerencia pedido, Critico.
- Filtros de la pantalla se respetan (si activaste "Mostrar todos", el CSV incluye todos; si no, solo críticos).
- Nombre archivo: `proyeccion-criticos-YYYY-MM-DD.csv`.

---

### 2F. Reporte `/reportes/ventas`

**Cómo testear**
1. Tener al menos 3-4 ventas: algunas pagadas, alguna cancelada.
2. Ir a `/reportes/ventas`.
3. Setear filtros de fecha "Desde" y "Hasta" para abarcar las ventas creadas.

**Respuesta esperada**
- 4 cards arriba: Ventas activas, Canceladas, IVA débito, Total facturado.
- Tabla detallada: N° venta, Fecha, Cliente, RUT, Pago, Estado, Subtotal, IVA, Total.
- Las **canceladas** aparecen tachadas (`line-through`) y con opacidad reducida.
- Fila de totales al final (solo cuando hay rows) — **suma solo activas**.
- Si las fechas filtran fuera de las ventas → "No hay ventas en el período".
- Click en "Descargar CSV" descarga `ventas-<desde>_<hasta>.csv` con todas las filas.

**Verificar el CSV**
- Columnas: Numero, Fecha, Cliente, RUT, Metodo pago, Estado, Subtotal, IVA, Total.
- Las canceladas también están en el CSV (con columna Estado = `CANCELLED`).

---

### 2G. Reporte `/reportes/iva`

**Cómo testear**
1. Tener al menos 1 venta no cancelada y 1 compra en el período.
2. Ir a `/reportes/iva`.

**Respuesta esperada**
- 4 cards arriba: IVA débito, IVA crédito, A pagar/A favor (resaltado en rojo si > 0, en verde si < 0), Documentos (`N v / M c`).
- Tab "Ventas" — tabla con cada venta (N°, fecha, cliente, RUT, subtotal, IVA, total).
- Tab "Compras" — tabla con cada compra (fecha, proveedor, RUT, subtotal, IVA, total).
- Click en "Descargar CSV" descarga `iva-<desde>_<hasta>.csv` con ambas secciones combinadas (columna "Tipo" = VENTA o COMPRA).

**Verificación numérica**
- `A pagar = debit − credit`. Verificá que la card lo refleje (signo correcto).
- Si solo hay ventas: A pagar = IVA débito.
- Si solo hay compras: A favor = IVA crédito.

---

### 2H. Reporte `/reportes/flujo-caja`

**Cómo testear**
1. Tener movimientos de caja en el período: al menos 1 venta (income), 1 compra (expense), 1 gasto manual.
2. Ir a `/reportes/flujo-caja`.

**Respuesta esperada**
- 3 cards arriba: Total ingresos (verde), Total egresos (rojo), Saldo neto (verde si ≥ 0, rojo si < 0).
- Tabla: Fecha, Tipo (Ingreso/Egreso badge), Origen (Venta/Compra/Manual/Devolución), Método, Descripción, Monto (con signo + o − y color).
- Transacciones anuladas aparecen tachadas con label "(anulada)" pero suman al total junto con su compensación (que también está en la lista).
- Click en "Descargar CSV" descarga `flujo-caja-<desde>_<hasta>.csv`.

---

### 2I. Verificación end-to-end

Caja de verificación final (checklist QA):

- [ ] Migración `1779300000000-DefaultLeadTimePhase8` aplicada sin errores.
- [ ] `/configuracion` muestra y persiste `defaultLeadTimeDays`.
- [ ] Sidebar tiene sección "Reportes" con 4 sub-items.
- [ ] `/proyeccion` lista productos críticos con todas las columnas.
- [ ] Botón "Descargar lista de críticos" abre un CSV válido en Excel.
- [ ] `/reportes/ventas` muestra detalle, totales correctos (sin canceladas), CSV exportable.
- [ ] `/reportes/iva` muestra débito/crédito/balance y detalle por documento.
- [ ] `/reportes/flujo-caja` muestra ingresos/egresos por período, CSV exportable.
- [ ] Bug Ronda 6: el selector de bodega ya no está en el sidebar.
- [ ] Bug Ronda 6: en la conversión cotización → venta se puede elegir la bodega y la validación de stock se actualiza al cambiarla.

---

## Lo que NO entra en esta entrega

Quedan para una fase 8.1 / posterior:
- 8 reportes restantes del PLAN (estado de resultados, rentabilidad, sin rotación, etc.).
- Export a Excel (`.xlsx`) — por ahora solo CSV.
- Export a PDF de los reportes.
- Filtros adicionales en flujo de caja (por origen, por método de pago).
- Drilldown agrupado por día/mes en ventas.
