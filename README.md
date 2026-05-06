# Sistema de Gestión de Inventario

Monorepo con backend NestJS y frontend Next.js para una empresa importadora y comercializadora de **repuestos automotrices**. Cubre catálogo con compatibilidad vehicular, inventario en tiempo real, cotizaciones (con envío por WhatsApp/email), ventas, caja consolidada, gastos y reportes.

El plan completo de implementación por fases está en [PLAN.md](PLAN.md).

---

## Estado actual

| Fase | Descripción | Estado |
| --- | --- | --- |
| 0 | Bootstrap monorepo (pnpm, Next.js, NestJS, MySQL local) | ✅ |
| 1 | Base de datos (21 entidades, migración inicial, seeds) + auth JWT con cookies httpOnly | ✅ |
| 2 | Catálogo de productos + compatibilidad vehicular | ⏳ siguiente |
| 3 | Inventario (entradas, salidas, ajustes) | pendiente |
| 4 | Clientes y proveedores | pendiente |
| 5 | Caja y gastos | pendiente |
| 6 | Cotizaciones + envío WhatsApp/email | pendiente |
| 7 | Ventas con caja integrada | pendiente |
| 8 | Reportes + exportación CSV/PDF | pendiente |
| 9 | Dashboard (KPIs + alertas + gráficos) | pendiente |
| 10 | Carga masiva Excel | pendiente |
| 11 | Códigos de barras + etiquetas | pendiente |
| 12 | Deploy (Railway + Vercel + Resend) | pendiente |
| 13 | Integración HubSpot (alcance a confirmar) | pendiente |
| 14 | Manual + video + soporte post-entrega | pendiente |

---

## Stack

- **Frontend** ([apps/web](apps/web/)): Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Hook Form + Zod
- **Backend** ([apps/api](apps/api/)): NestJS 10 + TypeScript + TypeORM 0.3 + MySQL 8 + Passport JWT + bcrypt
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

## Datos por defecto (seed)

El seed es **idempotente** — corré `pnpm --filter @inventory/api db:seed` cuantas veces quieras, no duplica nada.

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

### Otros (vía pnpm directamente)

| Comando | Qué hace |
| --- | --- |
| `pnpm typecheck` | Type-check de todos los paquetes |
| `pnpm lint` | Lint de todos los paquetes |
| `pnpm format` | Prettier sobre todo el repo |
| `pnpm --filter @inventory/shared dev` | tsc --watch del paquete shared (si vas a modificar enums seguido) |

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
│   │   │   ├── auth/                     # módulo de autenticación
│   │   │   │   ├── auth.controller.ts    # /auth/login, /refresh, /logout, /me
│   │   │   │   ├── auth.service.ts       # bcrypt + sign JWT
│   │   │   │   ├── auth.module.ts        # registra JwtAuthGuard como APP_GUARD
│   │   │   │   ├── decorators/
│   │   │   │   │   ├── public.decorator.ts       # @Public() para rutas sin auth
│   │   │   │   │   └── current-user.decorator.ts # @CurrentUser() inyecta JwtPayload
│   │   │   │   ├── guards/               # JwtAuthGuard (global), JwtRefreshGuard
│   │   │   │   ├── strategies/           # JwtStrategy (cookie/header), JwtRefreshStrategy
│   │   │   │   ├── dto/login.dto.ts
│   │   │   │   └── types.ts              # JwtPayload, RefreshJwtPayload
│   │   │   ├── database/
│   │   │   │   ├── data-source.ts        # DataSource compartido (CLI + runtime)
│   │   │   │   ├── entities/             # 21 entidades + index.ts (barrel)
│   │   │   │   ├── migrations/           # SQL versionado (no editar a mano)
│   │   │   │   └── seeds/run-seeds.ts    # admin, almacén, categorías, settings
│   │   │   ├── app.module.ts             # ConfigModule + TypeOrm + Auth
│   │   │   ├── health.controller.ts      # GET /api/health (público)
│   │   │   └── main.ts                   # bootstrap, cookie-parser, CORS, ValidationPipe
│   │   ├── .env.example                  # vars de la api (PORT, DB_*, JWT_*, RESEND_*)
│   │   ├── nest-cli.json                 # deleteOutDir: false (ver Troubleshooting)
│   │   └── package.json
│   │
│   └── web/                              # Next.js 15 App Router
│       ├── app/
│       │   ├── (auth)/                   # grupo público
│       │   │   ├── layout.tsx            # centrado en card sobre fondo muted
│       │   │   └── login/page.tsx        # form RHF + Zod
│       │   ├── (dashboard)/              # grupo protegido
│       │   │   ├── layout.tsx            # llama getCurrentUser → redirect /login si null
│       │   │   └── page.tsx              # dashboard placeholder
│       │   ├── globals.css               # tokens shadcn + paleta semáforo (stock-ok/low/out)
│       │   └── layout.tsx                # root layout con QueryClientProvider
│       ├── components/
│       │   ├── ui/                       # shadcn: Button, Input, Label, Card
│       │   ├── providers.tsx             # QueryClient (staleTime 30s)
│       │   └── logout-button.tsx
│       ├── lib/
│       │   ├── api.ts                    # axios + interceptor refresh (browser)
│       │   ├── server-api.ts             # fetch + cookies forwarded (Server Components)
│       │   └── utils.ts                  # cn() helper
│       ├── components.json               # config shadcn
│       ├── tailwind.config.ts            # tokens semáforo, container, etc.
│       └── .env.example                  # NEXT_PUBLIC_API_URL
│
├── packages/
│   └── shared/                           # ⚠️ debe estar buildeado para que la api lo use
│       ├── src/
│       │   ├── enums.ts                  # InventoryMovementType, QuotationStatus, etc.
│       │   └── index.ts
│       └── package.json                  # main → dist/index.js (CommonJS)
│
├── scripts/
│   └── init-db.sql                       # crea DB + usuario inventory en MySQL local
├── run.sh                                # helper: build/dev/stop/status/db:init
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

