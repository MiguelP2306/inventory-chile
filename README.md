# Sistema de Gestión de Inventario

Monorepo con backend NestJS y frontend Next.js para gestión de inventario, cotizaciones, ventas y caja de una importadora de repuestos automotrices.

## Stack

- **Frontend** ([apps/web](apps/web/)): Next.js 15 (App Router) + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Hook Form + Zod
- **Backend** ([apps/api](apps/api/)): NestJS 10 + TypeScript + TypeORM 0.3 + MySQL 8 + JWT
- **Compartido** ([packages/shared](packages/shared/)): tipos, enums y schemas Zod
- **Gestor de paquetes:** pnpm (workspaces) — fijado vía `packageManager` en el `package.json` raíz

## Requisitos

- Node.js `>=20.11` (recomendado 22 — ver [.nvmrc](.nvmrc))
- Docker + Docker Compose (para MySQL local)
- pnpm — se habilita automáticamente con `corepack enable`

## Primer arranque

```bash
# 1. Habilitar pnpm vía corepack (una sola vez por máquina)
corepack enable

# 2. Instalar dependencias del workspace
pnpm install

# 3. Copiar las variables de entorno
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local

# 4. Levantar MySQL en Docker
pnpm db:up

# 5. Levantar api + web en paralelo
pnpm dev
```

- API: http://localhost:4000/api/health
- Web: http://localhost:3000

## Comandos del workspace

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Levanta `api` y `web` en paralelo |
| `pnpm build` | Build de todos los paquetes |
| `pnpm lint` | Lint de todos los paquetes |
| `pnpm typecheck` | Type-check de todos los paquetes |
| `pnpm format` | Prettier sobre todo el repo |
| `pnpm db:up` | Levanta el contenedor de MySQL |
| `pnpm db:down` | Apaga el contenedor de MySQL |
| `pnpm db:logs` | Sigue los logs de MySQL |

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
├── docker-compose.yml
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── PLAN.md          # Plan de implementación por fases
```

## Estado actual

**Fase 0 — Bootstrap del monorepo** — completa. Próximo paso: Fase 1 (entidades TypeORM, migraciones, seeds y autenticación JWT). Ver [PLAN.md](PLAN.md) para el plan completo.
