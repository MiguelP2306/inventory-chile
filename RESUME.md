# RESUME — Fase 8.5 (Lead lifecycle + HubSpot)

Documento de hand-off para QA. Cada bloque describe **qué cambió**, **archivos tocados**, **cómo testearlo paso a paso** y **respuestas esperadas** para validar que está OK.

Credenciales admin: `admin@inventory.local` / `admin123`.
Levantar: `./run.sh dev` (o `pnpm dev` desde la raíz).
URL local: API en `http://localhost:4000/api`, web en `http://localhost:3000`.

---

## Fase 8.5 — Lead lifecycle + Seguimiento comercial + HubSpot push

Formaliza el flujo comercial real: la mayoría de las ventas arrancan por WhatsApp y necesitan seguimiento. El sistema lleva la **fuente de verdad** del estado del lead y empuja cambios a HubSpot vía outbox. La operación diaria de seguimiento vive en una bandeja dedicada con botones rápidos.

**Decisiones tomadas con el cliente** (ver historial de Q&A):
- Lifecycle vive en `Customer` (extensión), no en entidad `Lead` separada.
- Hooks corren dentro de la MISMA transacción del create de cotización/venta.
- Queue para HubSpot = tabla `hubspot_sync_jobs` (outbox) + cron interno cada 1 min (sin Redis).
- HubSpot apagado por default — la integración está implementada pero el push real es un stub hasta que el cliente confirme su API key.
- `whatsappPhone` separado de `phone`. Fallback automático a `phone` si vacío.
- Backfill calculado: ventas previas → WON, cot abiertas → QUOTED, resto → NEW.
- Cron diario a las 00:30 hora `America/Santiago`.
- Plantilla WhatsApp nueva (`whatsappFollowUpTemplate` en CompanySettings) con tokens.
- Cotizaciones con cliente libre NO mueven lifecycle.
- Sidebar: `/seguimiento` en Operación, entre Cotizaciones y Ventas.
- Acciones por fila en bandeja: WhatsApp + Marcar contacto + Ver cotizaciones + Marcar perdido (las 4).
- Form de cliente: `source` + `whatsappPhone` editables al crear/editar.
- Configuración: sección nueva "Seguimiento y HubSpot".

---

### 1. Schema (migración)

[apps/api/src/database/migrations/1779500000000-LeadLifecycleAndHubSpotPhase85.ts](apps/api/src/database/migrations/1779500000000-LeadLifecycleAndHubSpotPhase85.ts):

- Extiende `customers`: `source` (enum WHATSAPP/EMAIL/PHONE/IN_PERSON/OTHER, default OTHER), `whatsappPhone` (E.164), `lifecycleStatus` (enum NEW/QUOTED/FOLLOW_UP/WON/LOST, default NEW), `lastContactAt`, `nextFollowUpAt`, `lostReason`, `hubspotContactId`. Más índices sobre `lifecycleStatus`, `nextFollowUpAt` y `whatsappPhone`.
- Crea tabla `lead_events` (id, customerId FK CASCADE, type enum 6 valores, refType/refId opcionales, occurredAt, userId FK SET NULL). Indexada por customer y por fecha.
- Crea tabla `hubspot_sync_jobs` (outbox: id, customerId FK CASCADE, status enum PENDING/PROCESSING/DONE/FAILED/SKIPPED, attempts, lastError, scheduledAt, processedAt, createdAt). Índice compuesto sobre `(status, scheduledAt)`.
- Extiende `company_settings`: `followUpHoursDefault` (int, default 48), `hubspotEnabled` (boolean, default false), `hubspotDefaultOwnerId` (varchar 64 nullable), `whatsappFollowUpTemplate` (text nullable) con texto default sembrado.
- **Backfill** del lifecycle: clientes con al menos 1 venta no cancelada → `WON`; con cotizaciones DRAFT/SENT/APPROVED → `QUOTED` con `lastContactAt` desde la cot más reciente; resto → `NEW`.

**Cómo aplicar la migración**
```bash
cd apps/api
pnpm migration:run
```

**Verificar en MySQL**
```sql
SELECT lifecycleStatus, COUNT(*) FROM customers GROUP BY lifecycleStatus;
SHOW COLUMNS FROM customers LIKE 'whatsappPhone';
SHOW COLUMNS FROM company_settings LIKE 'whatsappFollowUpTemplate';
SELECT COUNT(*) FROM lead_events;
SELECT COUNT(*) FROM hubspot_sync_jobs;
```
Las dos tablas nuevas existen vacías. Customers tienen sus lifecycle correctamente backfilleados.