21 entidades agrupadas por dominio (ver [PLAN.md](PLAN.md#modelo-de-datos-entidades-clave) para el modelo conceptual):

- **Catálogo:** `Product`, `Brand`, `Category`, `VehicleMake`, `VehicleModel`, `VehicleFitment`
- **Inventario:** `Stock` (caché actual), `InventoryMovement` (fuente de verdad), `Warehouse`
- **Comercial:** `Customer`, `Supplier`, `Quotation` + `QuotationItem`, `Sale` + `SaleItem`, `PurchaseEntry` + `PurchaseEntryItem`
- **Caja:** `CashTransaction`, `ExpenseCategory`
- **Settings:** `User`, `CompanySettings`

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
pnpm --filter @inventory/api build
./run.sh dev
```

### `Cannot find module '@inventory/shared'` o `Cannot find module '.../packages/shared/src/enums'`

El paquete `@inventory/shared` se consume **en runtime** desde la api (CommonJS). Si modificás algo en `packages/shared/src/`, tenés que rebuildear:

```bash
pnpm --filter @inventory/shared build
```

O dejá tsc en watch en otra terminal:

```bash
pnpm --filter @inventory/shared dev
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
SEED_ADMIN_EMAIL=otro@ejemplo.com SEED_ADMIN_PASSWORD=otra-pass pnpm --filter @inventory/api db:seed
```

Si el admin ya existe, **el seed no lo recrea** — borralo manualmente primero o cambialo desde la pantalla de Configuración (cuando exista).

---

## Próximas fases

Cada fase es un PR independiente con verificación end-to-end al cierre. Ver [PLAN.md](PLAN.md#plan-de-implementación-por-fases) para el detalle.

**Fase 2 (siguiente):** CRUD de productos con tabs *Datos / Precios y stock / Compatibilidad vehicular*, búsqueda paginada por SKU/partNumber/barcode/descripción, búsqueda por compatibilidad ("qué tengo para Toyota Corolla 2015").

---

## Soporte

Si te trabás con algo y este README no lo cubre, agregalo acá cuando lo resuelvas. La idea es que un dev nuevo pueda llegar a `./run.sh dev` y hacer login en menos de 15 minutos sin preguntar nada.
