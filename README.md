# Sistema de Gestión de Inventario

Monorepo con backend NestJS y frontend Next.js para gestión de inventario, cotizaciones, ventas y caja de una importadora de repuestos automotrices.

## Stack

- **Frontend** ([apps/web](apps/web/)): Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Hook Form + Zod
- **Backend** ([apps/api](apps/api/)): NestJS 10 + TypeScript + TypeORM 0.3 + MySQL 8 + JWT
- **Compartido** ([packages/shared](packages/shared/)): tipos, enums y schemas Zod
- **Gestor de paquetes:** pnpm (workspaces) — fijado vía `packageManager` en el `package.json` raíz

## Requisitos

- Node.js `>=20.11` (recomendado 22 — ver [.nvmrc](.nvmrc))
- pnpm — se habilita automáticamente con `corepack enable`
- MySQL 8 corriendo localmente en `127.0.0.1:3306` (instalado vía Homebrew, MySQL Installer o el paquete que prefieras)

## Primer arranque

```bash
# 1. Habilitar pnpm vía corepack (una sola vez por máquina)
corepack enable

# 2. Instalar dependencias del workspace
pnpm install

# 3. Asegurate de que tu MySQL local esté corriendo
#    Homebrew:           brew services start mysql
#    Instalador oficial: System Settings -> MySQL -> Start MySQL Server

# 4. Crear la base 'inventory' y el usuario en tu MySQL local
#    (te pide la contraseña de root)
./run.sh db:init

# 5. Arrancar api + web (copia .env.local automáticamente si no existen)
./run.sh dev
```

- API: http://localhost:4000/api/health
- Web: http://localhost:3000

## Conexión a la DB

| Campo | Valor |
| --- | --- |
| Host | `127.0.0.1` |
| Puerto | `3306` |
| Usuario | `inventory` |
| Contraseña | `inventory` |
| Base | `inventory` |

Estos valores los usa la API ([apps/api/.env.example](apps/api/.env.example)) y son los mismos que podés cargar en MySQL Workbench.

Si querés cambiar usuario/contraseña, editá [scripts/init-db.sql](scripts/init-db.sql) y [apps/api/.env.local](apps/api/.env.example).

## Comandos del workspace

| Comando | Qué hace |
| --- | --- |
| `./run.sh build` | Instala deps y compila shared/api/web |
| `./run.sh dev` | Verifica MySQL local y arranca api+web en watch |
| `./run.sh stop` | Detiene los procesos node de api y web |
| `./run.sh status` | Muestra puertos 3000/4000/3306 y procesos activos |
| `./run.sh db:init` | Crea base e usuario en tu MySQL local |
| `pnpm dev` | Equivalente a `./run.sh dev` pero en foreground |
| `pnpm build` | Build de todos los paquetes |
| `pnpm lint` | Lint de todos los paquetes |
| `pnpm typecheck` | Type-check de todos los paquetes |
| `pnpm format` | Prettier sobre todo el repo |

### Comandos específicos por app

```bash
# Solo backend
pnpm --filter @inventory/api dev

# Solo frontend
pnpm --filter @inventory/web dev

# Migraciones (a partir de Fase 1)
pnpm --filter @inventory/api db:migrate
pnpm --filter @inventory/api db:migrate:generate src/database/migrations/NombreMigracion
pnpm --filter @inventory/api db:migrate:revert
pnpm --filter @inventory/api db:seed
```

## Estructura del repo

```
inventory-management/
├── apps/
│   ├── api/         # NestJS — REST API + TypeORM + MySQL
│   └── web/         # Next.js — UI + auth + dashboard
├── packages/
│   └── shared/      # tipos, enums y DTOs compartidos
├── scripts/
│   └── init-db.sql  # crea base 'inventory' y usuario en MySQL local
├── run.sh           # helper para build/dev/stop/db:init
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── PLAN.md          # Plan de implementación por fases
```

## Estado actual

**Fase 0 — Bootstrap del monorepo** — completa. Próximo paso: Fase 1 (entidades TypeORM, migraciones, seeds y autenticación JWT). Ver [PLAN.md](PLAN.md) para el plan completo.