---

### 2. Backend — Lifecycle automático

Archivos nuevos:
- [apps/api/src/database/entities/lead-event.entity.ts](apps/api/src/database/entities/lead-event.entity.ts)
- [apps/api/src/database/entities/hubspot-sync-job.entity.ts](apps/api/src/database/entities/hubspot-sync-job.entity.ts)
- [apps/api/src/lifecycle/dto.ts](apps/api/src/lifecycle/dto.ts)
- [apps/api/src/lifecycle/lifecycle.service.ts](apps/api/src/lifecycle/lifecycle.service.ts) — único punto de mutación del lifecycle. Hooks expuestos:
  - `applyQuotationCreated(manager, customerId, quotationId, userId)` — invocado por `QuotationsService.create()` dentro de la MISMA transacción. Setea `QUOTED`, `lastContactAt = NOW()`, `nextFollowUpAt = NOW() + followUpHoursDefault`. Inserta `LeadEvent(QUOTATION_CREATED)` + job en outbox. No-op si cliente libre.
  - `applyQuotationSent(...)` — reagenda follow-up tras envío real. Insertado en `QuotationsService.markSent()`.
  - `applySaleConfirmed(...)` — invocado por `SalesService.create()` dentro de su transacción. Setea `WON`, limpia `nextFollowUpAt` y `lostReason`, inserta `LeadEvent(SALE_CONFIRMED)`.
  - `touch(customerId, userId)` — endpoint manual. Refresca timestamps. Si estaba en FOLLOW_UP o NEW vuelve a QUOTED.
  - `markLost(customerId, reason, userId)` — endpoint manual. Único cambio manual de estado.
  - `markOverdueAsFollowUp()` — usado por el cron diario. Mueve QUOTED vencidos a FOLLOW_UP.
  - `list(query)` — bandeja con 4 tabs y filtros.
- [apps/api/src/lifecycle/lifecycle-cron.service.ts](apps/api/src/lifecycle/lifecycle-cron.service.ts) — cron diario `@Cron('30 0 * * *', { timeZone: 'America/Santiago' })`.
- [apps/api/src/lifecycle/lifecycle.controller.ts](apps/api/src/lifecycle/lifecycle.controller.ts) — endpoints:
  - `GET /follow-ups?tab=pendientes|sin-respuesta|vencidos|ultimo-contacto&q=&page=&pageSize=`
  - `POST /customers/:id/touch`
  - `POST /customers/:id/mark-lost` (motivo ≥ 5 chars)
- [apps/api/src/lifecycle/lifecycle.module.ts](apps/api/src/lifecycle/lifecycle.module.ts)

Archivos modificados:
- [apps/api/src/database/entities/customer.entity.ts](apps/api/src/database/entities/customer.entity.ts) — campos de lifecycle.
- [apps/api/src/database/entities/company-settings.entity.ts](apps/api/src/database/entities/company-settings.entity.ts) — campos de seguimiento + HubSpot.
- [apps/api/src/database/entities/index.ts](apps/api/src/database/entities/index.ts) — exporta las 2 entidades nuevas.
- [apps/api/src/customers/dto.ts](apps/api/src/customers/dto.ts) — `source` y `whatsappPhone` opcionales en create/update.
- [apps/api/src/customers/customers.service.ts](apps/api/src/customers/customers.service.ts) — propaga campos nuevos.
- [apps/api/src/settings/dto.ts](apps/api/src/settings/dto.ts) — 4 campos nuevos del settings.
- [apps/api/src/quotations/quotations.service.ts](apps/api/src/quotations/quotations.service.ts) — inyecta `LifecycleService`, hook en `create()` y `markSent()`. `toDto()` ahora incluye los campos de lifecycle del customer.
- [apps/api/src/quotations/quotations.module.ts](apps/api/src/quotations/quotations.module.ts) — importa `LifecycleModule`.
- [apps/api/src/sales/sales.service.ts](apps/api/src/sales/sales.service.ts) — inyecta `LifecycleService`, hook en `create()` después de marcar la cotización CONVERTED. `toDto()` ahora incluye los campos de lifecycle del customer.
- [apps/api/src/sales/sales.module.ts](apps/api/src/sales/sales.module.ts) — importa `LifecycleModule`.
- [apps/api/src/app.module.ts](apps/api/src/app.module.ts) — registra `LifecycleModule` + `HubspotModule`.
- [packages/shared/src/enums.ts](packages/shared/src/enums.ts) — 4 enums nuevos: `CustomerSource`, `LifecycleStatus`, `LeadEventType`, `HubspotSyncJobStatus`.
- [packages/shared/src/types.ts](packages/shared/src/types.ts) — `CustomerDto` extendido + DTOs nuevos (`FollowUpRowDto`, `FollowUpListDto`, `LeadEventDto`, `MarkLostInput`, `HubspotTestResultDto`, etc.). `CompanySettingsDto` ahora incluye los 4 campos de Fase 8.5.

