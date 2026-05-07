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
| 4B | Catálogo extendido: códigos múltiples, foto del producto, ORIGINAL/ALTERNATIVO | pendiente |
| 5 | Caja, gastos, IVA, comisiones por tarjeta + factura adjunta en compras | pendiente |
| 6 | Cotizaciones + modal venta/cotización + impresión 80mm/carta + WhatsApp/email | pendiente |
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
- Todo nuevo `remove()` que pueda violar FK debe envolverse con `rethrowFkAsConflict`.
- Toda visualización de monto debe pasar por `formatCurrency`.
- Todo nuevo listado que pueda crecer debe paginar.
- Toda nueva lista paginada en backend debe respetar la convención: `page`/`pageSize` opcionales — sin ellos el endpoint devuelve array completo para alimentar selectores.
- Todo campo RUT (cliente o proveedor) debe usar el decorador `@IsValidRut()` y normalizarse vía `normalizeRut()` antes de persistir.
- Todo campo de teléfono debe usar `@IsValidPhone()` y normalizarse a E.164 vía `normalizePhone()`.

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

---

## Próximas fases

Cada fase es un PR independiente con verificación end-to-end al cierre. Ver [PLAN.md](PLAN.md#plan-de-implementación-por-fases) para el detalle.

**Fase 4B (siguiente):** Catálogo extendido — tabla `product_codes` (interno, universal, fabricante, compatibles, alternativos), foto del producto (upload con `multer`), distinción ORIGINAL/ALTERNATIVO.

**Fase 5:** Caja, gastos, IVA y comisiones — categorías predefinidas (IVA Compra, IVA Venta, Comisión Tarjeta), campos `subtotal`/`taxAmount`/`commissionAmount` en ventas y compras, auto-registro de comisión al cobrar con tarjeta, factura adjunta en compras.

**Fase 6:** Cotizaciones + modal "venta o cotización" + impresión 80mm/carta + WhatsApp/email.

**Fase 7:** Ventas con caja integrada, selector de bodega, comisión tarjeta automática, impresión 80mm/carta.

**Fases 7.5 / 7.6 / 7.7:** Multi-bodega + transferencias (flujo Mercado Libre Full); Devoluciones (suman stock) y Garantías (no afectan stock); Guía de despacho con número correlativo.

**Fase 8:** Reportes + **Proyección de stock** con lista de productos críticos exportable a CSV/Excel (importante por el lead time de 2-3 meses de las importaciones del cliente).

---

## Soporte

Si te trabás con algo y este README no lo cubre, agregalo acá cuando lo resuelvas. La idea es que un dev nuevo pueda llegar a `./run.sh dev` y hacer login en menos de 15 minutos sin preguntar nada.