---

### 3. Backend — HubSpot (preparado pero apagado)

Archivos nuevos en [apps/api/src/hubspot/](apps/api/src/hubspot/):
- `hubspot.service.ts` — patrón outbox. Cada cambio en lifecycle inserta `hubspot_sync_jobs(status=PENDING)`.
- `hubspot-cron.service.ts` — `@Cron(EVERY_MINUTE)` drena hasta 25 jobs por tick.
- `hubspot.controller.ts` — `POST /hubspot/test` para el botón "Test sync" de configuración.
- `hubspot.module.ts`.

Diseño:
- Si `hubspotEnabled=false` o `HUBSPOT_API_KEY` falta → los jobs se marcan SKIPPED silenciosamente sin tocar la API.
- Si está activo: el método `pushToHubspot()` es un **stub** que devuelve un id sintético. Marcado como TODO con comentarios explicando exactamente el código a poner cuando se instale `@hubspot/api-client`. El mapping (`firstname`/`lastname` por split, `phone` = whatsappPhone fallback phone, `email`, propiedad custom `inventory_lifecycle_status`) ya está armado y testeable por unidad.
- Retry: hasta 3 intentos con backoff exponencial (5 min × 5^attempt). Después marca FAILED.
- Idempotente: el worker lee el estado actual del cliente, no del payload del job. Múltiples jobs del mismo cliente convergen al mismo resultado.

---

### 4. Frontend — Bandeja, formularios, configuración

Archivos nuevos:
- [apps/web/lib/lifecycle-api.ts](apps/web/lib/lifecycle-api.ts) — wrappers axios + helper `buildWhatsappUrl()` + `applyWhatsappTokens()`.
- [apps/web/components/lifecycle-badge.tsx](apps/web/components/lifecycle-badge.tsx) — badge con paleta por estado (NEW/QUOTED slate/blue, FOLLOW_UP amber, WON emerald, LOST destructive).
- [apps/web/components/mark-lost-dialog.tsx](apps/web/components/mark-lost-dialog.tsx) — diálogo reutilizable entre bandeja y detalle de cliente.
- [apps/web/app/(dashboard)/seguimiento/page.tsx](apps/web/app/(dashboard)/seguimiento/page.tsx) — bandeja con 4 tabs + búsqueda + paginación. Cada fila tiene 4 acciones rápidas: WhatsApp (con plantilla resolvida), Marcar contacto (✓), Ver cotizaciones (link a `/cotizaciones?customer=<id>`), Marcar perdido (×).

Archivos modificados:
- [apps/web/components/sidebar.tsx](apps/web/components/sidebar.tsx) — nueva entrada "Seguimiento" en sección Operación, entre Cotizaciones y Ventas.
- [apps/web/lib/customers-api.ts](apps/web/lib/customers-api.ts) — `CustomerInput` con `source` + `whatsappPhone`.
- [apps/web/lib/cashbox-api.ts](apps/web/lib/cashbox-api.ts) — `UpdateCompanySettingsInput` con los 4 campos nuevos.
- [apps/web/components/forms/customer-form.tsx](apps/web/components/forms/customer-form.tsx) — agregados campos `source` (select 5 opciones) + `whatsappPhone` (validado E.164). Header muestra `LifecycleBadge` + "Último contacto: X" + motivo si LOST. Botón "Marcar perdido" visible cuando estado ∈ {NEW, QUOTED, FOLLOW_UP}.
- [apps/web/app/(dashboard)/configuracion/page.tsx](apps/web/app/(dashboard)/configuracion/page.tsx) — nueva sección "Seguimiento y HubSpot" con horas para follow-up, plantilla WhatsApp con tokens, toggle hubspotEnabled, owner ID, y botón Test sync.

---

### 5. Cómo testear — Lifecycle automático

**Crear cliente nuevo**
1. Ir a `/clientes/nuevo`. Llenar nombre, RUT, **WhatsApp** (ej: `+56 9 1234 5678`), **Canal de origen** (ej: WhatsApp). Guardar.
2. Volver al detalle del cliente.

**Respuesta esperada**
- El header muestra el badge **"Nuevo"** (NEW).
- "Último contacto" no aparece (todavía no hubo contacto).
- En `/seguimiento` ningún tab lo muestra (NEW no entra a las bandejas).

**Crear cotización para el cliente**
1. Ir a `/cotizaciones/nueva`, elegir el cliente del catálogo, agregar al menos 1 ítem, guardar.

**Respuesta esperada**
- Volver al detalle del cliente: badge ahora muestra **"Cotizado"** (QUOTED).
- "Último contacto" muestra la fecha actual.
- En `/seguimiento` tab **"Pendientes"**: el cliente aparece con su cotización en la columna correspondiente y `nextFollowUpAt = NOW + 48h`.

**Simular vencimiento del follow-up**
1. Forzar el vencimiento manualmente vía SQL (sin esperar 48h):
   ```sql
   UPDATE customers SET nextFollowUpAt = NOW() - INTERVAL 1 DAY WHERE id = '<customer-id>';
   ```
2. Ejecutar el cron a mano vía endpoint REST o con un script de prueba que llame `LifecycleService.markOverdueAsFollowUp()`. Alternativa: esperar las 00:30 hora Chile.

**Respuesta esperada**
- El cliente se mueve a `lifecycleStatus = FOLLOW_UP`.
- Aparece en `/seguimiento` tab **"Vencidos"**, NO en "Pendientes".
- Se inserta `LeadEvent(FOLLOW_UP_TRIGGERED)`.
- Se inserta `HubspotSyncJob(status=PENDING)`.

**Marcar contacto manual**
1. En `/seguimiento` tab "Vencidos", click en el botón ✓ "Marcar contacto" de la fila.

**Respuesta esperada**
- Toast "Contacto registrado".
- Cliente vuelve a `lifecycleStatus = QUOTED`, sale de "Vencidos", vuelve a "Pendientes".
- `lastContactAt` actualizado a NOW, `nextFollowUpAt = NOW + 48h`.

**Convertir cotización a venta**
1. Abrir la cotización del cliente y convertirla a venta. Confirmar la venta.

**Respuesta esperada**
- Cliente pasa a `WON`, sale de las bandejas filtradas (QUOTED/FOLLOW_UP).
- `nextFollowUpAt = NULL` (el embudo se cierra).
- Detalle del cliente muestra badge "Ganado".
- Se inserta `LeadEvent(SALE_CONFIRMED, refType='sale', refId=<sale-id>)`.

---

### 6. Cómo testear — Marcar perdido

1. En `/seguimiento` (o en `/clientes/<id>` cuando el lifecycle esté en QUOTED/FOLLOW_UP/NEW), click en la X roja "Marcar perdido".
2. Ingresar motivo (mínimo 5 caracteres).

**Respuesta esperada**
- Toast "Cliente marcado como perdido".
- Cliente sale de la bandeja.
- En detalle: badge "Perdido" + motivo visible debajo del título.
- Se inserta `LeadEvent(LOST_MARKED)`.
- Si después confirma una venta, vuelve a WON automáticamente y se limpia `lostReason`.

---

### 7. Cómo testear — WhatsApp con plantilla

1. En `/configuracion` → sección "Seguimiento y HubSpot" → editar la plantilla a `Hola {cliente}, te recuerdo la cotización {cotizacion} por {total}. Link: {link}`. Guardar.
2. Volver a `/seguimiento` y click en el botón verde de WhatsApp de cualquier fila con cotización abierta.

**Respuesta esperada**
- Abre `wa.me/<E164-sin-+>?text=<mensaje-con-tokens-reemplazados>` en pestaña nueva.
- Los tokens se reemplazan: `{cliente}` con nombre, `{cotizacion}` con número, `{total}` con monto formateado en CLP, `{link}` con URL pública.
- Si el cliente no tiene WhatsApp ni teléfono, el botón aparece deshabilitado con tooltip explicativo.

---

### 8. Cómo testear — HubSpot off-by-default

1. En `/configuracion` → "Seguimiento y HubSpot" → confirmar que **toggle "Activar sincronización con HubSpot" está apagado** (default tras la migración).
2. Crear una cotización para un cliente. Esperar 1 minuto a que corra el cron interno.

**Verificar en DB**
```sql
SELECT id, status, attempts, lastError, processedAt FROM hubspot_sync_jobs ORDER BY createdAt DESC LIMIT 5;
```

**Respuesta esperada — HubSpot off**
- Filas tienen `status = SKIPPED` después del cron.
- `attempts = 0` (no se intentó llamar a HubSpot).
- `Customer.hubspotContactId` sigue null.

**Activar el toggle**
1. Prender el toggle, guardar. Click en "Test sync".

**Respuesta esperada — HubSpot on sin API key**
- Mensaje rojo: "Falta HUBSPOT_API_KEY en variables de entorno..."

**Setear API key dummy**
1. En `apps/api/.env.local`, agregar `HUBSPOT_API_KEY=test-key-de-prueba-123456789`. Reiniciar el server.
2. Click en "Test sync" de nuevo.

**Respuesta esperada — HubSpot on con API key dummy**
- Mensaje verde: "Configuración válida. La llamada real a HubSpot está pendiente de activar (instalar @hubspot/api-client)."
- Nuevos jobs `hubspot_sync_jobs` pasan a `status = DONE` con un `hubspotContactId` sintético `hs-stub-XXXXXXXX` (stub determinístico).

---

### 9. Checklist QA — Fase 8.5

- [ ] Migración `1779500000000-LeadLifecycleAndHubSpotPhase85` aplicada sin errores.
- [ ] Backfill: clientes con ventas previas tienen `lifecycleStatus = WON`; con cotizaciones abiertas tienen `QUOTED` + `lastContactAt`.
- [ ] `/clientes/nuevo` muestra campos "WhatsApp (opcional)" y "Canal de origen".
- [ ] Crear cotización mueve al cliente a QUOTED y aparece en `/seguimiento` "Pendientes".
- [ ] Confirmar venta mueve al cliente a WON y lo saca de la bandeja.
- [ ] Botón WhatsApp arma URL con plantilla resolvida (tokens reemplazados).
- [ ] Botón ✓ marca contacto (toast OK + cliente vuelve a QUOTED si estaba en FOLLOW_UP).
- [ ] Botón × abre dialog "Marcar perdido" con motivo obligatorio (min 5 chars).
- [ ] Detalle del cliente muestra `LifecycleBadge` + "Último contacto: X".
- [ ] `/configuracion` permite editar follow-up hours, plantilla WhatsApp, toggle HubSpot, owner ID.
- [ ] Test sync con HubSpot off → mensaje "deshabilitado".
- [ ] Test sync con HubSpot on sin API key → mensaje "Falta API key".
- [ ] Sidebar tiene entrada "Seguimiento" entre Cotizaciones y Ventas.
- [ ] Outbox `hubspot_sync_jobs` se llena cada vez que cambia lifecycle.
- [ ] Cron diario a las 00:30 Santiago marca los QUOTED vencidos como FOLLOW_UP.
- [ ] Tab "Sin respuesta" lista clientes QUOTED con `lastContactAt < NOW - 24h`.

---

### 10. Limitaciones / TODO post-fase

- La llamada real a HubSpot está stubbeada. Cuando el cliente confirme su API key + setup en HubSpot, instalar `@hubspot/api-client` y reemplazar el cuerpo de `HubspotService.pushToHubspot()` y `testSync()` con llamadas reales — el resto de la maquinaria (outbox, retries, mapping, toggle) ya funciona.
- El cliente de HubSpot debe crear manualmente la propiedad custom `inventory_lifecycle_status` (tipo enumeration con valores NEW/QUOTED/FOLLOW_UP/WON/LOST) antes de prender el toggle.
- Tab "Sin respuesta" usa 24h hardcoded. Si más adelante el cliente quiere ajustarlo, agregar `unansweredHours` a `CompanySettings`.
- Cotizaciones con cliente libre (sin `customerId`) NO mueven lifecycle. Si el operador quiere hacerle seguimiento, primero usa "Registrar cliente desde snapshot" y recién entonces el cliente entra al embudo.
